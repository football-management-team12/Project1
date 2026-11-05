"""Read-only SQL Server reconciliation. Never creates invoices or test data.

Run from repository root: python backend/scripts/verify_uc08_readonly.py
Uses the application's existing connection configuration without printing it.
Only aggregate counts and schema column names are printed (no customer data).
"""
import contextlib
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import get_connection
from services.invoice_service import get_invoice
from services.payment_service import PaymentError
from flask import Flask
from routes.invoice import invoice_bp
from services.jwt_service import create_access_token


def main():
    with contextlib.redirect_stdout(io.StringIO()):
        conn = get_connection()
    if conn is None:
        print("SQL_SERVER_UNAVAILABLE: reconciliation was not run.")
        return 1
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME IN ('Invoices', 'Bookings', 'Payments',
                                 'FootballFields', 'BookingDepositRefunds')
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        """)
        for row in cursor.fetchall():
            print(f"Schema: {row.TABLE_NAME}.{row.COLUMN_NAME} ({row.DATA_TYPE})")
        cursor.execute("SELECT TOP 1 UserID FROM Users WHERE Role='ADMIN' AND Status='ACTIVE'")
        admin = cursor.fetchone()
        if admin is None:
            print("No active ADMIN available to verify the invoice service.")
            return 1
        cursor.execute("""
            SELECT I.InvoiceID, B.BookingID, B.UserID, B.TotalAmount,
                   F.FieldID, F.FieldName, F.IsArchived,
                   COALESCE(SUM(CASE WHEN P.Status='SUCCESS'
                       AND P.PaymentType='DEPOSIT' THEN P.Amount ELSE 0 END), 0) AS Deposit,
                   COALESCE(SUM(CASE WHEN P.Status='SUCCESS'
                       AND P.PaymentType IN ('DEPOSIT','FINAL_PAYMENT')
                       THEN P.Amount ELSE 0 END), 0) AS ExpectedPaid
            FROM Bookings B
            LEFT JOIN Invoices I ON I.BookingID=B.BookingID
            LEFT JOIN FootballFields F ON F.FieldID=B.FieldID
            LEFT JOIN Payments P ON P.BookingID=B.BookingID
            GROUP BY I.InvoiceID, B.BookingID, B.UserID, B.TotalAmount,
                     F.FieldID, F.FieldName, F.IsArchived
        """)
        rows = cursor.fetchall()
        counts = {"UNPAID": 0, "PARTIALLY_PAID": 0, "PAID": 0}
        conflicts = 0
        evidence = {"checkedAt": datetime.now(timezone.utc).isoformat(),
                    "mode": "Real SQL Server with Flask test client; SELECT only",
                    "fixtures": [], "httpChecks": [], "missingIssuedStates": []}
        app = Flask(__name__)
        app.register_blueprint(invoice_bp, url_prefix="/api")
        client = app.test_client()
        admin_headers = {"Authorization": "Bearer " + create_access_token(admin.UserID, "ADMIN")}
        cursor.execute("SELECT UserID FROM Users WHERE Role='CUSTOMER' AND Status='ACTIVE'")
        customers = {int(user.UserID) for user in cursor.fetchall()}
        issued_states = set()

        def check(path, expected, headers=None):
            response = client.get(path, headers=headers or {})
            evidence["httpChecks"].append({"path": path, "expected": expected,
                                           "actual": response.status_code})
            assert response.status_code == expected, (path, expected, response.status_code)
            return response.get_json()

        for row in rows:
            if row.InvoiceID is None and row.Deposit <= 0:
                continue
            try:
                info = get_invoice(admin.UserID, booking_id=row.BookingID)
            except PaymentError:
                conflicts += 1
                continue
            assert info["totalAmount"] == float(row.TotalAmount)
            assert info["paidAmount"] == float(row.ExpectedPaid)
            assert info["remainingAmount"] == float(row.TotalAmount - row.ExpectedPaid)
            assert info["field"]["fieldId"] == row.FieldID
            assert info["field"]["fieldName"] == row.FieldName
            counts[info["paymentStatus"]] += 1
            if row.InvoiceID is not None:
                issued_states.add(info["paymentStatus"])
            paths = [f"/api/bookings/{row.BookingID}/invoice"]
            if row.InvoiceID is not None:
                paths.append(f"/api/invoices/{row.InvoiceID}")
            for path in paths:
                assert check(path, 200, admin_headers) == info
                check(path, 401)
                check(path, 401, {"Authorization": "Bearer invalid"})
                if int(row.UserID) in customers:
                    owner_headers = {"Authorization": "Bearer " + create_access_token(row.UserID, "CUSTOMER")}
                    assert check(path, 200, owner_headers) == info
                other = next((user for user in customers if user != int(row.UserID)), None)
                if other is not None:
                    check(path, 403, {"Authorization": "Bearer " + create_access_token(other, "CUSTOMER")})
            evidence["fixtures"].append({
                "bookingId": row.BookingID, "invoiceId": row.InvoiceID,
                "archivedField": bool(row.IsArchived),
                "sqlTotal": float(row.TotalAmount), "sqlPaid": float(row.ExpectedPaid),
                "sqlRemaining": float(row.TotalAmount - row.ExpectedPaid),
                "response": info, "result": "PASS",
            })
        for table, column, path in (("Invoices", "InvoiceID", "/api/invoices/"),
                                    ("Bookings", "BookingID", "/api/bookings/")):
            cursor.execute(f"SELECT COALESCE(MAX({column}), 0) + 1 FROM {table}")
            missing_id = cursor.fetchone()[0]
            check(f"{path}{missing_id}" + ("/invoice" if table == "Bookings" else ""), 404, admin_headers)
        cursor.execute("""SELECT TOP 1 B.BookingID FROM Bookings B
            WHERE NOT EXISTS (SELECT 1 FROM Invoices I WHERE I.BookingID=B.BookingID)
              AND NOT EXISTS (SELECT 1 FROM Payments P WHERE P.BookingID=B.BookingID
                  AND P.PaymentType='DEPOSIT' AND P.Status='SUCCESS' AND P.Amount > 0)
              AND B.TotalAmount > 0""")
        unissued = cursor.fetchone()
        if unissued:
            check(f"/api/bookings/{unissued.BookingID}/invoice", 404, admin_headers)
        evidence.update(states=counts, conflicts=conflicts,
                        missingIssuedStates=sorted(set(counts) - issued_states))
        if len(sys.argv) == 3 and sys.argv[1] == "--evidence":
            output = Path(sys.argv[2])
            output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
            print(f"Evidence saved: {output}")
        print(f"Reconciled invoice states: {counts}; conflicts: {conflicts}")
        print(f"HTTP checks passed: {len(evidence['httpChecks'])}")
        print(f"Issued states missing in existing database: {evidence['missingIssuedStates']}")
        print("Missing states require existing fixtures; this script never seeds data.")
        return int(conflicts > 0)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
