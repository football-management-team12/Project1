"""UC16 authorization, boundaries, metric assembly and read-only failure behavior."""
import os
from pathlib import Path
import sys
import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

import pyodbc

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from app import app
from services.jwt_service import create_access_token
from services.report_service import validate_range


class AdminReportsTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET": "uc16-fixture-only"}); env.start(); self.addCleanup(env.stop)
        self.conn = MagicMock(); self.cur = self.conn.cursor.return_value
        db = patch("services.report_service.get_connection", return_value=self.conn); db.start(); self.addCleanup(db.stop)
        self.client = app.test_client()
        self.headers = {"Authorization": "Bearer " + create_access_token(1, "ADMIN")}
        self.cur.fetchone.return_value = Row(Role="ADMIN", Status="ACTIVE")
        self.cur.fetchall.side_effect = [[], [], [], [], []]

    def get(self, query="from=2026-11-01&to=2026-11-02", headers=None):
        return self.client.get("/api/admin/reports/summary?" + query, headers=self.headers if headers is None else headers)

    def test_authentication_and_roles(self):
        for headers in ({}, {"Authorization": "Bearer invalid"}):
            self.assertEqual(self.get(headers=headers).status_code, 401)
        for role in ("CUSTOMER", "STAFF"):
            self.assertEqual(self.get(headers={"Authorization": "Bearer " + create_access_token(1, role)}).status_code, 403)
        self.conn.cursor.assert_not_called()

    def test_current_database_role_and_status(self):
        for row in (None, Row(Role="CUSTOMER", Status="ACTIVE"), Row(Role="ADMIN", Status="INACTIVE")):
            self.cur.fetchone.return_value = row
            self.assertEqual(self.get().status_code, 403)
        self.cur.fetchall.assert_not_called()
        self.assertEqual(self.conn.rollback.call_count, 3)

    def test_range_validation_before_database(self):
        for query in ("", "from=2026-11-01", "from=&to=2026-11-02", "from=2026-02-29&to=2026-03-01",
                      "from=2026-11-03&to=2026-11-02", "from=2026-1-01&to=2026-11-02",
                      "from=2025-01-01&to=2026-01-02", "from=0001-01-01&to=0001-01-01",
                      "from=9999-01-01&to=9999-01-01", "from=2026-11-01&from=2026-11-02&to=2026-11-02",
                      "from=2026-11-01&to=2026-11-02&fieldId=1", "from=２０２６-11-01&to=2026-11-02",
                      "from=2026-11-01%27&to=2026-11-02"):
            with self.subTest(query=query):
                response = self.get(query)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json["code"], "INVALID_DATE_RANGE")
        self.conn.cursor.assert_not_called()

    def test_valid_leap_day_and_maximum_range(self):
        self.assertEqual(validate_range("2024-02-29", "2024-02-29"), (date(2024, 2, 29), date(2024, 2, 29)))
        self.assertEqual(validate_range("2024-01-01", "2024-12-31")[1], date(2024, 12, 31))

    def test_empty_zeros_date_padding_no_cache(self):
        response = self.get()
        self.assertEqual(response.status_code, 200)
        result = response.json
        self.assertEqual([result[key] for key in ("revenue", "grossRevenue", "refundedAmount", "bookingCount", "invoiceCount")], [0] * 5)
        self.assertEqual(result["fieldUtilization"], [])
        self.assertEqual(result["depositAmount"], 0)
        self.assertEqual(result["venueCollectedAmount"], 0)
        self.assertNotIn("paymentStatusCount", result)
        self.assertEqual([row["date"] for row in result["dailyRevenue"]], ["2026-11-01", "2026-11-02"])
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.conn.commit.assert_not_called(); self.conn.rollback.assert_called_once()
        self.cur.close.assert_called_once(); self.conn.close.assert_called_once()

    def test_financial_totals_counts_and_utilization_from_independent_aggregates(self):
        self.cur.fetchall.side_effect = [
            [Row(Day=date(2026, 11, 1), Amount=Decimal("350000.50"), DepositAmount=Decimal("100000"))],
            [Row(Day=date(2026, 11, 2), Amount=Decimal("100000.25"))],
            [Row(Category="COMPLETED_PAID", Count=2), Row(Category="DEPOSITED", Count=3), Row(Category="CANCELLED", Count=1)],
            [Row(Status="PAID", Count=1), Row(Status="PARTIALLY_PAID", Count=1)],
            [Row(FieldID=5, FieldName="QA Field", IsArchived=True, BookedSeconds=10800)],
        ]
        response = self.get()
        self.assertEqual(response.status_code, 200)
        result = response.json
        self.assertEqual(result["revenue"], 250000.25)
        self.assertEqual(result["grossRevenue"], 350000.50)
        self.assertEqual(result["depositAmount"], 100000)
        self.assertEqual(result["venueCollectedAmount"], 250000.50)
        self.assertEqual(result["dailyRevenue"][0]["venueCollectedAmount"], 250000.50)
        self.assertEqual(result["refundedAmount"], 100000.25)
        self.assertEqual(result["bookingCount"], 2)
        self.assertEqual(result["bookingBreakdown"], {"completedPaid":2,"deposited":3,"cancelled":1,"unpaid":0,"paidAwaitingCompletion":0,"partiallyPaid":0,"refunded":0,"invalidAmount":0,"invalidStatus":0,"invalidBalance":0,"total":6})
        self.assertEqual(result["invoiceCount"], 2)
        self.assertNotIn("paymentStatusCount", result)
        self.assertEqual(result["dailyRevenue"][1]["revenue"], -100000.25)
        field = result["fieldUtilization"][0]
        self.assertEqual((field["bookedHours"], field["capacityHours"], field["utilizationPercent"]), (3, 48, 6.25))
        self.assertTrue(field["isArchived"])

    def test_end_day_inclusive_all_aggregate_queries_parameterized(self):
        self.assertEqual(self.get("from=2026-12-31&to=2026-12-31").status_code, 200)
        aggregates = self.cur.execute.call_args_list[2:]
        self.assertEqual(len(aggregates), 5)
        for query in aggregates:
            self.assertEqual(query.args[1:], (date(2026, 12, 31), date(2027, 1, 1)))
            self.assertNotIn("2026-12-31", query.args[0])
        sql = " ".join(query.args[0] for query in aggregates)
        self.assertNotIn("UPDATE ", sql); self.assertNotIn("DELETE ", sql); self.assertNotIn("INSERT ", sql)
        self.assertIn("SERIALIZABLE", self.cur.execute.call_args_list[0].args[0])

    def test_refund_only_negative_revenue(self):
        self.cur.fetchall.side_effect = [[], [Row(Day=date(2026, 11, 1), Amount=Decimal("100"))], [], [], []]
        response = self.get()
        self.assertEqual(response.json["revenue"], -100)
        self.assertEqual(response.json["dailyRevenue"][0]["revenue"], -100)

    def test_money_uses_booking_day_not_receipt_or_refund_day(self):
        response = self.get("from=2026-11-16&to=2026-11-16")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["dateBasis"], "booking-date")
        self.assertEqual(response.json["revenueBasis"], "booking-receipts-minus-confirmed-refunds")
        receipts = self.cur.execute.call_args_list[2].args[0]
        refunds = self.cur.execute.call_args_list[3].args[0]
        for query in (receipts, refunds):
            self.assertIn("B.BookingDate AS Day", query)
            self.assertIn("B.BookingDate>=? AND B.BookingDate<?", query)
            self.assertIn("GROUP BY B.BookingDate", query)
            self.assertNotIn("PaymentDate", query)
            self.assertNotIn("ConfirmedAt", query)
        self.assertIn("P.Status", receipts)
        self.assertIn("'SUCCESS'", receipts)
        self.conn.commit.assert_not_called()

    def test_deposit_and_venue_collections_are_disjoint_and_not_double_counted(self):
        for amount, deposit in ((100000,100000),(500000,0),(500000,100000)):
            self.cur.fetchall.side_effect = [[Row(Day=date(2026,11,1),Amount=Decimal(amount),DepositAmount=Decimal(deposit))],[],[],[],[]]
            response = self.get()
            self.assertEqual(response.status_code,200)
            result = response.json
            self.assertEqual(result["depositAmount"],deposit)
            self.assertEqual(result["venueCollectedAmount"],amount-deposit)
            self.assertEqual(result["revenue"],result["depositAmount"]+result["venueCollectedAmount"]-result["refundedAmount"])

    def test_lifecycle_summary_is_complete_without_double_counting_financial_groups(self):
        self.cur.fetchall.side_effect = [[],[],[
            Row(Category="COMPLETED_PAID",Count=4),Row(Category="CANCELLED",Count=1),
            Row(Category="DEPOSITED",Count=1),Row(Category="PAID_AWAITING_COMPLETION",Count=2),
            Row(Category="LIFECYCLE_COMPLETED",Count=4),Row(Category="LIFECYCLE_NO_SHOW",Count=1),
            Row(Category="LIFECYCLE_ENDED",Count=2),Row(Category="LIFECYCLE_IN_PROGRESS",Count=1),
        ],[],[]]
        result = self.get().json
        self.assertEqual(result["bookingBreakdown"]["total"],8)
        self.assertEqual(result["bookingLifecycleBreakdown"],{
            "pending":0,"confirmed":0,"in_progress":1,"ended":2,
            "no_show":1,"cancelled":0,"completed":4,"unknown":0,"total":8,
        })
        self.assertEqual(result["bookingCount"],4)

    def test_database_unavailable(self):
        with patch("services.report_service.get_connection", return_value=None):
            self.assertEqual(self.get().status_code, 503)

    def test_missing_schema_timeout_or_deadlock_fail_without_partial_report(self):
        for error in (pyodbc.ProgrammingError("42S02", "Invalid object internal-secret"),
                      pyodbc.OperationalError("HYT00", "timeout"), pyodbc.Error("40001", "deadlock")):
            self.cur.fetchall.side_effect = error
            response = self.get()
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json["code"], "REPORT_UNAVAILABLE")
            self.assertNotIn("internal-secret", response.get_data(as_text=True))
            self.assertNotIn("revenue", response.json)
        self.assertEqual(self.conn.rollback.call_count, 3)


if __name__ == "__main__":
    unittest.main()
