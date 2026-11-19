"""Run real report SQL via Flask/JWT against uniquely named tempdb fixtures only.

Application-table access is refused by the rewriting adapter. No live writes.
"""
import argparse
import json
import os
from pathlib import Path
import re
import sys
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app import app
from database import get_connection
from services.jwt_service import create_access_token


def main(output):
    prefix = "##UC16_" + uuid4().hex[:12] + "_"
    tables = ("Users", "FootballFields", "Bookings", "Payments", "BookingDepositRefunds", "Invoices")

    def rewrite(sql):
        for name in tables:
            sql = re.sub(r"(?<![\w#])dbo\." + name + r"\b", prefix + name, sql)
        assert "dbo." not in sql.lower(), "Refused application-schema query"
        return sql

    class Cursor:
        def __init__(self, cursor): self.inner = cursor
        def execute(self, sql, *args): self.inner.execute(rewrite(sql), *args); return self
        def __getattr__(self, key): return getattr(self.inner, key)

    class Connection:
        def __init__(self, conn): self.inner = conn
        def cursor(self): return Cursor(self.inner.cursor())
        def __getattr__(self, key): return getattr(self.inner, key)
        @property
        def timeout(self): return self.inner.timeout
        @timeout.setter
        def timeout(self, value): self.inner.timeout = value

    def connection():
        conn = get_connection()
        if conn is None: raise RuntimeError("SQL unavailable")
        return Connection(conn)

    owner = get_connection()
    if owner is None: raise RuntimeError("SQL unavailable")
    cur = owner.cursor(); checks = []
    try:
        cur.execute(rewrite("""
            SET NOCOUNT ON;
            CREATE TABLE dbo.Users (UserID INT PRIMARY KEY,Role VARCHAR(20),Status VARCHAR(20));
            CREATE TABLE dbo.FootballFields (FieldID INT PRIMARY KEY,FieldName NVARCHAR(100),IsArchived BIT);
            CREATE TABLE dbo.Bookings (BookingID INT PRIMARY KEY,FieldID INT,BookingDate DATE,StartTime TIME,EndTime TIME,Status VARCHAR(20),TotalAmount DECIMAL(18,2) DEFAULT 100);
            CREATE TABLE dbo.Payments (PaymentID INT PRIMARY KEY,BookingID INT,PaymentType VARCHAR(30),Amount DECIMAL(18,2),
                Status VARCHAR(20),PaymentDate DATETIME2,CreatedAt DATETIME2,UpdatedAt DATETIME2);
            CREATE TABLE dbo.BookingDepositRefunds (BookingID INT PRIMARY KEY,Amount DECIMAL(18,2),ConfirmedAt DATETIME2);
            CREATE TABLE dbo.Invoices (InvoiceID INT PRIMARY KEY,BookingID INT,CreatedDate DATETIME2,PaymentStatus VARCHAR(30));
            INSERT dbo.Users VALUES (1,'ADMIN','ACTIVE'),(2,'CUSTOMER','ACTIVE'),(3,'ADMIN','INACTIVE');
            INSERT dbo.FootballFields VALUES (5,'QA Main',0),(6,'QA Archived',1),(7,'QA Free',0),(8,'QA Unused',0);
            INSERT dbo.Bookings (BookingID,FieldID,BookingDate,StartTime,EndTime,Status) VALUES
                (10,5,'2026-11-01','06:00','08:00','CONFIRMED'),
                (11,5,'2026-11-01','07:00','09:00','COMPLETED'),
                (12,5,'2026-11-01','09:00','10:00','CONFIRMED'),
                (13,5,'2026-11-02','10:00','12:00','CONFIRMED'),
                (14,6,'2026-11-01','18:00','20:00','COMPLETED'),
                (15,5,'2026-11-01','12:00','14:00','CANCELLED'),
                (16,5,'2026-11-01','14:00','16:00','PENDING'),
                (17,5,'2026-11-03','06:00','08:00','CONFIRMED'),
                (18,5,'2026-11-01','07:30','07:45','COMPLETED'),
                (19,5,'2026-11-02','22:00','06:00','COMPLETED'),
                (20,5,'2026-10-31','06:00','08:00','COMPLETED'),
                (21,7,'2026-11-02','00:00','01:00','CONFIRMED');
            INSERT dbo.Payments VALUES
                (1,10,'DEPOSIT',100,'SUCCESS','2026-11-01T00:00:00','2026-10-31','2026-11-01'),
                (2,10,'FINAL_PAYMENT',250,'SUCCESS','2026-11-02T23:59:59.9999999','2026-11-02','2026-11-02'),
                (3,11,'EXTRA',50,'SUCCESS','2026-11-01','2026-11-01','2026-11-01'),
                (4,10,'DEPOSIT',999,'PENDING',NULL,'2026-11-01','2026-11-01'),
                (5,10,'DEPOSIT',888,'FAILED',NULL,'2026-11-01','2026-11-01'),
                (6,10,'DEPOSIT',777,'EXPIRED',NULL,'2026-11-01','2026-11-01'),
                (7,10,'OTHER',999,'SUCCESS','2026-11-01','2026-11-01','2026-11-01'),
                (8,10,'DEPOSIT',-5,'SUCCESS','2026-11-01','2026-11-01','2026-11-01'),
                (9,10,'DEPOSIT',60,'SUCCESS','2026-11-03T00:00:00','2026-11-03','2026-11-03'),
                (10,10,'DEPOSIT',20,'SUCCESS',NULL,'2026-11-01','2026-11-02'),
                (11,10,'DEPOSIT',30,'SUCCESS',NULL,'2026-11-02',NULL),
                (12,10,'DEPOSIT',500,'SUCCESS','2026-10-31T23:59:59.9999999','2026-10-31','2026-10-31'),
                (13,10,'DEPOSIT',40,'SUCCESS',NULL,'2026-11-01','2026-11-03');
            INSERT dbo.BookingDepositRefunds VALUES (30,100,'2026-11-02T00:00:00'),(31,20,'2026-11-03');
            INSERT dbo.Invoices VALUES (1,10,'2026-11-01','PAID'),(2,11,'2026-11-02','PARTIALLY_PAID'),(3,17,'2026-11-03','PAID');
            UPDATE dbo.Bookings SET TotalAmount=50 WHERE BookingID=11;
            UPDATE dbo.Bookings SET TotalAmount=0 WHERE BookingID=21;
            INSERT dbo.Bookings VALUES
                (22,5,'2026-11-01','06:00','07:00','COMPLETED',100),
                (23,5,'2026-11-01','06:00','07:00','COMPLETED',100),
                (24,5,'2026-11-01','06:00','07:00','COMPLETED',100),
                (25,5,'2026-11-01','06:00','07:00','COMPLETED',100),
                (26,5,'2026-11-01','06:00','07:00','CONFIRMED',100),
                (27,5,'2026-11-01','06:00','07:00','CANCELLED',100),
                (28,5,'2026-11-01','06:00','07:00','COMPLETED',0),
                (29,5,'2026-11-01','06:00','07:00','COMPLETED',NULL),
                (30,5,'2026-11-01','06:00','07:00','COMPLETED',-1),
                (31,5,'2026-11-01','06:00','07:00','COMPLETED',100),
                (32,5,'2026-11-01','06:00','07:00','COMPLETED',100),
                (33,5,'2026-11-01','06:00','07:00','COMPLETED',100);
            INSERT dbo.Payments VALUES
                (22,22,'FINAL_PAYMENT',100,'SUCCESS','2026-10-31','2026-10-31','2026-10-31'),
                (23,23,'FINAL_PAYMENT',100,'PENDING',NULL,'2026-10-31','2026-10-31'),
                (24,24,'FINAL_PAYMENT',90,'SUCCESS','2026-10-31','2026-10-31','2026-10-31'),
                (25,25,'FINAL_PAYMENT',100,'SUCCESS','2026-10-31','2026-10-31','2026-10-31'),
                (26,26,'FINAL_PAYMENT',100,'SUCCESS','2026-10-31','2026-10-31','2026-10-31'),
                (27,27,'FINAL_PAYMENT',100,'SUCCESS','2026-10-31','2026-10-31','2026-10-31'),
                (31,31,'FINAL_PAYMENT',600,'FAILED',NULL,'2026-10-31','2026-10-31'),
                (32,32,'OTHER',100,'SUCCESS','2026-10-31','2026-10-31','2026-10-31'),
                (33,33,'DEPOSIT',40,'SUCCESS','2026-10-31','2026-10-31','2026-10-31'),
                (34,33,'FINAL_PAYMENT',40,'SUCCESS','2026-10-31','2026-10-31','2026-10-31'),
                (35,33,'EXTRA',20,'SUCCESS','2026-10-31','2026-10-31','2026-10-31');
            INSERT dbo.BookingDepositRefunds VALUES (25,20,'2026-10-31');
            INSERT dbo.Bookings VALUES
                (34,5,'2026-11-01','06:00','07:00','COMPLETED',350),
                (35,5,'2026-11-01','06:00','07:00','CONFIRMED',350),
                (36,5,'2026-11-01','06:00','07:00','CANCELLED',350);
            INSERT dbo.Payments VALUES
                (36,34,'DEPOSIT',100,'SUCCESS','2026-10-31','2026-10-31','2026-10-31'),
                (37,35,'DEPOSIT',100,'SUCCESS','2026-10-31','2026-10-31','2026-10-31'),
                (38,36,'DEPOSIT',100,'SUCCESS','2026-10-31','2026-10-31','2026-10-31');
            INSERT dbo.BookingDepositRefunds VALUES (35,100,'2026-10-31');
            INSERT dbo.Bookings VALUES (37,5,'2026-11-03','06:00','07:00','CONFIRMED',350);
            INSERT dbo.Payments VALUES (39,37,'DEPOSIT',100,'SUCCESS','2026-10-31','2026-10-31','2026-10-31');
        """)); owner.commit()
        before = {}
        for table in tables:
            cur.execute(rewrite("SELECT * FROM dbo." + table)); before[table] = sorted(map(tuple, cur.fetchall()))
        owner.commit()
        with patch.dict(os.environ, {"JWT_SECRET": "uc16-sql-fixture-only"}), patch("services.report_service.get_connection", side_effect=connection):
            client = app.test_client()
            def get(start="2026-11-01", end="2026-11-02", user=1, role="ADMIN", expected=200):
                response = client.get(f"/api/admin/reports/summary?from={start}&to={end}",
                                      headers={"Authorization": "Bearer " + create_access_token(user, role)})
                assert response.status_code == expected, (response.status_code, response.json)
                return response.json

            result = get()
            assert (result["grossRevenue"], result["refundedAmount"], result["revenue"]) == (450,100,350), result
            checks.append("Cash receipts: successful positive DEPOSIT/FINAL_PAYMENT/EXTRA only; no invoice double count")
            assert result["bookingCount"] == 4 and result["bookingStatusCount"] == {"COMPLETED":4}, result
            assert result["bookingBreakdown"] == {"completedPaid":4,"deposited":1,"cancelled":3,"unpaid":8,"paidAwaitingCompletion":3,"partiallyPaid":2,"refunded":1,"invalidAmount":2,"invalidStatus":0,"invalidBalance":1,"total":25}, result
            extended = get(end="2026-11-03")
            assert extended["bookingBreakdown"]["deposited"] == 2 and extended["bookingBreakdown"]["total"] == 27, extended
            checks.append("Upcoming deposited booking excluded before its BookingDate and included when filter end covers it; fully paid prior deposit not counted as partial")
            checks.append("Deposit-only completed booking excluded from completed-paid count; explicit booking categories partition all 25 bookings exactly once, excluding cancelled/refunded deposits")
            assert result["invoiceCount"] == 2, result
            assert "paymentStatusCount" not in result, result
            checks.append("Only completed fully paid bookings counted: includes free and combined successful receipts; excludes unpaid, partial, pending/failed/unknown payments, refunded shortfall, cancelled/confirmed and invalid totals")
            assert [(row["grossRevenue"],row["refundedAmount"],row["revenue"]) for row in result["dailyRevenue"]] == [(150,0,150),(300,100,200)]
            checks.append("Start midnight inclusive, end-of-day inclusive, next midnight excluded; success-date fallbacks")
            fields = {row["fieldId"]:row for row in result["fieldUtilization"]}
            assert len(fields) == 3 and fields[5]["bookedHours"] == 6 and fields[5]["utilizationPercent"] == 12.5, fields
            assert fields[6]["isArchived"] and fields[6]["bookedHours"] == 2 and fields[6]["utilizationPercent"] == 4.17
            assert fields[7]["bookedHours"] == 1 and fields[7]["capacityHours"] == 48
            checks.append("SQL interval union: overlap, nested and adjacent slots, separate days, archived/free fields; excludes cancelled/pending/invalid overnight intervals")
            single = get("2026-11-02", "2026-11-02")
            assert single["revenue"] == 200 and single["dayCount"] == 1
            empty = get("2026-12-01", "2026-12-02")
            assert empty["revenue"] == 0 and empty["bookingCount"] == 0 and empty["fieldUtilization"] == []
            assert len(empty["dailyRevenue"]) == 2
            checks.append("Single-day and no-data ranges")
            # Refund on another day than the receipt: cash-basis can be negative.
            cur.execute(rewrite("INSERT dbo.BookingDepositRefunds VALUES (32,80,'2026-12-01')")); owner.commit()
            negative = get("2026-12-01", "2026-12-01")
            assert negative["revenue"] == -80 and negative["grossRevenue"] == 0
            cur.execute(rewrite("DELETE dbo.BookingDepositRefunds WHERE BookingID=32")); owner.commit()
            checks.append("Refund-only day reports negative net revenue")
            get(user=2, role="CUSTOMER", expected=403); get(user=2, role="ADMIN", expected=403)
            get(user=3, expected=403); get(start="2026-11-03", end="2026-11-01", expected=400)
            checks.append("JWT role, current DB role/status and invalid-range guards")
        for table in tables:
            cur.execute(rewrite("SELECT * FROM dbo." + table)); assert sorted(map(tuple, cur.fetchall())) == before[table], table
        owner.commit()
        checks.append("All fixture tables identical before/after reporting; no application-table writes")
        evidence = {"fixture_only":True,"live_table_writes":0,"expected":{"grossRevenue":450,"refundedAmount":100,"revenue":350,"bookingCount":4,"invoiceCount":2},
                    "response":result,"checks":checks}
        if output:
            target = Path(output); target.parent.mkdir(parents=True,exist_ok=True)
            target.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print(json.dumps({"checks":checks,"passed":len(checks),"live_table_writes":0},indent=2))
    finally:
        owner.rollback()
        for table in reversed(tables):
            name = prefix + table
            assert re.fullmatch(r"##UC16_[a-f0-9]{12}_[A-Za-z]+", name)
            cur.execute(f"IF OBJECT_ID('tempdb..{name}') IS NOT NULL DROP TABLE {name}")
        owner.commit(); cur.close(); owner.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--output"); args = parser.parse_args(); main(args.output)
