"""Execute T123-165 aggregation on SQL Server using CTE fixtures; no database writes."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from database import get_connection
from services.invoice_cash_service import _summary


class FixtureCursor:
    def __init__(self, cursor, final):
        self.cursor = cursor
        self.final = final

    def execute(self, sql, *params):
        assert sql.lstrip().upper().startswith("SELECT") and "FROM Payments" in sql
        # A VALUES expression is read-only; it creates no physical or temporary table.
        fixture = """WITH FixturePayments AS (
            SELECT BookingID, PaymentType, Amount, Status FROM (VALUES
                (10, 'DEPOSIT', CAST(300000 AS DECIMAL(18,2)), 'SUCCESS'),
                (10, 'EXTRA', CAST(100000 AS DECIMAL(18,2)), 'SUCCESS'),
                (10, 'FINAL_PAYMENT', CAST(? AS DECIMAL(18,2)), 'SUCCESS'),
                (10, 'EXTRA', CAST(800000 AS DECIMAL(18,2)), 'FAILED'),
                (11, 'EXTRA', CAST(800000 AS DECIMAL(18,2)), 'SUCCESS')
            ) AS V(BookingID, PaymentType, Amount, Status)
        ) """
        self.cursor.execute(fixture + sql.replace("FROM Payments", "FROM FixturePayments"), self.final, *params)

    def fetchone(self):
        return self.cursor.fetchone()


def main():
    conn = get_connection()
    if conn is None:
        raise RuntimeError("SQL Server unavailable")
    cur = conn.cursor()
    cases = []
    try:
        row = SimpleNamespace(BookingID=10, TotalAmount=900000, Status="COMPLETED", InvoiceID=20,
                              InvoiceAmount=900000, InvoicePaidAmount=300000)
        for final, remaining, status in ((0, 500000, "PARTIALLY_PAID"), (500000, 0, "PAID")):
            result = _summary(FixtureCursor(cur, final), row)
            assert result["remainingAmount"] == remaining
            assert result["paidAmount"] == 900000 - remaining
            assert result["status"] == status
            cases.append({"finalPayment": final, "paid": result["paidAmount"], "remaining": remaining, "status": status})
        evidence = {"verifiedAt": datetime.now(timezone.utc).isoformat(), "engine": "SQL Server",
                    "mode": "Read-only CTE VALUES fixtures, real aggregation query", "databaseWrites": 0,
                    "cases": cases, "note": "Does not execute cash confirmation or modify existing customer records."}
        output = ROOT / "docs" / "T123-165-sql-readonly.json"
        output.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(evidence))
    finally:
        cur.close()
        conn.rollback()
        conn.close()


if __name__ == "__main__":
    main()
