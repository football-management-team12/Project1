"""T123-164: real JWT/Flask routing, SQL mocks; no live financial writes."""
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


class DemoExpiredBookingTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET": "t123-164-isolated-key", "PAYMENT_DEMO_MODE": "true"})
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
        self.now = datetime(2026, 11, 10, 2)
        self.user = Row(UserID=1, Role="CUSTOMER", Status="ACTIVE")

    def row(self, status="PENDING", **changes):
        fields = dict(PaymentID=7, BookingID=10, PaymentType="DEPOSIT", PaymentMethod="VIETQR",
                      Amount=200000, Status=status, Reference="BOOKING-10-DEPOSIT",
                      Deadline=self.now + timedelta(minutes=5), CreatedAt=self.now,
                      UpdatedAt=self.now, BookingStatus="PENDING", BookingTotalAmount=600000)
        fields.update(changes)
        return Row(**fields)

    def request(self, status="EXPIRED", role="CUSTOMER"):
        return self.client.patch("/api/payments/7/demo-status", json={"status": status},
                                 headers={"Authorization": "Bearer " + create_access_token(1, role)})

    def writes(self):
        return [c for c in self.cur.execute.call_args_list if c.args[0].lstrip().startswith("UPDATE")]

    def test_expire_updates_payment_then_booking_in_one_transaction(self):
        self.cur.fetchone.side_effect = [self.user, self.row(), self.row("EXPIRED")]
        response = self.request()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["payment"]["status"], "EXPIRED")
        self.assertEqual(response.json["payment"]["amount"], 200000)
        writes = self.writes()
        self.assertEqual(len(writes), 2)
        self.assertIn("UPDATE Payments", writes[0].args[0])
        self.assertEqual(writes[0].args[1:], ("EXPIRED", 7))
        self.assertIn("UPDATE B", writes[1].args[0])
        self.assertEqual(writes[1].args[1:], (10, 7))
        self.conn.commit.assert_called_once()
        self.conn.rollback.assert_not_called()

    def test_repeat_expired_repairs_legacy_booking_without_rewriting_payment(self):
        self.cur.fetchone.side_effect = [self.user, self.row("EXPIRED")]
        response = self.request()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.writes()), 1)
        self.assertIn("UPDATE B", self.writes()[0].args[0])
        self.conn.commit.assert_called_once()

    def test_success_and_failed_are_not_changed_to_expired(self):
        for current in ("SUCCESS", "FAILED"):
            self.cur.fetchone.side_effect = [self.user, self.row(current)]
            response = self.request()
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json["code"], "PAYMENT_ALREADY_FINAL")
        self.assertEqual(self.writes(), [])
        self.conn.commit.assert_not_called()

    def test_failed_payment_can_be_retried_without_cancelling_booking(self):
        self.cur.fetchone.side_effect = [self.user, self.row(), self.row("FAILED")]
        self.assertEqual(self.request("FAILED").status_code, 200)
        self.assertEqual(len(self.writes()), 1)
        self.assertIn("UPDATE Payments", self.writes()[0].args[0])

    def test_success_still_confirms_booking(self):
        self.cur.fetchone.side_effect = [self.user, self.row(), (self.now,), None, self.row("SUCCESS")]
        response = self.request("SUCCESS")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(any("'CONFIRMED'" in c.args[0] for c in self.writes()))
        self.assertFalse(any("UPDATE B\n" in c.args[0] for c in self.writes()))

    def test_success_after_deadline_is_rejected(self):
        self.cur.fetchone.side_effect = [self.user, self.row(Deadline=self.now - timedelta(seconds=1)), (self.now,)]
        self.assertEqual(self.request("SUCCESS").status_code, 409)
        self.assertEqual(self.writes(), [])

    def test_role_ownership_and_inactive_account(self):
        for role in ("ADMIN", "STAFF"):
            self.assertEqual(self.request(role=role).status_code, 403)
        self.conn.cursor.assert_not_called()
        self.cur.fetchone.side_effect = [self.user, None]
        self.assertEqual(self.request().status_code, 404)
        self.cur.fetchone.side_effect = [Row(UserID=1, Role="CUSTOMER", Status="INACTIVE")]
        self.assertEqual(self.request().status_code, 403)
        self.assertEqual(self.writes(), [])

    def test_non_deposit_payment_is_rejected(self):
        self.cur.fetchone.side_effect = [self.user, self.row(PaymentType="FINAL_PAYMENT")]
        self.assertEqual(self.request().status_code, 409)
        self.assertEqual(self.writes(), [])

    def test_demo_disabled_prevents_any_database_access(self):
        with patch.dict(os.environ, {"PAYMENT_DEMO_MODE": "false"}):
            self.assertEqual(self.request().status_code, 403)
        self.conn.cursor.assert_not_called()

    def test_booking_sync_failure_rolls_back_payment_expiry(self):
        self.cur.fetchone.side_effect = [self.user, self.row()]
        def execute(sql, *args):
            if "UPDATE B\n" in sql:
                raise RuntimeError("Synthetic booking update failure")
        self.cur.execute.side_effect = execute
        with patch("builtins.print"):
            self.assertEqual(self.request().status_code, 500)
        self.conn.rollback.assert_called_once()
        self.conn.commit.assert_not_called()

    def test_response_serialized_before_commit(self):
        self.cur.fetchone.side_effect = [self.user, self.row(), self.row("EXPIRED")]
        with patch("services.payment_service._payment_dict", side_effect=RuntimeError("Synthetic format failure")), patch("builtins.print"):
            self.assertEqual(self.request().status_code, 500)
        self.conn.rollback.assert_called_once()
        self.conn.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
