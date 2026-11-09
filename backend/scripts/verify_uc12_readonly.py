"""Verify UC12/UC08/UC09 GET contracts against existing SQL data, refusing writes.

No passwords, JWTs, customer names or complete payment responses are saved.
Run from repo root: backend/venv/Scripts/python.exe backend/scripts/verify_uc12_readonly.py
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app import app
from database import get_connection
from services.jwt_service import create_access_token

queries = []


class ReadCursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def execute(self, sql, *params):
        if not sql.lstrip().upper().startswith("SELECT"):
            raise AssertionError("Read-only verification refused a non-SELECT statement")
        queries.append(sql.split()[0])
        self.cursor.execute(sql, *params)
        return self

    def __getattr__(self, name):
        return getattr(self.cursor, name)


class ReadConnection:
    def __init__(self, conn):
        self.conn = conn

    def cursor(self):
        return ReadCursor(self.conn.cursor())

    def commit(self):
        raise AssertionError("Read-only verification refused commit")

    def close(self):
        self.conn.rollback()
        self.conn.close()


def connect():
    conn = get_connection()
    if conn is None:
        raise RuntimeError("Database unavailable")
    return ReadConnection(conn)


def main():
    conn = connect()
    cur = conn.cursor()
    try:
        cur.execute("SELECT OBJECT_ID(N'dbo.InvoiceAdminCancellations', N'U')")
        if cur.fetchone()[0] is None:
            raise RuntimeError("Migration 010 is not present in the configured database")
        cur.execute("SELECT TOP 1 UserID FROM dbo.Users WHERE Role='ADMIN' AND Status='ACTIVE' ORDER BY UserID")
        actor = cur.fetchone()
        if actor is None:
            raise RuntimeError("No active ADMIN fixture")
        admin_id = actor.UserID
    finally:
        cur.close()
        conn.close()
    client = app.test_client()
    headers = {"Authorization": "Bearer " + create_access_token(admin_id, "ADMIN")}
    checks, invoices = [], []

    def get(path, expected=200):
        response = client.get(path, headers=headers)
        data = response.get_json()
        assert response.status_code == expected, (path, response.status_code, data.get("code") if isinstance(data, dict) else None)
        checks.append({"path": path, "status": response.status_code})
        return data

    with patch("services.invoice_cash_service.get_connection", side_effect=connect):
        page = 1
        while True:
            result = get(f"/api/admin/invoices?page={page}&pageSize=100")
            invoices.extend(result["items"])
            if not result["hasNext"]:
                break
            page += 1
        for status in ("ACTIVE", "CANCELLED", "UNPAID", "PARTIALLY_PAID", "PAID"):
            filtered = get("/api/admin/invoices?status=" + status)
            assert all((r["invoiceStatus"] == status if status in {"ACTIVE", "CANCELLED"}
                        else r["invoiceStatus"] == "ACTIVE" and r["paymentStatus"] == status)
                       for r in filtered["items"])
        get("/api/admin/invoices?customer=%25_%5B&from=2026-01-01&to=2026-12-31")
        get("/api/admin/invoices?from=2026-11-10&to=2026-11-09", 400)
        get("/api/admin/invoices/2147483647", 404)
        for row in invoices:
            detail = get(f"/api/admin/invoices/{row['invoiceId']}")
            old = get(f"/api/invoices/{row['invoiceId']}")
            settlement = get(f"/api/bookings/{row['bookingId']}/settlement")
            for key in ("totalAmount", "paidAmount", "remainingAmount", "depositAmount"):
                assert detail[key] == old[key] == settlement[key], (row["invoiceId"], key)
            assert detail["paymentStatus"] == old["paymentStatus"] == settlement["status"]
            assert isinstance(detail["payments"], list)
        for role in ("CUSTOMER", "STAFF"):
            forbidden = {"Authorization": "Bearer " + create_access_token(admin_id, role)}
            for path in ("/api/admin/invoices", "/api/admin/invoices/1"):
                assert client.get(path, headers=forbidden).status_code == 403
                checks.append({"role": role, "path": path, "status": 403})
    evidence = {"verifiedAt": datetime.now(timezone.utc).isoformat(), "migration010Present": True,
                "invoiceCount": len(invoices), "checks": checks, "selectStatements": len(queries),
                "writes": 0, "note": "Real SQL reads; all service SQL restricted to SELECT, commit refused. No PATCH or cash confirmation executed."}
    output = ROOT / "docs" / "uc12-evidence" / "sql-readonly.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": len(checks), "invoices": len(invoices), "writes": 0}))


if __name__ == "__main__":
    main()
