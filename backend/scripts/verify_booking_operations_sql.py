"""Real SQL/JWT-independent service checks, restricted to uniquely named temp tables."""

import json
import re
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import get_connection
from services.booking_operations import operate, history, store_cancellation
from services.payment_service import PaymentError


def main():
    names = (
        "Users",
        "Bookings",
        "Payments",
        "BookingCancellationRequests",
        "BookingCancellations",
        "BookingDepositRefunds",
        "BookingOperationEvents",
    )
    prefix = "##BookingOps_" + uuid4().hex[:10] + "_"

    def rewrite(sql):
        for name in names:
            sql = re.sub(
                r"(?<![\w#])(?:dbo\.)?" + name + r"\b", prefix + name, sql
            )
        assert "dbo." not in sql.lower(), "Application schema refused"
        return sql

    class Cursor:
        def __init__(self, inner):
            self.inner = inner

        def execute(self, sql, *args):
            self.inner.execute(rewrite(sql), *args)
            return self

        def __getattr__(self, key):
            return getattr(self.inner, key)

    class Connection:
        def __init__(self, inner):
            self.inner = inner

        def cursor(self):
            return Cursor(self.inner.cursor())

        def __getattr__(self, key):
            return getattr(self.inner, key)

    def connection():
        conn = get_connection()
        if conn is None:
            raise RuntimeError("SQL unavailable")
        return Connection(conn)

    owner = get_connection()
    if owner is None:
        raise RuntimeError("SQL unavailable")
    cur = owner.cursor()
    checks = []

    def sql(statement, *params):
        return cur.execute(rewrite(statement), *params)

    def blocked(booking, action, code, actor=1, reason="SQL fixture test"):
        try:
            operate(actor, booking, action, reason)
        except PaymentError as error:
            assert error.code == code, (error.code, code)
        else:
            raise AssertionError("Expected " + code)
        checks.append(code)

    try:
        sql("""
        SET NOCOUNT ON; CREATE TABLE dbo.Users(UserID INT PRIMARY KEY,Role
        VARCHAR(20),Status VARCHAR(20),FullName NVARCHAR(100)); CREATE TABLE
        dbo.Bookings(BookingID INT PRIMARY KEY,UserID INT,FieldID
        INT,BookingDate DATE,StartTime TIME,EndTime TIME,TotalAmount
        DECIMAL(18,2),Status VARCHAR(20)); CREATE TABLE dbo.Payments(PaymentID
        INT PRIMARY KEY,BookingID INT,PaymentType VARCHAR(30),Amount
        DECIMAL(18,2),Status VARCHAR(20),UpdatedAt DATETIME2); CREATE TABLE
        dbo.BookingCancellationRequests(RequestID INT PRIMARY KEY,BookingID
        INT,Status VARCHAR(30),Reason NVARCHAR(500),ReviewNote
        NVARCHAR(500),ReviewedAt DATETIME2,ReviewedByUserID INT); CREATE TABLE
        dbo.BookingCancellations(CancellationID INT IDENTITY PRIMARY
        KEY,BookingID INT UNIQUE,CanceledByUserID INT,CanceledByRole
        VARCHAR(20),Reason NVARCHAR(500),DepositPaid DECIMAL(18,2),RefundStatus
        VARCHAR(30),CanceledAt DATETIME2 DEFAULT SYSUTCDATETIME()); CREATE
        TABLE dbo.BookingDepositRefunds(BookingID INT PRIMARY KEY,Amount
        DECIMAL(18,2)); CREATE TABLE dbo.BookingOperationEvents(EventID INT
        IDENTITY PRIMARY KEY,BookingID INT,ActorUserID INT,EventType
        VARCHAR(40),Details NVARCHAR(MAX),OccurredAt DATETIME2 DEFAULT
        SYSUTCDATETIME()); INSERT dbo.Users VALUES (1, 'ADMIN' , 'ACTIVE' ,
        'QA Owner' ),(2, 'CUSTOMER' , 'ACTIVE' , 'QA Customer' ); INSERT
        dbo.Bookings VALUES (10,2,1, '2026-11-16' , '08:00' , '10:00' ,400,
        'CANCELLED' ), (11,2,2, '2026-11-16' , '08:00' , '10:00' ,400,
        'CANCELLED' ), (12,2,2, '2026-11-16' , '08:00' , '10:00' ,400,
        'CONFIRMED' ), (13,2,3, '2026-11-16' , '08:00' , '10:00' ,400,
        'CANCELLED' ), (20,2,4, '2026-11-16' , '06:00' , '08:00' ,400,
        'CONFIRMED' ), (21,2,5, '2026-11-16' , '06:00' , '08:00' ,400,
        'CONFIRMED' ), (22,2,6, '2026-11-16' , '07:00' , '08:00' ,400,
        'CONFIRMED' ), (23,2,7, '2026-11-16' , '06:00' , '08:00' ,400,
        'CONFIRMED' ), (24,2,8, '2026-11-16' , '06:00' , '08:00' ,400,
        'CONFIRMED' ); INSERT dbo.Payments VALUES (1,10, 'DEPOSIT' ,100,
        'SUCCESS' ,NULL),(2,20, 'DEPOSIT' ,100, 'SUCCESS' ,NULL), (3,23,
        'DEPOSIT' ,100, 'SUCCESS' ,NULL),(4,23, 'FINAL_PAYMENT' ,300, 'SUCCESS'
        ,NULL); INSERT dbo.BookingCancellationRequests VALUES(1,10, 'APPROVED'
        , 'QA cancel' , 'Original decision' ,SYSUTCDATETIME(),1), (2,24,
        'PENDING_REVIEW' , 'Timely cancellation' ,NULL,NULL,NULL); INSERT
        dbo.BookingCancellations(BookingID,CanceledByUserID,CanceledByRole,Reason,DepositPaid,RefundStatus)
        VALUES(10,1, 'ADMIN' , 'Original cancellation' ,100, 'MANUAL_REVIEW' );
        INSERT dbo.BookingDepositRefunds VALUES(13,100);
        """)
        owner.commit()
        with patch(
            "services.booking_operations.get_connection",
            side_effect=connection,
        ), patch(
            "services.cancellation_service._booking_now",
            return_value=datetime(2026, 11, 16, 6, 15),
        ):
            blocked(10, "restore-cancellation", "FORBIDDEN", actor=2)
            blocked(11, "restore-cancellation", "BOOKING_CONFLICT")
            blocked(13, "restore-cancellation", "REFUND_EXISTS")
            operate(
                1,
                10,
                "restore-cancellation",
                "Wrong approval; owner refused cancellation",
            )
            sql("SELECT Status FROM dbo.Bookings WHERE BookingID=10")
            assert cur.fetchone()[0] == "CONFIRMED"
            sql("""
                SELECT Status FROM dbo.BookingCancellationRequests WHERE
                RequestID=1
                """)
            assert cur.fetchone()[0] == "REJECTED"
            sql("""
                SELECT COUNT(*) FROM dbo.BookingCancellations WHERE
                BookingID=10
                """)
            assert cur.fetchone()[0] == 1
            checks.append("restore keeps original audit")
            result = history(1, 10)
            assert (
                result["events"][0]["details"]["requests"][0]["Status"]
                == "APPROVED"
            )
            assert history(2, 10)["events"][0]["details"] is None
            checks.append(
                "original decision retained, private snapshot owner-only"
            )
            operate(
                1,
                10,
                "approve-rejected-cancellation",
                "Owner corrects refusal to approval",
            )
            sql("SELECT Status FROM dbo.Bookings WHERE BookingID=10")
            assert cur.fetchone()[0] == "CANCELLED"
            sql("""
                SELECT Status FROM dbo.BookingCancellationRequests WHERE
                RequestID=1
                """)
            assert cur.fetchone()[0] == "APPROVED"
            operate(
                1, 10, "restore-cancellation", "Owner corrects approval again"
            )
            checks.append("both directions of mistaken decision are audited")
            operate(1, 21, "check-in")
            blocked(21, "no-show", "NO_SHOW_NOT_ALLOWED")
            blocked(22, "no-show", "NO_SHOW_NOT_ALLOWED")
            blocked(24, "check-in", "CANCELLATION_PENDING")
            blocked(24, "no-show", "NO_SHOW_NOT_ALLOWED")
            with patch(
                "services.cancellation_service._booking_now",
                return_value=datetime(2026, 11, 16, 8, 0),
            ):
                blocked(24, "no-show", "CANCELLATION_PENDING")
                operate(1, 23, "no-show", "Prepaid customer did not arrive")
                sql("""
                    SELECT RefundStatus,DepositPaid FROM
                    dbo.BookingCancellations WHERE BookingID=23
                    """)
                row = cur.fetchone()
                assert row[0] == "MANUAL_REVIEW" and int(row[1]) == 100
                sql("""
                    SELECT Details FROM dbo.BookingOperationEvents WHERE
                    BookingID=23 AND EventType= 'NO_SHOW'
                    """)
                assert Decimal(
                    json.loads(cur.fetchone()[0])["refundableAmount"]
                ) == Decimal(300)
                checks.append(
                    "no-show retains only deposit; prepaid excess queued for refund"
                )
                operate(1, 20, "no-show", "Customer did not arrive")
                sql("SELECT Status FROM dbo.Bookings WHERE BookingID=20")
                assert cur.fetchone()[0] == "CANCELLED"
                sql("""
                    SELECT RefundStatus FROM dbo.BookingCancellations WHERE
                    BookingID=20
                    """)
                assert cur.fetchone()[0] == "NOT_REQUIRED"
                checks.append(
                    "no-show retains deposit without additional charge"
                )
                blocked(20, "restore-cancellation", "RESTORE_NOT_ALLOWED")
            wrapped = Cursor(cur)
            store_cancellation(
                wrapped,
                10,
                1,
                "ADMIN",
                "New owner cancellation",
                100,
                "MANUAL_REVIEW",
            )
            owner.commit()
            sql("""
                SELECT COUNT(*) FROM dbo.BookingCancellations WHERE
                BookingID=10
                """)
            assert cur.fetchone()[0] == 1
            sql("""
                SELECT Details FROM dbo.BookingOperationEvents WHERE
                BookingID=10 AND EventType= 'CANCELLATION_AUDIT_REUSED'
                """)
            assert (
                json.loads(cur.fetchone()[0])["Reason"]
                == "Original cancellation"
            )
            checks.append("reused active audit preserves previous record")
        with patch(
            "services.booking_operations.get_connection",
            side_effect=connection,
        ), patch(
            "services.cancellation_service._booking_now",
            return_value=datetime(2026, 11, 16, 9, 0),
        ):
            operate(1, 22, "check-in", "")
            assert history(1, 22)["events"][0]["lateEntry"] is True
            checks.append(
                "late attendance needs no reason and preserves audit"
            )
        sql(
            "SELECT PaymentID,Amount,Status FROM dbo.Payments ORDER BY PaymentID"
        )
        assert [(r[0], int(r[1]), r[2]) for r in cur.fetchall()] == [
            (1, 100, "SUCCESS"),
            (2, 100, "SUCCESS"),
            (3, 100, "SUCCESS"),
            (4, 300, "SUCCESS"),
        ]
        checks.append("all successful payments unchanged")
        print(json.dumps({"passed": len(checks), "checks": checks}))
    finally:
        owner.rollback()
        for name in reversed(names):
            cur.execute(
                f"IF OBJECT_ID('tempdb..{prefix+name}') IS NOT NULL DROP TABLE {prefix+name}"
            )
        owner.commit()
        owner.close()


if __name__ == "__main__":
    main()
