"""UC09 regression after UC12 registration; SQL mocked, existing service unchanged."""
import os
import sys
import unittest
from pathlib import Path
from datetime import datetime
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.uc09 import uc09_bp
from routes.admin_invoice import admin_invoice_bp
from services.jwt_service import create_access_token


class CashPaymentRegressionTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET": "uc09-uc12-regression-key"})
        env.start()
        self.addCleanup(env.stop)
        app = Flask(__name__)
        app.register_blueprint(uc09_bp, url_prefix="/api")
        app.register_blueprint(admin_invoice_bp, url_prefix="/api")
        self.client = app.test_client()
        self.conn = MagicMock()
        self.cur = self.conn.cursor.return_value
        db = patch("services.invoice_cash_service.get_connection", return_value=self.conn)
        db.start()
        self.addCleanup(db.stop)
        clock = patch("services.invoice_cash_service.business_now", return_value=datetime(2026,11,16,18))
        clock.start()
        self.addCleanup(clock.stop)
        self.actor = Row(Role="ADMIN", Status="ACTIVE")
        self.headers = {"Authorization": "Bearer " + create_access_token(2, "ADMIN")}

    def row(self, **changes):
        fields = dict(BookingID=10, UserID=1, TotalAmount=100000, Status="COMPLETED", BookingDate="2026-11-16", StartTime="18:00",
                      InvoiceID=20, InvoiceAmount=100000, InvoicePaidAmount=30000, InvoicePaymentStatus="PARTIALLY_PAID")
        fields.update(changes)
        return Row(**fields)

    def confirm(self):
        return self.client.post("/api/admin/bookings/10/confirm-final-payment", headers=self.headers)

    def test_collection_blocked_before_start_and_enabled_at_start(self):
        with patch("services.invoice_cash_service.business_now",return_value=datetime(2026,11,16,17,59,59)):
            self.cur.fetchone.side_effect=[self.actor,self.row(Status="CONFIRMED"),(30000,0,0)]
            response=self.client.get("/api/bookings/10/settlement",headers=self.headers)
            self.assertFalse(response.json["canConfirm"])
            self.assertEqual(response.json["confirmAvailableAt"],"2026-11-16T18:00:00+07:00")
            self.cur.fetchone.side_effect=[self.actor,self.row(Status="CONFIRMED")]
            response=self.confirm()
            self.assertEqual(response.status_code,409)
            self.assertEqual(response.json["code"],"BOOKING_NOT_STARTED")
            self.conn.commit.assert_not_called()

    def test_final_cash_still_records_remaining_and_invoice_atomically(self):
        self.cur.fetchone.side_effect = [self.actor, self.row(), (30000, 0, 0), (51,)]
        response = self.confirm()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["amount"], 70000)
        self.assertEqual(response.json["status"], "PAID")
        self.conn.commit.assert_called_once()
        self.conn.rollback.assert_not_called()
        writes = [c.args[0] for c in self.cur.execute.call_args_list]
        self.assertTrue(any("INSERT INTO Payments" in q for q in writes))
        self.assertTrue(any("UPDATE Invoices" in q for q in writes))
        self.assertFalse(any("InvoiceAdminCancellations" in q for q in writes))

    def test_can_collect_money_before_booking_is_completed(self):
        self.cur.fetchone.side_effect = [self.actor, self.row(Status="CONFIRMED"), (30000, 0, 0)]
        response = self.client.get("/api/bookings/10/settlement", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["canConfirm"])
        self.cur.fetchone.side_effect = [self.actor, self.row(Status="CONFIRMED"), (30000, 0, 0), (51,)]
        response = self.confirm()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["amount"], 70000)
        writes = [call.args[0] for call in self.cur.execute.call_args_list]
        self.assertFalse(any("UPDATE Bookings" in sql for sql in writes))
        self.conn.commit.assert_called_once()

    def test_can_receive_full_amount_at_venue_without_deposit(self):
        self.cur.fetchone.side_effect=[self.actor,self.row(Status="CONFIRMED",InvoicePaidAmount=0),(0,0,0)]
        response=self.client.get("/api/bookings/10/settlement",headers=self.headers)
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.json["canConfirm"])
        self.cur.fetchone.side_effect=[self.actor,self.row(Status="CONFIRMED",InvoicePaidAmount=0),(0,0,0),(51,)]
        response=self.confirm()
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json["amount"],100000)
        self.conn.commit.assert_called_once()
        self.assertTrue(any("Status='EXPIRED'" in call.args[0] and "Status='PENDING'" in call.args[0] for call in self.cur.execute.call_args_list))

    def test_cancelled_and_no_show_refunds_do_not_appear_as_customer_debt(self):
        cases=[
            (dict(Status="CANCELLED",InvoicePaidAmount=100000,RefundedAmount=100000), (30000,70000,0),"REFUNDED",0),
            (dict(Status="CANCELLED",InvoicePaidAmount=100000,RefundedAmount=70000,AttendanceState="NO_SHOW"),(30000,70000,0),"RETAINED_DEPOSIT",30000),
            (dict(Status="CANCELLED",RefundedAmount=0),(30000,0,0),"REFUND_PENDING",30000)]
        for changes,receipts,status,paid in cases:
            self.cur.fetchone.side_effect=[self.actor,self.row(**changes),receipts]
            response=self.client.get("/api/bookings/10/settlement",headers=self.headers)
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json["status"],status)
            self.assertEqual(response.json["paidAmount"],paid)
            self.assertEqual(response.json["remainingAmount"],0)

    def test_already_paid_and_cancelled_booking_cannot_be_charged(self):
        for row, receipts in ((self.row(InvoicePaidAmount=100000, InvoicePaymentStatus="PAID"), (30000, 70000, 0)),
                              (self.row(Status="CANCELLED"), (30000, 0, 0))):
            self.cur.fetchone.side_effect = [self.actor, row, receipts]
            self.assertEqual(self.confirm().status_code, 409)
        self.conn.commit.assert_not_called()
        self.assertFalse(any("INSERT INTO Payments" in c.args[0] for c in self.cur.execute.call_args_list))

    def test_customer_cannot_confirm_final_cash(self):
        headers = {"Authorization": "Bearer " + create_access_token(1, "CUSTOMER")}
        self.assertEqual(self.client.post("/api/admin/bookings/10/confirm-final-payment", headers=headers).status_code, 403)
        self.conn.cursor.assert_not_called()

    def test_extra_payment_reduces_final_cash_insert_to_500000(self):
        self.cur.fetchone.side_effect = [self.actor, self.row(TotalAmount=900000, InvoiceAmount=900000,
                                                             InvoicePaidAmount=300000), (300000, 0, 100000), (51,)]
        response = self.confirm()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["amount"], 500000)
        payment_inserts = [c for c in self.cur.execute.call_args_list if "INSERT INTO Payments" in c.args[0]]
        self.assertEqual(len(payment_inserts), 1)
        self.assertEqual(payment_inserts[0].args[3], 500000)
        self.assertIn("'FINAL_PAYMENT'", payment_inserts[0].args[0])
        self.assertIn("'CASH'", payment_inserts[0].args[0])
        self.conn.commit.assert_called_once()

    def test_partial_final_still_blocks_another_cash_payment(self):
        self.cur.fetchone.side_effect = [self.actor, self.row(), (30000, 10000, 10000)]
        response = self.confirm()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json["code"], "FINAL_PAYMENT_EXISTS")
        self.conn.commit.assert_not_called()

    def test_settlement_can_confirm_with_extra_but_not_existing_final(self):
        for receipts, allowed in (((30000, 0, 10000), True), ((30000, 10000, 10000), False),
                                  ((30000, 0, 70000), False)):
            self.cur.fetchone.side_effect = [self.actor, self.row(), receipts]
            response = self.client.get("/api/bookings/10/settlement", headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["canConfirm"], allowed)

    def test_failed_invoice_update_rolls_back_payment(self):
        self.cur.fetchone.side_effect = [self.actor, self.row(), (30000, 0, 0), (51,)]
        def execute(sql, *params):
            if "UPDATE Invoices" in sql:
                raise RuntimeError("Synthetic failure after payment insert")
        self.cur.execute.side_effect = execute
        with self.assertLogs(level="ERROR"):
            self.assertEqual(self.confirm().status_code, 500)
        self.conn.rollback.assert_called_once()
        self.conn.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
