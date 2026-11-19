"""T123-165: execute the receipt aggregation SQL against an isolated SQLite table."""
import sqlite3
import sys
import unittest
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace as Row

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from services.invoice_cash_service import _summary
from services.payment_service import PaymentError


class OdbcStyleCursor:
    """Adapt pyodbc's variadic parameters without changing the SQL under test."""
    def __init__(self, cursor):
        self.cursor = cursor

    def execute(self, sql, *params):
        self.cursor.execute(sql, params)

    def fetchone(self):
        return self.cursor.fetchone()


class ExtraPaymentBalanceTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.addCleanup(self.conn.close)
        self.conn.execute("CREATE TABLE Payments (BookingID INTEGER, PaymentType TEXT, Amount NUMERIC, Status TEXT)")
        self.row = Row(BookingID=10, TotalAmount=900000, Status="COMPLETED", InvoiceID=20,
                       InvoiceAmount=900000, InvoicePaidAmount=300000, InvoicePaymentStatus="PARTIALLY_PAID")

    def receipt(self, kind, amount, status="SUCCESS", booking=10):
        self.conn.execute("INSERT INTO Payments VALUES (?, ?, ?, ?)", (booking, kind, amount, status))

    def summary(self):
        return _summary(OdbcStyleCursor(self.conn.cursor()), self.row)

    def test_reported_case_remaining_is_500000_not_600000(self):
        self.receipt("DEPOSIT", 300000)
        self.receipt("EXTRA", 100000)
        data = self.summary()
        self.assertEqual(data["paidAmount"], 400000)
        self.assertEqual(data["remainingAmount"], 500000)
        self.assertEqual(data["extraAmount"], 100000)
        self.assertEqual(data["finalPaymentAmount"], 0)
        self.assertEqual(data["paymentMethod"], "NOT_RECORDED")

    def test_successful_final_receipt_reconciles_total_without_double_count(self):
        for kind, amount in (("DEPOSIT", 300000), ("EXTRA", 100000), ("FINAL_PAYMENT", 500000)):
            self.receipt(kind, amount)
        data = self.summary()
        self.assertEqual((data["paidAmount"], data["remainingAmount"], data["status"]), (900000, 0, "PAID"))

    def test_failed_pending_expired_and_other_bookings_do_not_count(self):
        self.receipt("DEPOSIT", 300000)
        self.receipt("EXTRA", 100000)
        for status in ("PENDING", "FAILED", "EXPIRED"):
            self.receipt("EXTRA", 700000, status)
        self.receipt("EXTRA", 700000, booking=11)
        self.receipt("UNKNOWN", 700000)
        self.assertEqual(self.summary()["remainingAmount"], 500000)

    def test_multiple_extras_are_summed_without_rounding_drift(self):
        self.receipt("DEPOSIT", 300000)
        self.receipt("EXTRA", 60000.25)
        self.receipt("EXTRA", 39999.75)
        self.assertEqual(Decimal(str(self.summary()["remainingAmount"])), Decimal("500000"))

    def test_extra_covering_balance_is_paid(self):
        self.receipt("DEPOSIT", 300000)
        self.receipt("EXTRA", 600000)
        self.assertEqual((self.summary()["status"], self.summary()["remainingAmount"]), ("PAID", 0))

    def test_overpaid_or_negative_extra_fails_instead_of_collecting_more(self):
        self.receipt("DEPOSIT", 300000)
        self.receipt("EXTRA", 700000)
        with self.assertRaises(PaymentError) as error:
            self.summary()
        self.assertEqual(error.exception.code, "PAYMENT_MISMATCH")
        self.conn.execute("DELETE FROM Payments WHERE PaymentType='EXTRA'")
        self.receipt("EXTRA", -1)
        with self.assertRaises(PaymentError):
            self.summary()

    def test_no_extra_keeps_existing_cash_payment_arithmetic(self):
        self.receipt("DEPOSIT", 300000)
        self.assertEqual(self.summary()["remainingAmount"], 600000)


if __name__ == "__main__":
    unittest.main()
