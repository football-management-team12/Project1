"""Optional inclusive BookingDate range preserves old list contracts and roles."""
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from app import app
from services.jwt_service import create_access_token


class BookingDateFilterTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET": "booking-date-fixture"})
        env.start()
        self.addCleanup(env.stop)
        self.conn = MagicMock()
        self.cur = self.conn.cursor.return_value
        db = patch("routes.booking.get_connection", return_value=self.conn)
        db.start()
        self.addCleanup(db.stop)
        self.cur.fetchall.return_value = []
        self.cur.fetchone.return_value = Row(UserID=1, FullName="QA", Role="ADMIN", Status="ACTIVE")
        self.client = app.test_client()

    def get(self, query="", role="ADMIN"):
        return self.client.get("/api/bookings/" + query, headers={"Authorization": "Bearer " + create_access_token(1, role)})

    def test_invalid_or_incomplete_ranges_fail_before_connection(self):
        for query in ("?from=2026-11-16", "?to=2026-11-20", "?from=&to=2026-11-20",
                      "?from=2026-11-20&to=2026-11-16", "?from=2026-02-30&to=2026-03-01",
                      "?from=2026-1-1&to=2026-11-20", "?from=0001-01-01&to=2026-11-20",
                      "?from=2026-11-16&from=2026-11-17&to=2026-11-20",
                      "?from=2026-11-16&to=2026-11-20' OR 1=1--"):
            response = self.get(query)
            self.assertEqual(response.status_code, 400, query)
            self.assertEqual(response.json["code"], "INVALID_DATE_RANGE")
        self.conn.cursor.assert_not_called()

    def test_range_is_inclusive_parameterized_and_combines_status_search(self):
        response = self.get("?from=2026-11-16&to=2026-11-20&status=CANCELLED&search=QA")
        self.assertEqual(response.status_code, 200)
        query, *params = self.cur.execute.call_args.args
        self.assertIn("B.BookingDate >= ? AND B.BookingDate <= ?", query)
        self.assertNotIn("2026-11-16", query)
        self.assertEqual(params[:3], ["2026-11-16", "2026-11-20", "CANCELLED"])
        self.assertEqual(params[3:], ["%QA%"] * 6)
        self.assertEqual(response.json["Bookings"], [])
        self.conn.commit.assert_not_called()

    def test_same_day_past_future_and_leap_day_are_allowed_for_managers(self):
        for role in ("ADMIN", "STAFF"):
            self.cur.fetchone.return_value = Row(UserID=1, FullName="QA", Role=role, Status="ACTIVE")
            for day in ("2024-02-29", "2026-11-16", "2030-01-01"):
                response = self.get(f"?from={day}&to={day}", role)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(self.cur.execute.call_args.args[1:], (day, day))

    def test_no_range_keeps_existing_all_history_contract(self):
        self.assertEqual(self.get().status_code, 200)
        self.assertNotIn("B.BookingDate >= ?", self.cur.execute.call_args.args[0])
        self.assertEqual(self.cur.execute.call_args.args[1:], ())

    def test_customer_and_unauthenticated_cannot_use_manager_filter(self):
        self.assertEqual(self.get("?from=2026-11-16&to=2026-11-16", "CUSTOMER").status_code, 403)
        self.assertEqual(self.client.get("/api/bookings/?from=2026-11-16&to=2026-11-16").status_code, 401)
        self.conn.cursor.assert_not_called()
