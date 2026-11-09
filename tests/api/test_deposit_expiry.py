"""T123-162 deposit GET contract, transaction and authorization regressions."""
import os
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.payment import payment_bp
from services.jwt_service import create_access_token


class DepositExpiryTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET": "t123-162-isolated-key", "PAYMENT_DEMO_MODE": "false"})
        env.start()
        self.addCleanup(env.stop)
        app = Flask(__name__)
        app.register_blueprint(payment_bp, url_prefix="/api")
        self.client = app.test_client()
        self.conn = MagicMock()
        self.cur = self.conn.cursor.return_value
        db = patch("services.payment_service.get_connection", return_value=self.conn)
        db.start()
        self.addCleanup(db.stop)
        self.now = datetime(2026, 11, 10, 1)
        self.user = Row(UserID=1, Role="CUSTOMER", Status="ACTIVE")
        self.booking = Row(BookingID=10, UserID=1, FieldID=5, BookingDate=self.now.date(), StartTime="18:00",
                           EndTime="19:00", TotalAmount=600000, CreatedAt=self.now, Status="PENDING")

    def payment(self, status="EXPIRED", deadline=None):
        return Row(PaymentID=7, BookingID=10, PaymentType="DEPOSIT", PaymentMethod="BANK_TRANSFER",
                   Amount=200000, Status=status, Reference="BOOKING-10-DEPOSIT",
                   Deadline=deadline or self.now - timedelta(minutes=1), CreatedAt=self.now, UpdatedAt=self.now)

    def get(self, role="CUSTOMER"):
        return self.client.get("/api/bookings/10/deposit", headers={"Authorization": "Bearer " + create_access_token(1, role)})

    def seed(self, booking=None, payment=None):
        self.cur.fetchone.side_effect = [self.user, self.booking, booking or self.booking, payment, (self.now,)]

    def test_expired_payment_deadline_is_authoritative_even_with_fresh_booking(self):
        after = Row(**{**vars(self.booking), "Status": "CANCELLED"})
        payment = self.payment()
        self.seed(after, payment)
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["currentPaymentStatus"], "EXPIRED")
        self.assertEqual(response.json["booking"]["status"], "CANCELLED")
        self.assertEqual(response.json["payment"]["status"], "EXPIRED")
        self.assertTrue(response.json["isExpired"])
        self.assertEqual(response.json["deadline"], payment.Deadline.isoformat(timespec="seconds") + "Z")
        writes = [c for c in self.cur.execute.call_args_list if c.args[0].lstrip().startswith("UPDATE")]
        self.assertEqual(len(writes), 2)
        self.assertTrue(all(c.args[-1] == 10 for c in writes))
        self.conn.commit.assert_called_once()
        self.conn.rollback.assert_not_called()

    def test_future_stored_deadline_does_not_use_old_booking_deadline(self):
        self.booking.CreatedAt = self.now - timedelta(hours=1)
        self.seed(payment=self.payment("PENDING", self.now + timedelta(minutes=5)))
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json["isExpired"])
        self.assertEqual(response.json["currentPaymentStatus"], "PENDING")

    def test_successful_payment_remains_successful(self):
        self.seed(Row(**{**vars(self.booking), "Status": "CONFIRMED"}), self.payment("SUCCESS"))
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["currentPaymentStatus"], "SUCCESS")
        self.assertEqual(response.json["booking"]["status"], "CONFIRMED")

    def test_no_payment_uses_booking_fallback(self):
        self.seed()
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["currentPaymentStatus"], "NOT_CREATED")
        self.assertIsNone(response.json["payment"])

    def test_ownership_checked_before_any_expiry_write(self):
        self.cur.fetchone.side_effect = [self.user, None]
        response = self.get()
        self.assertEqual(response.status_code, 404)
        self.assertFalse(any(c.args[0].lstrip().startswith("UPDATE") for c in self.cur.execute.call_args_list))
        self.conn.commit.assert_not_called()
        self.conn.rollback.assert_called_once()

    def test_inactive_and_non_customer_cannot_expire_another_booking(self):
        for role in ("ADMIN", "STAFF"):
            self.assertEqual(self.get(role).status_code, 403)
        self.conn.cursor.assert_not_called()
        self.cur.fetchone.side_effect = [Row(UserID=1, Role="CUSTOMER", Status="INACTIVE")]
        self.assertEqual(self.get().status_code, 403)
        self.conn.commit.assert_not_called()

    def test_payment_update_failure_rolls_back_booking_cancellation(self):
        self.cur.fetchone.side_effect = [self.user, self.booking]
        def execute(sql, *params):
            if "UPDATE P" in sql:
                raise RuntimeError("Synthetic SQL failure")
        self.cur.execute.side_effect = execute
        with patch("builtins.print"):
            response = self.get()
        self.assertEqual(response.status_code, 500)
        self.conn.commit.assert_not_called()
        self.conn.rollback.assert_called_once()

    def test_serialization_failure_does_not_commit_expiry(self):
        self.seed(payment=self.payment())
        with patch("services.payment_service._vietqr", side_effect=RuntimeError("Synthetic response failure")), patch("builtins.print"):
            self.assertEqual(self.get().status_code, 500)
        self.conn.commit.assert_not_called()
        self.conn.rollback.assert_called_once()


if __name__ == "__main__":
    unittest.main()
