"""Opt-in, loopback-only disposable SQL Server database; never use app DB_NAME."""
import os
import re
import uuid
from pathlib import Path

import pyodbc
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]


class DisposableSqlServer:
    def __init__(self):
        if os.getenv("AUTH_OTP_SQLSERVER_INTEGRATION") != "1":
            raise RuntimeError("Explicit integration opt-in required")
        expected = os.getenv("AUTH_OTP_TEST_SERVER_ID")
        if not expected:
            raise RuntimeError("Expected local SQL Server machine id required")
        settings = {**dotenv_values(ROOT / ".env"), **dotenv_values(ROOT / "backend/.env"), **os.environ}
        driver = next((d for d in ("ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server") if d in pyodbc.drivers()), None)
        if not driver:
            raise RuntimeError("Microsoft SQL Server ODBC driver required")
        def quoted(value):
            return "{" + str(value).replace("}", "}}") + "}"
        self.base = f"DRIVER={quoted(driver)};SERVER=127.0.0.1,1433;Encrypt=yes;TrustServerCertificate=yes;"
        if settings.get("DB_TRUSTED_CONNECTION", "").lower() in ("1", "yes", "true", "on"):
            self.base += "Trusted_Connection=yes;"
        else:
            if not settings.get("DB_USER") or not settings.get("DB_PASSWORD"):
                raise RuntimeError("Local SQL test credentials missing")
            self.base += f"UID={quoted(settings['DB_USER'])};PWD={quoted(settings['DB_PASSWORD'])};"
        self.name = "OtpIntegration_" + uuid.uuid4().hex
        self.admin = self.connect("master", autocommit=True)
        actual = self.admin.execute("SELECT CONVERT(nvarchar(128), SERVERPROPERTY('MachineName'))").fetchone()[0]
        if actual != expected:
            self.admin.close()
            raise RuntimeError("Local SQL Server identity mismatch; no writes performed")
        self.admin.execute(f"CREATE DATABASE [{self.name}]")

    def connect(self, database=None, autocommit=False):
        database = database or self.name
        if database != "master" and database != self.name:
            raise RuntimeError("Refusing database outside disposable test")
        try:
            conn = pyodbc.connect(self.base + f"DATABASE={database};", autocommit=autocommit, timeout=5)
            conn.timeout = 10
            return conn
        except pyodbc.Error:
            raise RuntimeError("Cannot connect to loopback SQL test database (details suppressed)") from None

    def close(self):
        if not re.fullmatch(r"OtpIntegration_[a-f0-9]{32}", self.name):
            raise RuntimeError("Invalid disposable database cleanup target")
        try:
            self.admin.execute(f"ALTER DATABASE [{self.name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE")
            self.admin.execute(f"DROP DATABASE [{self.name}]")
        finally:
            self.admin.close()
