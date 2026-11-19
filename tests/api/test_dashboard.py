"""Read-only dashboard contracts, live role validation and calendar boundaries."""

import os
import sys
import unittest
from datetime import date, time
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from app import app
from services.jwt_service import create_access_token


class DashboardTests(unittest.TestCase):
    def setUp(self):
        secret = patch.dict(os.environ, {"JWT_SECRET": "dashboard-fixture"})
        secret.start()
        self.addCleanup(secret.stop)
        self.conn = MagicMock()
        self.cur = self.conn.cursor.return_value
        db = patch("routes.dashboard.get_connection", return_value=self.conn)
        db.start()
        self.addCleanup(db.stop)
        self.client = app.test_client()
        self.path = "/api/management/dashboard/schedule?date=2026-11-16"

    def headers(self, role="ADMIN"):
        return {"Authorization": "Bearer " + create_access_token(1, role)}

    def test_authentication_before_database(self):
        self.assertEqual(self.client.get(self.path).status_code, 401)
        self.assertEqual(self.client.get(self.path, headers=self.headers("CUSTOMER")).status_code, 403)
        self.conn.cursor.assert_not_called()

    def test_admin_and_staff_get_same_schedule_without_payment_data(self):
        for role in ("ADMIN", "STAFF"):
            self.cur.fetchone.side_effect = [Row(Role=role, Status="ACTIVE"), (12,)]
            self.cur.fetchall.return_value = [Row(
                BookingID=10, BookingDate=date(2026, 11, 16),
                StartTime=time(6), EndTime=time(8), Status="CONFIRMED",
                FieldName="Sân 1", FullName="QA", Phone="0900000000",
            )]
            response = self.client.get(self.path, headers=self.headers(role))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["total"], 12)
            self.assertEqual(response.json["items"][0]["status"], "CONFIRMED")
            self.assertEqual(response.json["items"][0]["startTime"], "06:00")
            self.assertNotIn("paidAmount", response.json["items"][0])
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(self.cur.execute.call_args.args[1:], ("2026-11-16",))
            self.assertIn("TOP (7)", self.cur.execute.call_args.args[0])
            self.assertIn("ORDER BY B.StartTime", self.cur.execute.call_args.args[0])
        self.conn.commit.assert_not_called()
        self.assertTrue(all(call.args[0].lstrip().startswith("SELECT") for call in self.cur.execute.call_args_list))

    def test_revoked_role_or_inactive_account_is_rejected(self):
        for actor in (None, Row(Role="CUSTOMER", Status="ACTIVE"), Row(Role="ADMIN", Status="INACTIVE")):
            self.cur.fetchone.side_effect = None
            self.cur.fetchone.return_value = actor
            self.assertEqual(self.client.get(self.path, headers=self.headers()).status_code, 403)
        self.cur.fetchall.assert_not_called()

    def test_invalid_dates_do_not_open_connection(self):
        for day in ("2026-02-30", "2026-1-1", "garbage", "2026-11-16'", ""):
            response = self.client.get(self.path.split("?")[0] + "?date=" + day, headers=self.headers())
            self.assertEqual(response.status_code, 400)
        self.conn.cursor.assert_not_called()

    def test_empty_schedule_returns_real_zero(self):
        self.cur.fetchone.side_effect = [Row(Role="ADMIN", Status="ACTIVE"), (0,)]
        self.cur.fetchall.return_value = []
        response = self.client.get(self.path, headers=self.headers())
        self.assertEqual(response.json, {"date": "2026-11-16", "total": 0, "items": []})

    def test_database_errors_are_not_exposed_and_connection_closes(self):
        self.cur.execute.side_effect = RuntimeError("private DB details")
        with self.assertLogs(app.logger, level="ERROR"):
            response = self.client.get(self.path, headers=self.headers())
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private", response.get_data(as_text=True))
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()
