"""Run expiry SQL on SQL Server table-variable fixtures, never application tables.

The generated statements target only @Bookings/@Payments/@Requests variables.
No migration, permanent table, customer data change or commit is performed.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from database import get_connection
from services.availability_service import expire_pending_bookings


FIXTURES = """
SET NOCOUNT ON;
DECLARE @Bookings TABLE (BookingID INT PRIMARY KEY, Status VARCHAR(30), CreatedAt DATETIME);
DECLARE @Payments TABLE (PaymentID INT PRIMARY KEY, BookingID INT, PaymentType VARCHAR(30),
                        Status VARCHAR(30), Deadline DATETIME, UpdatedAt DATETIME);
DECLARE @Requests TABLE (BookingID INT, Status VARCHAR(30));
INSERT @Bookings VALUES
 (1,'PENDING',GETDATE()), (2,'PENDING',DATEADD(HOUR,-1,GETDATE())),
 (3,'PENDING',DATEADD(HOUR,-1,GETDATE())), (4,'PENDING',DATEADD(HOUR,-1,GETDATE())),
 (5,'COMPLETED',DATEADD(HOUR,-1,GETDATE())), (6,'CANCELLED',DATEADD(HOUR,-1,GETDATE())),
 (7,'PENDING',DATEADD(HOUR,-1,GETDATE())), (8,'PENDING',GETDATE()),
 (9,'PENDING',DATEADD(HOUR,-1,GETDATE())), (10,'PENDING',DATEADD(HOUR,-1,GETDATE())),
 (11,'PENDING',DATEADD(HOUR,-1,GETDATE())), (12,'CONFIRMED',DATEADD(HOUR,-1,GETDATE()));
INSERT @Payments (PaymentID,BookingID,PaymentType,Status,Deadline) VALUES
 (1,1,'DEPOSIT','PENDING',DATEADD(MINUTE,-1,GETDATE())),
 (2,2,'DEPOSIT','PENDING',DATEADD(MINUTE,10,GETDATE())),
 (3,3,'DEPOSIT','SUCCESS',DATEADD(MINUTE,-1,GETDATE())),
 (4,4,'DEPOSIT','PENDING',DATEADD(MINUTE,-1,GETDATE())),
 (5,5,'FINAL_PAYMENT','SUCCESS',DATEADD(MINUTE,-1,GETDATE())),
 (6,6,'DEPOSIT','PENDING',DATEADD(MINUTE,-1,GETDATE())),
 (9,9,'DEPOSIT','PENDING',DATEADD(MINUTE,-1,GETDATE())),
 (19,9,'DEPOSIT','PENDING',DATEADD(MINUTE,10,GETDATE())),
 (10,10,'DEPOSIT','PENDING',NULL),
 (11,11,'DEPOSIT','FAILED',DATEADD(MINUTE,-1,GETDATE())),
 (12,12,'DEPOSIT','PENDING',DATEADD(MINUTE,-1,GETDATE()));
INSERT @Requests VALUES (4,'PENDING_REVIEW');
"""


def expiry_sql(booking_id=None):
    recorder = MagicMock()
    with patch.dict(os.environ, {"DEPOSIT_DEADLINE_MINUTES": "10"}):
        expire_pending_bookings(recorder, booking_id=booking_id)
    statements = []
    for call in recorder.execute.call_args_list:
        sql, *params = call.args
        for source, target in (("dbo.BookingCancellationRequests", "@Requests"),
                               ("dbo.Bookings", "@Bookings"), ("dbo.Payments", "@Payments")):
            sql = sql.replace(source, target)
        # Table-variable fixtures validate SQL semantics, not physical row locking.
        sql = sql.replace("WITH (UPDLOCK, HOLDLOCK)", "")
        for param in params:
            assert isinstance(param, int)
            sql = sql.replace("?", str(param), 1)
        assert "dbo." not in sql and "?" not in sql
        statements.append(sql + ";")
    return "\n".join(statements)


def main():
    conn = get_connection()
    if conn is None:
        raise RuntimeError("SQL Server unavailable")
    cur = conn.cursor()
    results = []
    try:
        for scoped in (None, 1):
            sql = expiry_sql(scoped)
            cur.execute(FIXTURES + sql + sql + " SELECT BookingID, Status FROM @Bookings ORDER BY BookingID;")
            bookings = {r.BookingID: r.Status for r in cur.fetchall()}
            expected = {1:"CANCELLED",2:"PENDING",3:"PENDING",4:"PENDING",5:"COMPLETED",6:"CANCELLED",
                        7:"CANCELLED",8:"PENDING",9:"PENDING",10:"CANCELLED",11:"CANCELLED",12:"CONFIRMED"}
            if scoped is not None:
                expected.update({7:"PENDING",10:"PENDING",11:"PENDING"})
            assert bookings == expected, (scoped, bookings)
            cur.execute(FIXTURES + sql + sql + " SELECT PaymentID, Status FROM @Payments ORDER BY PaymentID;")
            payments = {r.PaymentID: r.Status for r in cur.fetchall()}
            expected_p = {1:"EXPIRED",2:"PENDING",3:"SUCCESS",4:"EXPIRED",5:"SUCCESS",6:"EXPIRED",
                          9:"EXPIRED",19:"PENDING",10:"EXPIRED",11:"FAILED",12:"EXPIRED"}
            if scoped is not None:
                expected_p.update({4:"PENDING",6:"PENDING",9:"PENDING",10:"PENDING",12:"PENDING"})
            assert payments == expected_p, (scoped, payments)
            results.append({"scope": "all" if scoped is None else scoped, "bookingStatesChecked": len(bookings),
                            "paymentStatesChecked": len(payments), "repeatedExpiry": "idempotent"})
        evidence = {"verifiedAt": datetime.now(timezone.utc).isoformat(), "engine": "SQL Server",
                    "mode": "Session table-variable fixtures only", "applicationTableWrites": 0,
                    "results": results, "limitations": "Does not verify real concurrent row locks or inject live database faults."}
        (ROOT / "docs" / "T123-162-sql-verification.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(evidence))
    finally:
        cur.close()
        conn.rollback()
        conn.close()


if __name__ == "__main__":
    main()
