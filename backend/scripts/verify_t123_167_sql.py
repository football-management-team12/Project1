"""Upload/download UC07 evidence using connection-local SQL fixtures only."""
import base64
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import app
from database import get_connection
from services.jwt_service import create_access_token

TABLES = ("BookingDepositRefunds", "Bookings", "Payments", "Invoices", "Users")


class FixtureCursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def execute(self, sql, *args):
        for name in TABLES:
            sql = re.sub(r"(?<![\w#])(?:dbo\.)?" + name + r"\b", "#T167_" + name, sql)
        if sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")):
            assert "#T167_" in sql and "dbo." not in sql, "Refused non-fixture mutation"
        self.cursor.execute(sql, *args)
        return self

    def __getattr__(self, name):
        return getattr(self.cursor, name)


class FixtureConnection:
    def __init__(self, connection):
        self.connection = connection

    def cursor(self):
        return FixtureCursor(self.connection.cursor())

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        pass  # Keep this connection's fixtures alive across HTTP requests.


def main():
    connection = get_connection()
    if connection is None:
        raise RuntimeError("SQL Server unavailable")
    cursor = connection.cursor()
    try:
        cursor.execute("""
            SET NOCOUNT ON;
            CREATE TABLE #T167_Users (UserID INT, Role VARCHAR(20), Status VARCHAR(20));
            CREATE TABLE #T167_Bookings (BookingID INT, UserID INT, FieldID INT,
                BookingDate DATE, StartTime TIME, EndTime TIME, TotalAmount DECIMAL(18,2), Status VARCHAR(20));
            CREATE TABLE #T167_Payments (BookingID INT, PaymentType VARCHAR(30), Status VARCHAR(20), Amount DECIMAL(18,2));
            CREATE TABLE #T167_Invoices (BookingID INT, PaymentStatus VARCHAR(20));
            CREATE TABLE #T167_BookingDepositRefunds (BookingID INT PRIMARY KEY, Amount DECIMAL(18,2),
                ConfirmedByUserID INT, TransactionReference NVARCHAR(100), EvidenceData VARBINARY(MAX),
                EvidenceMimeType VARCHAR(40), EvidenceFileName NVARCHAR(150));
            INSERT #T167_Users VALUES (1,'ADMIN','ACTIVE'),(2,'CUSTOMER','ACTIVE'),(3,'CUSTOMER','ACTIVE');
            INSERT #T167_Bookings VALUES (10,2,5,GETDATE(),'18:00','19:00',600000,'CANCELLED'),
                (11,2,5,GETDATE(),'19:00','20:00',600000,'CANCELLED');
            INSERT #T167_Payments VALUES (10,'DEPOSIT','SUCCESS',200000);
            INSERT #T167_BookingDepositRefunds (BookingID,Amount,ConfirmedByUserID)
                VALUES (11,200000,1);
        """)
        connection.commit()
        client = app.test_client()
        path = "/api/bookings/10/deposit-refund"
        original = b"%PDF-1.7\nUC07 SQL fixture receipt\x00\xff\n%%EOF"
        checks = []
        with patch.dict(os.environ, {"JWT_SECRET": "refund-sql-fixture-only"}), \
                patch("services.cancellation_service.get_connection", return_value=FixtureConnection(connection)):
            admin = {"Authorization": "Bearer " + create_access_token(1, "ADMIN")}
            response = client.post(path, headers=admin, json={
                "transactionReference": "QA-T167-10",
                "evidenceBase64": base64.b64encode(original).decode(),
                "evidenceMimeType": "application/pdf", "evidenceFileName": "qa-receipt.pdf",
            })
            assert response.status_code == 200, response.get_json()
            checks.append({"case": "upload_confirm_refund", "status": response.status_code})
            for user_id, role, expected in ((1, "ADMIN", 200), (2, "CUSTOMER", 200), (3, "CUSTOMER", 404)):
                headers = {"Authorization": "Bearer " + create_access_token(user_id, role)}
                response = client.get(path + "/evidence", headers=headers)
                assert response.status_code == expected, response.get_json()
                if expected == 200:
                    assert response.data == original
                    assert response.mimetype == "application/pdf"
                    assert response.content_length == len(original)
                    assert "qa-receipt.pdf" in response.headers["Content-Disposition"]
                else:
                    assert response.json["code"] == "BOOKING_NOT_FOUND"
                checks.append({"case": "download_" + str(user_id), "status": response.status_code})
                response.close()
            response = client.get("/api/bookings/11/deposit-refund/evidence", headers=admin)
            assert response.status_code == 404 and response.json["code"] == "EVIDENCE_NOT_FOUND"
            checks.append({"case": "legacy_refund_without_evidence", "status": response.status_code})
        cursor.execute("SELECT EvidenceData FROM #T167_BookingDepositRefunds WHERE BookingID=10")
        assert bytes(cursor.fetchone()[0]) == original
        print(json.dumps({"fixture_only": True, "live_table_writes": 0,
                          "sha256": hashlib.sha256(original).hexdigest(), "checks": checks}, indent=2))
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    main()
