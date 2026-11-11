"""Exercise admin booking progress, expiry, settlement and repair on #temp SQL only."""
import json
import os
import re
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app import app
from database import get_connection
from services.jwt_service import create_access_token

TABLES = ("BookingCancellationRequests", "BookingDepositRefunds", "FootballFields", "Bookings", "Payments", "Invoices", "Users")


def fixture_sql(sql):
    for name in TABLES:
        sql = re.sub(r"(?<![\w#])(?:dbo\.)?" + name + r"\b", "#BST_" + name, sql)
    if sql.lstrip().upper().startswith(("UPDATE", "INSERT", "DELETE")):
        assert "#BST_" in sql and "dbo." not in sql
    return sql


class Cursor:
    def __init__(self, cursor): self.cursor = cursor
    def execute(self, sql, *args):
        self.cursor.execute(fixture_sql(sql), *args)
        return self
    def __getattr__(self, name): return getattr(self.cursor, name)


class Connection:
    def __init__(self, conn): self.conn = conn
    def cursor(self): return Cursor(self.conn.cursor())
    def commit(self): self.conn.commit()
    def rollback(self): self.conn.rollback()
    def close(self): pass


def main():
    conn = get_connection()
    if conn is None: raise RuntimeError("SQL Server unavailable")
    cur = conn.cursor()
    try:
        cur.execute("""
            SET NOCOUNT ON;
            CREATE TABLE #BST_Users (UserID INT, Role VARCHAR(20), Status VARCHAR(20), FullName NVARCHAR(100), Phone VARCHAR(20), Email VARCHAR(80));
            CREATE TABLE #BST_FootballFields (FieldID INT, FieldName NVARCHAR(50), FieldType VARCHAR(30), Location NVARCHAR(100));
            CREATE TABLE #BST_Bookings (BookingID INT PRIMARY KEY, UserID INT DEFAULT 2, FieldID INT DEFAULT 5,
                BookingDate DATE DEFAULT DATEADD(DAY,-1,GETDATE()), StartTime TIME DEFAULT '18:00', EndTime TIME DEFAULT '19:00',
                TotalAmount DECIMAL(18,2) DEFAULT 350000, Status VARCHAR(20), CreatedAt DATETIME DEFAULT DATEADD(HOUR,-1,GETDATE()));
            CREATE TABLE #BST_Payments (PaymentID INT IDENTITY PRIMARY KEY, BookingID INT, InvoiceID INT NULL,
                PaymentType VARCHAR(30), Status VARCHAR(20), Amount DECIMAL(18,2), PaymentMethod VARCHAR(30), Method VARCHAR(30),
                Reference VARCHAR(100), TransactionCode VARCHAR(100), PaymentDate DATETIME, CreatedAt DATETIME, UpdatedAt DATETIME, Deadline DATETIME);
            CREATE TABLE #BST_Invoices (InvoiceID INT IDENTITY PRIMARY KEY, BookingID INT, Amount DECIMAL(18,2),
                PaidAmount DECIMAL(18,2), PaymentStatus VARCHAR(30), CreatedDate DATETIME);
            CREATE TABLE #BST_BookingDepositRefunds (BookingID INT, Amount DECIMAL(18,2));
            CREATE TABLE #BST_BookingCancellationRequests (BookingID INT, Status VARCHAR(30));
            INSERT #BST_Users VALUES (1,'ADMIN','ACTIVE','QA Admin','000','qa.invalid'),(2,'CUSTOMER','ACTIVE','QA Customer','000','customer.invalid');
            INSERT #BST_FootballFields VALUES (5,'QA field','7 player','QA');
            INSERT #BST_Bookings (BookingID,Status) VALUES (10,'PENDING'),(11,'CONFIRMED'),(12,'CONFIRMED'),
                (13,'CONFIRMED'),(14,'CONFIRMED'),(15,'COMPLETED'),(16,'CONFIRMED'),(17,'CONFIRMED'),
                (18,'CONFIRMED'),(19,'CONFIRMED'),(20,'PENDING'),(21,'CONFIRMED'),(22,'CONFIRMED');
            UPDATE #BST_Bookings SET BookingDate=DATEADD(DAY,1,GETDATE()) WHERE BookingID=13;
            UPDATE #BST_Bookings SET TotalAmount=0 WHERE BookingID=14;
            UPDATE #BST_Bookings SET CreatedAt=GETDATE() WHERE BookingID=19;
            INSERT #BST_Payments (BookingID,PaymentType,Status,Amount,Deadline) VALUES
                (12,'DEPOSIT','SUCCESS',100000,NULL),(13,'DEPOSIT','SUCCESS',100000,NULL),
                (16,'EXTRA','SUCCESS',50000,NULL),(20,'DEPOSIT','PENDING',100000,DATEADD(MINUTE,5,GETDATE())),
                (22,'DEPOSIT','FAILED',100000,DATEADD(MINUTE,-1,GETDATE()));
            INSERT #BST_Invoices (BookingID,Amount,PaidAmount,PaymentStatus) VALUES (17,350000,100000,'PARTIALLY_PAID');
            INSERT #BST_BookingCancellationRequests VALUES (18,'PENDING_REVIEW');
            INSERT #BST_BookingDepositRefunds VALUES (21,100000);
        """)
        conn.commit()
        checks = []
        client = app.test_client()
        with patch.dict(os.environ, {"JWT_SECRET": "booking-state-sql-only", "DEPOSIT_DEADLINE_MINUTES": "10"}), \
                patch("routes.booking.get_connection", return_value=Connection(conn)), \
                patch("services.invoice_cash_service.get_connection", return_value=Connection(conn)):
            headers = {"Authorization": "Bearer " + create_access_token(1, "ADMIN")}
            def call(method, path, status, payload=None):
                response = getattr(client, method)(path, headers=headers, json=payload)
                assert response.status_code == status, (path, response.status_code, response.get_json())
                checks.append({"method": method, "path": path, "status": response.status_code})
                return response.get_json()
            data = call("get", "/api/bookings/", 200)
            rows = {r["BookingID"]: r for r in data["Bookings"]}
            for bid in (10, 11, 22): assert rows[bid]["Status"] == "CANCELLED"
            for bid in (12,13,14,16,17,18,19,21): assert rows[bid]["Status"] == "CONFIRMED"
            assert rows[20]["Status"] == "PENDING" and rows[15]["Status"] == "COMPLETED"
            assert rows[12]["CanCompleteBooking"] is True and rows[13]["CanCompleteBooking"] is False
            assert call("patch", "/api/bookings/19/status", 409, {"Status":"COMPLETED"})["code"] == "DEPOSIT_REQUIRED"
            assert call("patch", "/api/bookings/13/status", 409, {"Status":"COMPLETED"})["code"] == "BOOKING_NOT_ENDED"
            call("patch", "/api/bookings/12/status", 200, {"Status":"COMPLETED"})
            settlement = call("get", "/api/bookings/12/settlement", 200)
            assert settlement["canConfirm"] is True and settlement["remainingAmount"] == 250000
            call("post", "/api/admin/bookings/12/confirm-final-payment", 200)
            detail = call("get", "/api/bookings/12", 200)
            assert detail["PaidAmount"] == 350000 and detail["DepositAmount"] == 100000 and detail["RemainingAmount"] == 0
            call("post", "/api/admin/bookings/12/confirm-final-payment", 409)
            call("patch", "/api/bookings/14/status", 200, {"Status":"COMPLETED"})
            assert call("get", "/api/bookings/14/settlement", 200)["canConfirm"] is False
            # The repair file is executed only after replacing ALL application tables with fixtures.
            sql = (ROOT / "backend/scripts/repair_unpaid_completed_bookings.sql").read_text(encoding="utf-8")
            sql = fixture_sql(sql).replace("DECLARE @BookingID INT = NULL;", "DECLARE @BookingID INT = 15;")
            assert "dbo." not in sql
            for apply in (False, True):
                cur.execute(sql.replace("DECLARE @Apply BIT = 0;", "DECLARE @Apply BIT = 1;" if apply else "DECLARE @Apply BIT = 0;"))
                while cur.nextset(): pass
                cur.execute("SELECT Status FROM #BST_Bookings WHERE BookingID=15")
                assert cur.fetchone()[0] == ("CANCELLED" if apply else "COMPLETED")
                checks.append({"repair_fixture_apply": apply, "expected_status": "CANCELLED" if apply else "COMPLETED"})
        print(json.dumps({"fixture_only":True,"live_table_writes":0,"checks":checks},indent=2))
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__": main()
