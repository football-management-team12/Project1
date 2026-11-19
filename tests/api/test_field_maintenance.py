"""Maintenance preserves reservations and payments; all new bookings are blocked."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.booking import booking_bp
from services import field_management_service as fields
from services.jwt_service import create_access_token


class FieldMaintenanceTests(unittest.TestCase):
    def test_maintenance_with_existing_bookings_only_updates_field(self):
        cursor = MagicMock()
        field = Row(IsArchived=False)
        with patch.object(fields, "get_field", return_value=field), \
             patch.object(fields, "get_field_details", return_value={"Status": "MAINTENANCE"}), \
             patch.object(fields, "has_active_bookings", return_value=True) as active:
            result = fields.set_field_status(cursor, 1, "MAINTENANCE")
        self.assertEqual(result["Status"], "MAINTENANCE")
        active.assert_not_called()
        cursor.execute.assert_called_once()
        sql, status, field_id = cursor.execute.call_args.args
        self.assertIn("UPDATE dbo.FootballFields", sql)
        self.assertNotIn("Bookings", sql)
        self.assertNotIn("Payments", sql)
        self.assertEqual((status, field_id), ("MAINTENANCE", 1))

    def test_reopen_and_archived_field_rules(self):
        cursor = MagicMock()
        with patch.object(fields, "get_field", return_value=Row(IsArchived=False)), \
             patch.object(fields, "get_field_details", return_value={}):
            fields.set_field_status(cursor, 1, "AVAILABLE")
        self.assertEqual(cursor.execute.call_args.args[1], "AVAILABLE")
        with patch.object(fields, "get_field", return_value=Row(IsArchived=True)):
            with self.assertRaises(fields.FieldManagementError):
                fields.set_field_status(cursor, 1, "MAINTENANCE")

    def test_archive_still_protects_existing_bookings(self):
        with patch.object(fields, "get_field", return_value=Row(IsArchived=False)), \
             patch.object(fields, "has_active_bookings", return_value=True):
            with self.assertRaises(fields.FieldManagementError) as error:
                fields.archive_field(MagicMock(), 1, 1)
        self.assertEqual(error.exception.code, "ACTIVE_BOOKINGS")

    def test_direct_new_booking_for_maintenance_field_rejected(self):
        app = Flask(__name__)
        app.register_blueprint(booking_bp, url_prefix="/api/bookings")
        conn = MagicMock()
        conn.cursor.return_value.fetchone.side_effect = [
            Row(UserID=1, FullName="Test", Role="CUSTOMER", Status="ACTIVE"),
            Row(FieldID=1, Status="MAINTENANCE", IsArchived=False),
        ]
        with patch("routes.booking.get_connection", return_value=conn):
            response = app.test_client().post("/api/bookings/", json={
                "FieldID": 1, "BookingDate": "2099-01-25", "StartTime": "18:00", "EndTime": "19:00",
            }, headers={"Authorization": "Bearer " + create_access_token(1, "CUSTOMER")})
        self.assertEqual(response.status_code, 409)
        conn.commit.assert_not_called()
        self.assertFalse(any("INSERT INTO Bookings" in call.args[0]
                             for call in conn.cursor.return_value.execute.call_args_list))


if __name__ == "__main__":
    unittest.main()
