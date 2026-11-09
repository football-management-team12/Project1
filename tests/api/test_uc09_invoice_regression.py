"""UC09 regression after UC12 registration; SQL mocked, existing service unchanged."""
import os
import sys
import unittest
from pathlib import Path
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
        self.actor = Row(Role="ADMIN", Status="ACTIVE")
        self.headers = {"Authorization": "Bearer " + create_access_token(2, "ADMIN")}

    def row(self, **changes):
        fields = dict(BookingID=10, UserID=1, TotalAmount=100000, Status="COMPLETED",
                      InvoiceID=20, InvoiceAmount=100000, InvoicePaidAmount=30000, InvoicePaymentStatus="PARTIALLY_PAID")
        fields.update(changes)
        return Row(**fields)

    def confirm(self):
        return self.client.post("/api/admin/bookings/10/confirm-final-payment", headers=self.headers)

    def test_final_cash_still_records_remaining_and_invoice_atomically(self):
        self.cur.fetchone.side_effect = [self.actor, self.row(), (30000, 0), (51,)]
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

    def test_already_paid_and_cancelled_booking_cannot_be_charged(self):
        for row, receipts in ((self.row(InvoicePaidAmount=100000, InvoicePaymentStatus="PAID"), (30000, 70000)),
                              (self.row(Status="CANCELLED"), (30000, 0))):
            self.cur.fetchone.side_effect = [self.actor, row, receipts]
            self.assertEqual(self.confirm().status_code, 409)
        self.conn.commit.assert_not_called()
        self.assertFalse(any("INSERT INTO Payments" in c.args[0] for c in self.cur.execute.call_args_list))

    def test_customer_cannot_confirm_final_cash(self):
        headers = {"Authorization": "Bearer " + create_access_token(1, "CUSTOMER")}
        self.assertEqual(self.client.post("/api/admin/bookings/10/confirm-final-payment", headers=headers).status_code, 403)
        self.conn.cursor.assert_not_called()

    def test_failed_invoice_update_rolls_back_payment(self):
        self.cur.fetchone.side_effect = [self.actor, self.row(), (30000, 0), (51,)]
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
