"""UC12 API contracts with verified JWTs and isolated SQL mocks; no live writes."""
import os
import sys
import unittest
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.admin_invoice import admin_invoice_bp
from services.jwt_service import create_access_token


class AdminInvoiceTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET": "uc12-isolated-test-key"})
        env.start()
        self.addCleanup(env.stop)
        app = Flask(__name__)
        app.register_blueprint(admin_invoice_bp, url_prefix="/api")
        self.client = app.test_client()
        self.conn = MagicMock()
        self.cur = self.conn.cursor.return_value
        db = patch("services.invoice_cash_service.get_connection", return_value=self.conn)
        db.start()
        self.addCleanup(db.stop)
        self.actor = Row(Role="ADMIN", Status="ACTIVE")

    def row(self, **changes):
        values = dict(BookingID=10, UserID=1, TotalAmount=Decimal("100000"),
                      Status="CANCELLED", InvoiceID=20, InvoiceAmount=Decimal("100000"),
                      InvoicePaidAmount=0, InvoicePaymentStatus="UNPAID",
                      BookingDate=date(2026, 11, 9), StartTime=time(18), EndTime=time(19),
                      CreatedDate=datetime(2026, 11, 9, 10), FullName="Customer A", Email="a@example.test",
                      FieldName="Archived field", Location="Test", CancelledBy=None, CancelledAt=None, Reason=None)
        values.update(changes)
        return Row(**values)

    def request(self, path="/api/admin/invoices", method="get", role="ADMIN", **kw):
        return getattr(self.client, method)(path, headers={"Authorization": "Bearer " + create_access_token(2, role)}, **kw)

    def cancel(self, payload=None):
        return self.request("/api/admin/invoices/20/status", "patch",
                            json=payload if payload is not None else {"status": "CANCELLED", "reason": "Booking đã hủy"})

    def seed_cancel(self, **changes):
        self.cur.fetchone.side_effect = [self.actor, Row(BookingID=10), self.row(**changes), (0, 0, 0), None]

    def assert_no_legacy_writes(self):
        writes = [c.args[0].strip().upper() for c in self.cur.execute.call_args_list
                  if c.args[0].strip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
        self.assertTrue(all(s.startswith("INSERT INTO DBO.INVOICEADMINCANCELLATIONS") for s in writes), writes)

    def test_role_matrix_all_endpoints(self):
        for role in ("CUSTOMER", "STAFF"):
            for path, method in (("/api/admin/invoices", "get"), ("/api/admin/invoices/20", "get"),
                                 ("/api/admin/invoices/20/status", "patch")):
                with self.subTest(role=role, path=path):
                    self.assertEqual(self.request(path, method, role).status_code, 403)
        self.conn.cursor.assert_not_called()

    def test_missing_and_invalid_jwt(self):
        self.assertEqual(self.client.get("/api/admin/invoices").status_code, 401)
        self.assertEqual(self.client.get("/api/admin/invoices", headers={"Authorization": "Bearer invalid"}).status_code, 401)

    def test_current_database_role_and_active_status_checked(self):
        for actor in (Row(Role="CUSTOMER", Status="ACTIVE"), Row(Role="ADMIN", Status="INACTIVE")):
            self.cur.fetchone.side_effect = [actor]
            self.assertEqual(self.request().status_code, 403)
        self.conn.commit.assert_not_called()

    def test_filters_parameterized_dates_inclusive_and_paging(self):
        self.cur.fetchone.side_effect = [self.actor]
        self.cur.fetchall.return_value = []
        response = self.request("/api/admin/invoices?status=PAID&customer=A%25_&from=2026-11-01&to=2026-11-09&page=2&pageSize=10")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"items": [], "page": 2, "pageSize": 10, "hasNext": False})
        query, *args = self.cur.execute.call_args.args
        self.assertIn("C.InvoiceID IS NULL", query)
        self.assertIn("P.Status='SUCCESS'", query)
        self.assertIn("I.CreatedDate < ?", query)
        self.assertIn("%A~%~_%", args)
        self.assertIn(date(2026, 11, 10), args)
        self.assertEqual(args[-2:], [10, 11])
        self.conn.commit.assert_not_called()
        self.assert_no_legacy_writes()

    def test_invalid_filters_before_sql(self):
        for query in ("status=UNKNOWN", "page=0", "pageSize=101", "from=2026-11-10&to=2026-11-09",
                      "from=oops", "to=9999-12-31", "paidAmount=1", "status=PAID&status=UNPAID"):
            with self.subTest(query=query):
                self.assertEqual(self.request("/api/admin/invoices?" + query).status_code, 400)
        self.conn.cursor.assert_not_called()

    def test_list_derives_balances_and_preserves_archived_field(self):
        self.cur.fetchone.side_effect = [self.actor, (30000, 0, 0)]
        self.cur.fetchall.return_value = [self.row(Status="COMPLETED")]
        response = self.request()
        self.assertEqual(response.status_code, 200)
        item = response.json["items"][0]
        self.assertEqual((item["paidAmount"], item["remainingAmount"], item["status"]), (30000, 70000, "PARTIALLY_PAID"))
        self.assertEqual(item["field"]["name"], "Archived field")
        self.assertFalse(item["canCancel"])
        self.assert_no_legacy_writes()

    def test_cancelled_management_state_does_not_change_payment_status(self):
        self.cur.fetchone.side_effect = [self.actor, (0, 0, 0)]
        self.cur.fetchall.return_value = [self.row(CancelledBy=2, CancelledAt=datetime(2026, 11, 9), Reason="Closed")]
        response = self.request("/api/admin/invoices?status=CANCELLED")
        item = response.json["items"][0]
        self.assertEqual((item["invoiceStatus"], item["paymentStatus"]), ("CANCELLED", "UNPAID"))
        self.assertEqual(item["allowedTransitions"], [])

    def test_detail_history_includes_unlinked_deposit_and_separate_refund(self):
        self.cur.fetchone.side_effect = [self.actor, self.row(), (30000, 0, 0), Row(Amount=30000, ConfirmedAt=datetime(2026, 11, 9))]
        self.cur.fetchall.return_value = [Row(PaymentID=5, PaymentType="DEPOSIT", Amount=30000, Status="SUCCESS",
                                             Method="BANK_TRANSFER", Reference="TEST-5", RecordedAt=None)]
        response = self.request("/api/admin/invoices/20")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["payments"][0]["paymentId"], 5)
        self.assertEqual(response.json["paidAmount"], 30000)
        self.assertEqual(response.json["refund"]["amount"], 30000)
        self.assertTrue(any("BookingID = ? OR InvoiceID = ?" in c.args[0] for c in self.cur.execute.call_args_list))
        self.conn.commit.assert_not_called()

    def test_missing_detail_and_cancel(self):
        self.cur.fetchone.side_effect = [self.actor, None]
        self.assertEqual(self.request("/api/admin/invoices/20").status_code, 404)
        self.cur.fetchone.side_effect = [self.actor, None]
        self.assertEqual(self.cancel().status_code, 404)

    def test_cancel_only_inserts_audited_management_record(self):
        self.seed_cancel()
        response = self.cancel()
        self.assertEqual(response.status_code, 200)
        self.conn.commit.assert_called_once()
        self.conn.rollback.assert_not_called()
        self.assert_no_legacy_writes()
        self.assertTrue(any("WITH (UPDLOCK, HOLDLOCK)" in c.args[0] for c in self.cur.execute.call_args_list))
        insert = self.cur.execute.call_args.args
        self.assertEqual(insert[1:], (20, 2, "Booking đã hủy"))

    def test_cancel_cannot_fake_money_or_payment_state(self):
        for payload in ({"status": "PAID", "reason": "x"}, {"status": "CANCELLED", "reason": "x", "paidAmount": 0},
                        {"status": "ACTIVE", "reason": "x"}, {"status": "CANCELLED"}, {"status": "CANCELLED", "reason": " "},
                        {"status": "CANCELLED", "reason": 5}, [], {"status": "CANCELLED", "reason": "x" * 501}):
            self.assertEqual(self.cancel(payload).status_code, 400)
        self.conn.commit.assert_not_called()

    def test_live_booking_or_successful_receipts_block_cancellation(self):
        for booking_status, deposit, final in (("COMPLETED", 0, 0), ("PENDING", 0, 0), ("CONFIRMED", 0, 0),
                                               ("CANCELLED", 30000, 0), ("CANCELLED", 30000, 70000)):
            self.cur.fetchone.side_effect = [self.actor, Row(BookingID=10), self.row(Status=booking_status), (deposit, final, 0)]
            self.assertEqual(self.cancel().status_code, 409)
        self.conn.commit.assert_not_called()
        self.assert_no_legacy_writes()

    def test_duplicate_cancel_conflicts(self):
        self.cur.fetchone.side_effect = [self.actor, Row(BookingID=10), self.row(), (0, 0, 0), Row(InvoiceID=20)]
        self.assertEqual(self.cancel().status_code, 409)
        self.conn.commit.assert_not_called()
        self.conn.rollback.assert_called_once()

    def test_mismatched_financial_data_blocks_cancel(self):
        self.seed_cancel(InvoicePaidAmount=50000)
        self.assertEqual(self.cancel().status_code, 409)
        self.conn.commit.assert_not_called()

    def test_insert_failure_rolls_back_without_exposing_sql(self):
        self.seed_cancel()
        def execute(query, *args):
            if query.lstrip().startswith("INSERT"):
                raise RuntimeError("private database connection string")
        self.cur.execute.side_effect = execute
        with self.assertLogs(level="ERROR"):
            response = self.cancel()
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("private", response.get_data(as_text=True))
        self.conn.rollback.assert_called_once()
        self.conn.commit.assert_not_called()

    def test_legacy_paid_flag_never_allows_cancel_even_if_receipts_are_missing(self):
        self.seed_cancel(InvoicePaymentStatus="PAID")
        self.assertEqual(self.cancel().status_code, 409)
        self.conn.commit.assert_not_called()

    def test_uc12_list_and_detail_include_successful_extra(self):
        row = self.row(TotalAmount=900000, InvoiceAmount=900000, Status="COMPLETED")
        self.cur.fetchone.side_effect = [self.actor, (300000, 0, 100000)]
        self.cur.fetchall.return_value = [row]
        response = self.request("/api/admin/invoices?status=PARTIALLY_PAID")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["items"][0]["remainingAmount"], 500000)
        query = next(c.args[0] for c in self.cur.execute.call_args_list if "OFFSET" in c.args[0])
        self.assertIn("'EXTRA'", query)
        self.cur.fetchone.side_effect = [self.actor, row, (300000, 0, 100000), None]
        self.cur.fetchall.return_value = []
        response = self.request("/api/admin/invoices/20")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["remainingAmount"], 500000)
        self.assertFalse(response.json["canCancel"])
        self.conn.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
