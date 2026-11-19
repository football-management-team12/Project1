"""T123-166: exercise the real UC07 route/service with JWT and mocked SQL."""
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from flask import Flask
from routes.cancellation import cancellation_bp
from services.jwt_service import create_access_token


class CancellationReviewTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET": "cancellation-review-test-secret-only"})
        env.start()
        self.addCleanup(env.stop)
        app = Flask(__name__)
        app.register_blueprint(cancellation_bp, url_prefix="/api")
        self.client = app.test_client()
        self.database = patch("services.cancellation_request_service.get_connection")
        self.connection = self.database.start()
        self.addCleanup(self.database.stop)
        self.token = create_access_token(1, "ADMIN")

    def post(self, body, token=None):
        return self.client.post("/api/admin/cancellation-requests/10/decision", json=body,
                                headers={"Authorization": "Bearer " + (token or self.token)})

    def test_blank_rejection_never_opens_database(self):
        for body in ({"decision": "REJECTED"}, *(
            {"decision": "REJECTED", "note": note}
            for note in (None, "", "   ", "\t\n", "\u00a0")
        )):
            with self.subTest(body=body):
                response = self.post(body)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json()["code"], "REVIEW_NOTE_REQUIRED")
        self.connection.assert_not_called()

    def test_invalid_note_types_and_length_never_open_database(self):
        for note in (0, False, [], {}, "x" * 501):
            with self.subTest(note=note):
                response = self.post({"decision": "REJECTED", "note": note})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json()["code"], "INVALID_TEXT")
        self.connection.assert_not_called()

    def test_valid_rejection_records_trimmed_note_and_keeps_booking(self):
        conn = self.connection.return_value
        cursor = conn.cursor.return_value
        cursor.rowcount = 1
        cursor.fetchone.side_effect = [(20,), SimpleNamespace(
            BookingID=20, Status="PENDING_REVIEW")]
        with patch("services.cancellation_request_service.rules._check_actor", return_value="ADMIN"), \
             patch("services.cancellation_request_service.rules._get_booking",
                   return_value=SimpleNamespace(Status="CONFIRMED")):
            response = self.post({"decision": "REJECTED", "note": "  Khong du dieu kien  "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "REJECTED")
        self.assertEqual(response.get_json()["bookingStatus"], "CONFIRMED")
        updates = [call.args for call in cursor.execute.call_args_list
                   if call.args[0].lstrip().startswith("UPDATE")]
        self.assertEqual(len(updates), 1)
        self.assertIn("UPDATE dbo.BookingCancellationRequests", updates[0][0])
        self.assertEqual(updates[0][1:], ("REJECTED", 1, "Khong du dieu kien", 10))
        conn.commit.assert_called_once()
        conn.rollback.assert_not_called()

    def test_approval_does_not_require_note(self):
        conn = self.connection.return_value
        cursor = conn.cursor.return_value
        cursor.rowcount = 1
        cursor.fetchone.side_effect = [(20,), SimpleNamespace(
            BookingID=20, Status="PENDING_REVIEW", Reason="Test reason"), None, (30,)]
        with patch("services.cancellation_request_service.rules._check_actor", return_value="ADMIN"), \
             patch("services.cancellation_request_service.rules._get_booking",
                   return_value=SimpleNamespace(Status="CONFIRMED", BookingDate="2099-01-01", StartTime="18:00")), \
             patch("services.cancellation_request_service.rules._payment_summary", return_value=(0, False)), \
             patch("services.cancellation_request_service.rules._paid_invoice_exists", return_value=False), \
             patch("services.cancellation_request_service.rules._booking_now", return_value=datetime(2026,11,16)), \
             patch("services.cancellation_request_service.rules._rule_violation", return_value=None):
            response = self.post({"decision": "APPROVED"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "APPROVED")
        self.assertEqual(response.get_json()["bookingStatus"], "CANCELLED")
        conn.commit.assert_called_once()

    def test_authentication_and_admin_role_are_required(self):
        response = self.client.post("/api/admin/cancellation-requests/10/decision",
                                    json={"decision": "REJECTED"})
        self.assertEqual(response.status_code, 401)
        response = self.post({"decision": "REJECTED", "note": "reason"},
                             token=create_access_token(2, "CUSTOMER"))
        self.assertEqual(response.status_code, 403)
        self.connection.assert_not_called()

    def test_approval_after_start_is_blocked_without_cancelling_booking(self):
        conn = self.connection.return_value
        cursor = conn.cursor.return_value
        cursor.fetchone.side_effect = [(20,), SimpleNamespace(BookingID=20, Status="PENDING_REVIEW", Reason="Test")]
        with patch("services.cancellation_request_service.rules._check_actor", return_value="ADMIN"), \
             patch("services.cancellation_request_service.rules._get_booking", return_value=SimpleNamespace(Status="CONFIRMED", BookingDate="2026-11-16", StartTime="06:00")), \
             patch("services.cancellation_request_service.rules._booking_now", return_value=datetime(2026,11,16,6)):
            response = self.post({"decision":"APPROVED"})
        self.assertEqual(response.status_code,409)
        self.assertEqual(response.json["code"],"BOOKING_ALREADY_STARTED")
        conn.commit.assert_not_called()
        conn.rollback.assert_called_once()
        self.assertFalse(any("UPDATE dbo.Bookings" in call.args[0] for call in cursor.execute.call_args_list))

    def test_customer_timely_request_is_not_lost_due_to_late_admin_review(self):
        conn=self.connection.return_value;cur=conn.cursor.return_value;cur.rowcount=1
        req=SimpleNamespace(BookingID=20,Status="PENDING_REVIEW",Reason="Timely request",RequestedAt=datetime(2026,11,15,20))
        cur.fetchone.side_effect=[(20,),req,None,(30,)]
        with patch("services.cancellation_request_service.rules._check_actor",return_value="ADMIN"), \
             patch("services.cancellation_request_service.rules._get_booking",return_value=SimpleNamespace(Status="CONFIRMED",BookingDate="2026-11-16",StartTime="06:00",AttendanceState=None)), \
             patch("services.cancellation_request_service.rules._booking_now",return_value=datetime(2026,11,16,6,1)), \
             patch("services.cancellation_request_service.rules._payment_summary",return_value=(100,False)), \
             patch("services.cancellation_request_service.rules._paid_invoice_exists",return_value=False):
            response=self.post({"decision":"APPROVED"})
        self.assertEqual(response.status_code,200)
        conn.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
