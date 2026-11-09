"""Exercise free-booking APIs on SQL Server connection-local #temp fixtures only."""
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT / "backend"))
from flask import Flask
from database import get_connection
from routes.payment import payment_bp
from services.availability_service import expire_pending_bookings
from services.jwt_service import create_access_token

TABLES = ("BookingCancellationRequests", "Bookings", "Payments", "Invoices", "Users")


class FixtureCursor:
    def __init__(self, cursor):
        self.cursor=cursor

    def execute(self, sql, *args):
        for name in TABLES:
            sql=re.sub(r"(?<![\w#])(?:dbo\.)?"+name+r"\b", "#T161_"+name, sql)
        if sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")):
            assert "#T161_" in sql and "dbo." not in sql, "Refused non-fixture mutation"
        self.cursor.execute(sql,*args)
        return self

    def __getattr__(self, name):
        return getattr(self.cursor,name)


class FixtureConnection:
    def __init__(self, conn):
        self.conn=conn

    def cursor(self):
        return FixtureCursor(self.conn.cursor())

    def commit(self):
        self.conn.commit()  # Only this connection's #temp fixture tables are mutated.

    def rollback(self):
        self.conn.rollback()

    def close(self):
        pass  # Keep fixtures alive between requests; main closes the real connection.


def main():
    conn=get_connection()
    if conn is None:
        raise RuntimeError("SQL Server unavailable")
    cur=conn.cursor()
    try:
        cur.execute("""
        SET NOCOUNT ON;
        CREATE TABLE #T161_Users (UserID INT, Role VARCHAR(20), Status VARCHAR(20));
        CREATE TABLE #T161_Bookings (BookingID INT PRIMARY KEY, UserID INT, FieldID INT,
            BookingDate DATE, StartTime TIME, EndTime TIME, TotalAmount DECIMAL(18,2), Status VARCHAR(20), CreatedAt DATETIME);
        CREATE TABLE #T161_Payments (PaymentID INT IDENTITY PRIMARY KEY, BookingID INT, PaymentType VARCHAR(30),
            PaymentMethod VARCHAR(30), Amount DECIMAL(18,2), Status VARCHAR(20), Reference VARCHAR(100),
            Deadline DATETIME, CreatedAt DATETIME, UpdatedAt DATETIME);
        CREATE TABLE #T161_Invoices (BookingID INT, Amount DECIMAL(18,2), PaidAmount DECIMAL(18,2));
        CREATE TABLE #T161_BookingCancellationRequests (RequestID INT, BookingID INT, Status VARCHAR(30));
        INSERT #T161_Users VALUES (1,'CUSTOMER','ACTIVE');
        INSERT #T161_Bookings VALUES
            (10,1,5,GETDATE(),'18:00','19:00',0,'PENDING',DATEADD(HOUR,-1,GETDATE())),
            (11,1,5,GETDATE(),'19:00','20:00',0,'PENDING',GETDATE()),
            (12,1,5,GETDATE(),'20:00','21:00',0,'CANCELLED',GETDATE()),
            (13,1,5,GETDATE(),'21:00','22:00',600000,'PENDING',GETDATE()),
            (14,1,5,GETDATE(),'22:00','23:00',0,'PENDING',DATEADD(HOUR,-1,GETDATE())),
            (15,1,5,GETDATE(),'16:00','17:00',600000,'PENDING',DATEADD(HOUR,-1,GETDATE()));
        INSERT #T161_Payments (BookingID,PaymentType,PaymentMethod,Amount,Status,Reference,Deadline,CreatedAt)
        VALUES (10,'DEPOSIT','VIETQR',200000,'PENDING','OLD-10',DATEADD(MINUTE,5,GETDATE()),GETDATE()),
               (11,'DEPOSIT','VIETQR',100000,'SUCCESS','PAID-11',GETDATE(),GETDATE()),
               (14,'DEPOSIT','VIETQR',200000,'PENDING','OLD-14',DATEADD(MINUTE,5,GETDATE()),GETDATE());
        """)
        conn.commit()
        app=Flask(__name__)
        app.register_blueprint(payment_bp,url_prefix="/api")
        client=app.test_client()
        checks=[]
        with patch.dict(os.environ,{"JWT_SECRET":"zero-total-sql-fixture-only","PAYMENT_DEMO_MODE":"true"}), \
                patch("services.payment_service.get_connection",return_value=FixtureConnection(conn)):
            headers={"Authorization":"Bearer "+create_access_token(1,"CUSTOMER")}
            def call(method,path,expected,payload=None):
                response=getattr(client,method)(path,headers=headers,json=payload)
                assert response.status_code==expected, (path,response.status_code,response.get_json())
                checks.append({"method":method,"path":path,"status":response.status_code})
                return response.get_json()
            free=call("get","/api/bookings/10/deposit",200)
            assert free["requiresDeposit"] is False and free["booking"]["status"]=="PENDING"
            call("patch","/api/payments/1/demo-status",409,{"status":"SUCCESS"})
            for _ in range(2):
                confirmed=call("post","/api/bookings/10/deposit",200)
                assert confirmed["bookingStatus"]=="CONFIRMED" and confirmed["paymentId"] is None
            cur.execute("SELECT Status FROM #T161_Payments WHERE BookingID=10")
            assert [r.Status for r in cur.fetchall()]==["EXPIRED"]
            cur.execute("SELECT COUNT(*) FROM #T161_Invoices")
            assert cur.fetchone()[0]==0
            call("post","/api/bookings/11/deposit",409)
            call("post","/api/bookings/12/deposit",409)
            call("patch","/api/payments/3/demo-status",200,{"status":"EXPIRED"})
            cur.execute("SELECT Status FROM #T161_Bookings WHERE BookingID=14")
            assert cur.fetchone().Status=="PENDING"
            positive=call("post","/api/bookings/13/deposit",201,{"amount":0,"TotalAmount":0})
            assert positive["amount"]==200000 and positive["paymentId"] is not None
            scoped=FixtureCursor(cur)
            expire_pending_bookings(scoped)
            cur.execute("SELECT BookingID,Status FROM #T161_Bookings WHERE BookingID IN (14,15)")
            states={r.BookingID:r.Status for r in cur.fetchall()}
            assert states=={14:"PENDING",15:"CANCELLED"}, states
            conn.commit()
        evidence={"verifiedAt":datetime.now(timezone.utc).isoformat(),"engine":"SQL Server",
                  "mode":"Flask/JWT APIs with connection-local #temp table fixtures",
                  "applicationTableWrites":0,"checks":checks,"freePaymentRowsCreated":0,
                  "freeInvoicesCreated":0,"legacyPendingAttempt":"EXPIRED","repeatConfirmation":"idempotent",
                  "expiryZeroVsPositive":states,"limitations":"Does not test independent concurrent sessions."}
        (ROOT/"docs"/"T123-161-sql-verification.json").write_text(json.dumps(evidence,indent=2)+"\n",encoding="utf-8")
        print(json.dumps(evidence))
    finally:
        cur.close()
        conn.rollback()
        conn.close()  # SQL Server automatically removes all #temp fixture tables.


if __name__=="__main__":
    main()
