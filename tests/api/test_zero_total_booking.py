"""T123-161 free booking confirmation, no financial fabrication, role regressions."""
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
from routes.uc09 import uc09_bp
from services.jwt_service import create_access_token


class ZeroTotalBookingTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET":"zero-total-isolated-key", "PAYMENT_DEMO_MODE":"true"})
        env.start()
        self.addCleanup(env.stop)
        app = Flask(__name__)
        app.register_blueprint(payment_bp, url_prefix="/api")
        app.register_blueprint(uc09_bp, url_prefix="/api")
        self.client = app.test_client()
        self.conn = MagicMock()
        self.cur = self.conn.cursor.return_value
        db = patch("services.payment_service.get_connection", return_value=self.conn)
        db.start()
        self.addCleanup(db.stop)
        self.now = datetime(2026,11,10,3)
        self.user = Row(UserID=1, Role="CUSTOMER", Status="ACTIVE")

    def booking(self, status="PENDING", total=0):
        return Row(BookingID=10, UserID=1, FieldID=5, BookingDate=self.now.date(), StartTime="18:00", EndTime="19:00",
                   TotalAmount=total, Status=status, CreatedAt=self.now)

    def payment(self):
        return Row(PaymentID=7, BookingID=10, PaymentType="DEPOSIT", PaymentMethod="VIETQR", Amount=200000,
                   Status="PENDING", Reference="BOOKING-10-DEPOSIT", Deadline=self.now+timedelta(minutes=10),
                   CreatedAt=self.now, UpdatedAt=self.now)

    def request(self, method="post", role="CUSTOMER", body=None):
        return getattr(self.client,method)("/api/bookings/10/deposit", json=body,
            headers={"Authorization":"Bearer "+create_access_token(1,role)})

    def seed_free(self, status="PENDING"):
        self.cur.fetchone.side_effect = [self.user,self.booking(status),None,None,None,self.booking("CONFIRMED")]

    def assert_no_financial_creation(self):
        self.assertFalse(any(c.args[0].lstrip().upper().startswith("INSERT") for c in self.cur.execute.call_args_list))

    def test_free_confirmation_returns_200_without_payment_or_qr(self):
        self.seed_free()
        response = self.request()
        self.assertEqual(response.status_code,200)
        self.assertFalse(response.json["requiresDeposit"])
        self.assertEqual(response.json["booking"]["status"],"CONFIRMED")
        self.assertEqual(response.json["depositAmount"],0)
        self.assertEqual(response.json["currentPaymentStatus"],"NOT_REQUIRED")
        self.assertIsNone(response.json["paymentId"])
        self.assertIsNone(response.json["vietQr"])
        self.assert_no_financial_creation()
        self.conn.commit.assert_called_once()

    def test_missing_and_negative_total_are_not_treated_as_free(self):
        for total in (None,-100):
            for method in ("get","post"):
                self.cur.fetchone.side_effect=[self.user,self.booking(total=total)]
                response=self.request(method)
                self.assertEqual(response.status_code,409)
                self.assertEqual(response.json["code"],"INVALID_BOOKING_AMOUNT")
        self.conn.commit.assert_not_called()
        self.assert_no_financial_creation()

    def test_stale_pending_deposit_is_expired_not_marked_success(self):
        self.seed_free()
        self.assertEqual(self.request().status_code,200)
        update = next(c for c in self.cur.execute.call_args_list if "UPDATE Payments" in c.args[0])
        self.assertIn("Status='EXPIRED'",update.args[0])
        self.assertIn("Status='PENDING'",update.args[0])
        self.assertIn("PaymentType='DEPOSIT'",update.args[0])
        self.assert_no_financial_creation()

    def test_repeat_confirmation_is_idempotent(self):
        self.seed_free("CONFIRMED")
        self.assertEqual(self.request().status_code,200)
        update = next(c.args[0] for c in self.cur.execute.call_args_list if "UPDATE Bookings" in c.args[0])
        self.assertIn("Status='PENDING'",update)
        self.assert_no_financial_creation()

    def test_free_get_does_not_confirm_or_expire_booking(self):
        self.cur.fetchone.side_effect = [self.user,self.booking(),None,None]
        response = self.request("get")
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json["booking"]["status"],"PENDING")
        self.assertIsNone(response.json["deadline"])
        self.assertFalse(response.json["demoMode"])
        self.assertFalse(any(c.args[0].lstrip().startswith("UPDATE") for c in self.cur.execute.call_args_list))

    def test_cancelled_and_completed_cannot_be_reconfirmed(self):
        for status in ("CANCELLED","COMPLETED"):
            self.cur.fetchone.side_effect=[self.user,self.booking(status)]
            self.assertEqual(self.request().status_code,409)
        self.conn.commit.assert_not_called()

    def test_successful_historical_receipt_blocks_free_confirmation(self):
        self.cur.fetchone.side_effect=[self.user,self.booking(),Row(PaymentID=99)]
        response=self.request()
        self.assertEqual(response.status_code,409)
        self.assertEqual(response.json["code"],"PAYMENT_MISMATCH")
        self.conn.commit.assert_not_called()

    def test_inconsistent_invoice_is_not_silently_rewritten(self):
        self.cur.fetchone.side_effect=[self.user,self.booking(),None,Row(Amount=600000,PaidAmount=0)]
        response=self.request()
        self.assertEqual(response.status_code,409)
        self.assertEqual(response.json["code"],"INVOICE_MISMATCH")
        self.conn.commit.assert_not_called()

    def test_pending_review_blocks_free_confirmation(self):
        self.cur.fetchone.side_effect=[self.user,self.booking(),None,None,Row(RequestID=5)]
        response=self.request()
        self.assertEqual(response.status_code,409)
        self.assertEqual(response.json["code"],"REQUEST_PENDING")
        self.conn.commit.assert_not_called()

    def test_roles_ownership_and_inactive_account(self):
        self.assertEqual(self.request(role="ADMIN").status_code,403)
        self.assertEqual(self.request(role="STAFF").status_code,403)
        self.conn.cursor.assert_not_called()
        self.cur.fetchone.side_effect=[self.user,None]
        self.assertEqual(self.request().status_code,404)
        self.cur.fetchone.side_effect=[Row(UserID=1,Role="CUSTOMER",Status="INACTIVE")]
        self.assertEqual(self.request().status_code,403)
        self.conn.commit.assert_not_called()

    def test_client_cannot_turn_positive_booking_into_free_booking(self):
        self.cur.fetchone.side_effect=[self.user,self.booking(total=600000),None,(self.now,),None,(0,),self.payment()]
        response=self.request(body={"amount":0,"TotalAmount":0})
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.json["amount"],200000)
        self.assertIsNotNone(response.json["paymentId"])

    def test_booking_update_failure_rolls_back_expired_attempts(self):
        self.cur.fetchone.side_effect=[self.user,self.booking(),None,None,None]
        def execute(sql,*args):
            if "UPDATE Bookings" in sql:
                raise RuntimeError("Synthetic confirmation failure")
        self.cur.execute.side_effect=execute
        with patch("builtins.print"):
            self.assertEqual(self.request().status_code,500)
        self.conn.rollback.assert_called_once()
        self.conn.commit.assert_not_called()

    def test_free_booking_with_no_receipts_cannot_be_charged_by_uc09(self):
        booking=Row(BookingID=10,UserID=1,TotalAmount=0,Status="COMPLETED",InvoiceID=None)
        self.cur.fetchone.side_effect=[Row(Role="ADMIN",Status="ACTIVE"),booking,(0,0,0)]
        with patch("services.invoice_cash_service.get_connection",return_value=self.conn):
            response=self.client.post("/api/admin/bookings/10/confirm-final-payment",
                headers={"Authorization":"Bearer "+create_access_token(2,"ADMIN")})
        self.assertEqual(response.status_code,409)
        self.assert_no_financial_creation()

    def test_stale_demo_attempt_cannot_collect_for_free_booking(self):
        payment=self.payment()
        payment.BookingStatus="CONFIRMED"
        payment.BookingTotalAmount=0
        self.cur.fetchone.side_effect=[self.user,payment,(self.now,)]
        response=self.client.patch("/api/payments/7/demo-status",json={"status":"SUCCESS"},
            headers={"Authorization":"Bearer "+create_access_token(1,"CUSTOMER")})
        self.assertEqual(response.status_code,409)
        self.assertEqual(response.json["code"],"BOOKING_NOT_PAYABLE")
        self.conn.commit.assert_not_called()


if __name__=="__main__":
    unittest.main()
