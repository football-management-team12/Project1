"""Verify T123-164 release SQL on session table variables, never application tables."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from database import get_connection
from services.availability_service import release_booking_for_expired_deposit


FIXTURES = """
SET NOCOUNT ON;
DECLARE @Bookings TABLE (BookingID INT PRIMARY KEY, Status VARCHAR(30), TotalAmount DECIMAL(18,2) DEFAULT 600000);
DECLARE @Payments TABLE (PaymentID INT PRIMARY KEY, BookingID INT, PaymentType VARCHAR(30),
                        Status VARCHAR(30), Deadline DATETIME);
DECLARE @Requests TABLE (BookingID INT, Status VARCHAR(30));
INSERT @Bookings (BookingID,Status) VALUES
 (1,'PENDING'),(2,'PENDING'),(3,'CONFIRMED'),(4,'COMPLETED'),(5,'CANCELLED'),(6,'PENDING'),
 (7,'PENDING'),(8,'PENDING'),(9,'PENDING'),(10,'PENDING'),(11,'PENDING'),(12,'PENDING');
INSERT @Payments VALUES
 (1,1,'DEPOSIT','EXPIRED',DATEADD(MINUTE,5,GETDATE())),
 (2,2,'DEPOSIT','EXPIRED',GETDATE()),(14,2,'DEPOSIT','SUCCESS',GETDATE()),
 (3,3,'DEPOSIT','EXPIRED',GETDATE()),(4,4,'DEPOSIT','EXPIRED',GETDATE()),
 (5,5,'DEPOSIT','EXPIRED',GETDATE()),(6,6,'DEPOSIT','EXPIRED',GETDATE()),
 (16,6,'DEPOSIT','PENDING',DATEADD(MINUTE,5,GETDATE())),
 (7,7,'DEPOSIT','EXPIRED',GETDATE()),(8,8,'DEPOSIT','SUCCESS',GETDATE()),
 (9,9,'FINAL_PAYMENT','EXPIRED',GETDATE()),(10,10,'DEPOSIT','EXPIRED',GETDATE()),
 (20,10,'DEPOSIT','PENDING',DATEADD(MINUTE,-5,GETDATE())),
 (11,11,'DEPOSIT','EXPIRED',GETDATE()),(21,11,'DEPOSIT','PENDING',NULL),
 (12,12,'DEPOSIT','EXPIRED',GETDATE());
INSERT @Requests VALUES (7,'PENDING_REVIEW');
"""


def release_sql(booking_id, payment_id):
    recorder = MagicMock()
    release_booking_for_expired_deposit(recorder, booking_id, payment_id)
    sql, *params = recorder.execute.call_args.args
    for source, target in (("dbo.BookingCancellationRequests", "@Requests"),
                           ("dbo.Bookings", "@Bookings"), ("dbo.Payments", "@Payments")):
        sql = sql.replace(source, target)
    sql = sql.replace("WITH (UPDLOCK, HOLDLOCK)", "")
    for value in params:
        assert isinstance(value, int)
        sql = sql.replace("?", str(value), 1)
    assert "dbo." not in sql and "?" not in sql
    return sql + ";"


def main():
    conn = get_connection()
    if conn is None:
        raise RuntimeError("SQL Server unavailable")
    cur = conn.cursor()
    try:
        sql = "\n".join(release_sql(i, i if i != 12 else 1) for i in range(1, 13))
        # Apply twice to verify repeat-event idempotency and legacy-state repair.
        cur.execute(FIXTURES + sql + sql + " SELECT BookingID, Status FROM @Bookings ORDER BY BookingID;")
        actual = {r.BookingID: r.Status for r in cur.fetchall()}
        expected = {1:"CANCELLED",2:"PENDING",3:"CONFIRMED",4:"COMPLETED",5:"CANCELLED",6:"PENDING",
                    7:"PENDING",8:"PENDING",9:"PENDING",10:"CANCELLED",11:"PENDING",12:"PENDING"}
        assert actual == expected, actual
        evidence = {"verifiedAt": datetime.now(timezone.utc).isoformat(), "engine":"SQL Server",
                    "mode":"Session table-variable fixtures only", "applicationTableWrites":0,
                    "bookingStatesChecked":12, "repeatEvent":"idempotent", "states":actual,
                    "limitations":"Does not verify physical row locks or live concurrent financial writes."}
        (ROOT / "docs" / "T123-164-sql-verification.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(evidence))
    finally:
        cur.close()
        conn.rollback()
        conn.close()


if __name__ == "__main__":
    main()
