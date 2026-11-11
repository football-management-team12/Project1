"""Booking progress must not bypass deposits or the scheduled end time."""
import os
import sys
import unittest
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from app import app
from services.jwt_service import create_access_token


class BookingPaymentStateTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET": "booking-state-test-only"})
        env.start()
        self.addCleanup(env.stop)
        self.conn = MagicMock()
        self.cur = self.conn.cursor.return_value
        db = patch("routes.booking.get_connection", return_value=self.conn)
        db.start()
        self.addCleanup(db.stop)
        self.client = app.test_client()
        self.headers = {"Authorization": "Bearer " + create_access_token(1, "ADMIN")}
        self.manager = Row(UserID=1, Role="ADMIN", Status="ACTIVE", FullName="QA")

    def booking(self, **values):
        fields = dict(BookingID=10, UserID=2, FieldID=5, BookingDate=date(2026, 1, 1),
                      StartTime="18:00", EndTime="19:00", TotalAmount=350000, Status="CONFIRMED",
                      CreatedAt=datetime(2026, 1, 1), HasEnded=1, DepositAmount=100000, PaidAmount=100000)
        fields.update(values)
        return Row(**fields)

    def change(self, status="COMPLETED"):
        return self.client.patch("/api/bookings/10/status", json={"Status": status}, headers=self.headers)

    def test_no_deposit_cannot_confirm_or_complete(self):
        for status, current in (("CONFIRMED", "PENDING"), ("COMPLETED", "CONFIRMED")):
            self.cur.fetchone.side_effect = [self.manager, self.booking(Status=current), (0,)]
            response = self.change(status)
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json["code"], "DEPOSIT_REQUIRED")
        self.assertFalse(any(c.args[0].lstrip().startswith("UPDATE Bookings") for c in self.cur.execute.call_args_list))

    def test_paid_booking_cannot_complete_before_end(self):
        self.cur.fetchone.side_effect = [self.manager, self.booking(HasEnded=0), (100000,)]
        response = self.change()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json["code"], "BOOKING_NOT_ENDED")
        self.conn.commit.assert_not_called()

    def test_deposit_paid_ended_booking_can_complete_with_balance_remaining(self):
        self.cur.fetchone.side_effect = [self.manager, self.booking(), (100000,), self.booking(Status="COMPLETED")]
        response = self.change()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["Booking"]["RemainingAmount"], 250000)
        self.assertEqual(response.json["Status"], "COMPLETED")
        self.conn.commit.assert_called_once()

    def test_free_booking_needs_no_deposit_but_must_end_before_completion(self):
        self.cur.fetchone.side_effect = [self.manager, self.booking(TotalAmount=0),
                                        self.booking(TotalAmount=0, Status="COMPLETED", DepositAmount=0, PaidAmount=0)]
        self.assertEqual(self.change().status_code, 200)
        self.cur.fetchone.side_effect = [self.manager, self.booking(TotalAmount=0, HasEnded=0)]
        self.assertEqual(self.change().json["code"], "BOOKING_NOT_ENDED")

    def test_invalid_total_does_not_write(self):
        for total in (None, -1):
            self.cur.fetchone.side_effect = [self.manager, self.booking(TotalAmount=total)]
            self.assertEqual(self.change().json["code"], "INVALID_TOTAL")
        self.conn.commit.assert_not_called()

    def test_paid_totals_include_final_and_extra_in_detail_and_list_queries(self):
        self.cur.fetchone.side_effect = [self.manager, self.booking(PaidAmount=350000, Status="COMPLETED")]
        response = self.client.get("/api/bookings/10", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["PaidAmount"], 350000)
        self.assertEqual(response.json["RemainingAmount"], 0)
        self.assertTrue(any("IN ('DEPOSIT','FINAL_PAYMENT','EXTRA')" in c.args[0] for c in self.cur.execute.call_args_list))

    def test_inactive_manager_cannot_trigger_expiry(self):
        self.cur.fetchone.return_value = Row(UserID=1, Role="ADMIN", Status="INACTIVE")
        response = self.client.get("/api/bookings/10", headers=self.headers)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(any(c.args[0].lstrip().startswith("UPDATE") for c in self.cur.execute.call_args_list))

    def test_expiry_error_rolls_back(self):
        self.cur.fetchone.return_value = self.manager
        with patch("routes.booking.cancel_overdue_unpaid_bookings", side_effect=RuntimeError("QA failure")):
            response = self.client.get("/api/bookings/10", headers=self.headers)
        self.assertEqual(response.status_code, 500)
        self.conn.rollback.assert_called_once()
        self.conn.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
