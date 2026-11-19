"""UC08 contracts with real JWT verification and mocked SQL rows; no writes."""
import os
import sys
import unittest
from datetime import date, time
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.invoice import invoice_bp
from services.jwt_service import create_access_token


class InvoiceViewTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"JWT_SECRET": "uc08-test-secret-only"})
        self.env.start()
        self.addCleanup(self.env.stop)
        app = Flask(__name__)
        app.register_blueprint(invoice_bp, url_prefix="/api")
        self.client = app.test_client()
        self.connection = MagicMock()
        self.cursor = self.connection.cursor.return_value
        self.db = patch("services.invoice_cash_service.get_connection", return_value=self.connection)
        self.db.start()
        self.addCleanup(self.db.stop)

    def row(self, **changes):
        values = dict(BookingID=10, UserID=1, TotalAmount=Decimal("100000.00"),
                      Status="COMPLETED", InvoiceID=20, InvoiceAmount=Decimal("100000.00"),
                      InvoicePaidAmount=0, InvoicePaymentStatus="UNPAID",
                      BookingDate=date(2026, 11, 6), StartTime=time(18), EndTime=time(19),
                      FieldID=5, FieldName="Archived field", FieldType="5", Location="Test",
                      CreatedDate=None)
        values.update(changes)
        return SimpleNamespace(**values)

    def seed(self, row, role="CUSTOMER", deposit=0, final=0, refund=None, status="ACTIVE", extra=0):
        self.cursor.fetchone.side_effect = [SimpleNamespace(Role=role, Status=status), row,
                                           (Decimal(str(deposit)), Decimal(str(final)), Decimal(str(extra))), refund]

    def test_extra_receipts_in_both_uc08_lookups_match_settlement(self):
        for path in ("/api/invoices/20", "/api/bookings/10/invoice"):
            self.seed(self.row(TotalAmount=900000, InvoiceAmount=900000), deposit=300000, extra=100000)
            response = self.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["paidAmount"], 400000)
            self.assertEqual(response.json["remainingAmount"], 500000)
            self.assertEqual(response.json["paymentStatus"], "PARTIALLY_PAID")
        self.connection.commit.assert_not_called()

    def test_confirmed_free_booking_has_read_only_provisional_view_without_fake_payment(self):
        self.seed(self.row(TotalAmount=0, InvoiceID=None, Status="CONFIRMED"))
        response = self.get("/api/bookings/10/invoice")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["paymentStatus"], "PAID")
        self.assertEqual(response.json["remainingAmount"], 0)
        self.assertEqual(response.json["paidAmount"], 0)
        self.assertTrue(response.json["isComplimentary"])
        self.assertTrue(response.json["isProvisional"])
        self.assertIsNone(response.json["invoiceId"])
        self.assert_read_only()

    def test_free_booking_with_successful_money_is_a_mismatch(self):
        self.seed(self.row(TotalAmount=0, InvoiceID=None, Status="CONFIRMED"), deposit=100000)
        self.assertEqual(self.get("/api/bookings/10/invoice").status_code, 409)

    def get(self, path="/api/invoices/20", user_id=1, role="CUSTOMER", token=None):
        return self.client.get(path, headers={"Authorization": "Bearer " + (
            token if token is not None else create_access_token(user_id, role))})

    def assert_read_only(self):
        self.connection.commit.assert_not_called()
        for call in self.cursor.execute.call_args_list:
            self.assertTrue(call.args[0].lstrip().upper().startswith("SELECT"))
        self.cursor.close.assert_called_once()
        self.connection.close.assert_called_once()

    def test_payment_states_both_endpoints_and_roles(self):
        for role in ("CUSTOMER", "ADMIN"):
            for path in ("/api/invoices/20", "/api/bookings/10/invoice"):
                for deposit, final, status in ((0, 0, "UNPAID"), (30000, 0, "PARTIALLY_PAID"), (30000, 70000, "PAID")):
                    with self.subTest(role=role, path=path, status=status):
                        self.connection.reset_mock()
                        self.seed(self.row(), role, deposit, final)
                        response = self.get(path, user_id=2 if role == "ADMIN" else 1, role=role)
                        self.assertEqual(response.status_code, 200)
                        data = response.get_json()
                        self.assertEqual(data["status"], status)
                        self.assertEqual(data["paymentStatus"], status)
                        self.assertEqual(data["field"], {
                            "fieldId": 5, "fieldName": "Archived field",
                            "fieldType": "5", "location": "Test",
                        })
                        self.assertEqual(data["paidAmount"], deposit + final)
                        self.assertEqual(data["remainingAmount"], 100000 - deposit - final)
                        self.assertEqual(data["fieldName"], "Archived field")
                        self.assert_read_only()

    def test_customer_cannot_view_other_customers_invoice(self):
        for path in ("/api/invoices/20", "/api/bookings/10/invoice"):
            self.seed(self.row(UserID=2))
            self.assertEqual(self.get(path).status_code, 403)

    def test_missing_invoice_booking_and_not_yet_issued(self):
        for row in (None, self.row(InvoiceID=None)):
            for path in ("/api/invoices/20", "/api/bookings/10/invoice"):
                self.seed(row)
                self.assertEqual(self.get(path).status_code, 404)
        self.connection.commit.assert_not_called()

    def test_successful_deposit_shows_provisional_invoice_without_writes(self):
        for role in ("CUSTOMER", "ADMIN"):
            for deposit, status in ((30000, "PARTIALLY_PAID"), (100000, "PAID")):
                with self.subTest(role=role, deposit=deposit):
                    self.connection.reset_mock()
                    self.seed(self.row(InvoiceID=None, Status="CONFIRMED"),
                              role=role, deposit=deposit)
                    response = self.get("/api/bookings/10/invoice", role=role)
                    self.assertEqual(response.status_code, 200)
                    self.assertTrue(response.json["isProvisional"])
                    self.assertIsNone(response.json["invoiceId"])
                    self.assertEqual(response.json["paidAmount"], deposit)
                    self.assertEqual(response.json["remainingAmount"], 100000 - deposit)
                    self.assertEqual(response.json["status"], status)
                    self.assertEqual(response.json["paymentStatus"], status)
                    self.assert_read_only()

    def test_provisional_invoice_still_checks_ownership(self):
        self.seed(self.row(InvoiceID=None, UserID=2), deposit=30000)
        self.assertEqual(self.get("/api/bookings/10/invoice").status_code, 403)

    def test_provisional_invoice_includes_remaining_balance_after_deposit(self):
        self.seed(self.row(BookingID=7021, InvoiceID=None, Status="CONFIRMED",
                           TotalAmount=Decimal("350000.00")), deposit=100000)
        response = self.get("/api/bookings/7021/invoice")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["isProvisional"])
        self.assertEqual(response.json["totalAmount"], 350000)
        self.assertEqual(response.json["paidAmount"], 100000)
        self.assertEqual(response.json["remainingAmount"], 250000)
        self.assertEqual(response.json["status"], "PARTIALLY_PAID")
        self.assert_read_only()

    def test_issued_invoice_is_not_provisional(self):
        self.seed(self.row(), deposit=30000)
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json["isProvisional"])

    def test_missing_invalid_and_expired_jwt(self):
        import jwt
        for path in ("/api/invoices/20", "/api/bookings/10/invoice"):
            self.assertEqual(self.client.get(path).status_code, 401)
            self.assertEqual(self.get(path, token="invalid").status_code, 401)
            expired = jwt.encode({"sub": "1", "role": "CUSTOMER", "exp": 1}, "uc08-test-secret-only", algorithm="HS256")
            self.assertEqual(self.get(path, token=expired).status_code, 401)
        self.connection.cursor.assert_not_called()

    def test_staff_inactive_and_changed_database_role_forbidden(self):
        self.assertEqual(self.get(role="STAFF").status_code, 403)
        for role, status in (("CUSTOMER", "INACTIVE"), ("STAFF", "ACTIVE")):
            self.seed(self.row(), role=role, status=status)
            self.assertEqual(self.get().status_code, 403)

    def test_mismatched_or_overpaid_data_returns_conflict(self):
        for row, deposit, final in ((self.row(InvoiceAmount=1), 0, 0),
                                    (self.row(InvoicePaidAmount=50000), 30000, 0),
                                    (self.row(), 30000, 80000)):
            self.seed(row, deposit=deposit, final=final)
            self.assertEqual(self.get().status_code, 409)
        self.connection.commit.assert_not_called()

    def test_cancelled_refund_preserves_payment_history(self):
        self.seed(self.row(Status="CANCELLED"), deposit=30000,
                  refund=SimpleNamespace(Amount=Decimal("30000")))
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["paidAmount"], 30000)
        self.assertEqual(response.json["refundedAmount"], 30000)
        self.assert_read_only()

    def test_database_unavailable(self):
        with patch("services.invoice_cash_service.get_connection", return_value=None):
            self.assertEqual(self.get().status_code, 500)


if __name__ == "__main__":
    unittest.main()
