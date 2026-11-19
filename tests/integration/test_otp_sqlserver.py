"""Real SQL Server, fake Gmail; independent reader verifies every API write.

Opt in with AUTH_OTP_SQLSERVER_INTEGRATION=1 and AUTH_OTP_TEST_SERVER_ID.
Only creates/uses/drops a randomly named OtpIntegration_* DB on 127.0.0.1:1433.
Never targets FootballBookingDB, DB_NAME, a VPS, or an existing database.
"""
import os
import secrets
import sys
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.auth import auth_bp
from services import otp_service as otp
from services.auth_service import AuthenticationError, verify_password
from otp_sqlserver_support import DisposableSqlServer, ROOT


class TrackedConnection:
    """Keep only transaction counters; never retain/log request SQL or parameters."""
    def __init__(self, real, traces, fail_commit=False):
        self.real = real
        self.traces = traces
        self.fail_commit = fail_commit

    @property
    def autocommit(self):
        return self.real.autocommit

    def cursor(self):
        return self.real.cursor()

    def count(self):
        cursor = self.real.cursor()
        try:
            return tuple(cursor.execute("SELECT @@TRANCOUNT, XACT_STATE()").fetchone())
        finally:
            cursor.close()

    def commit(self):
        self.traces.append(("before_commit", self.count()))
        if self.fail_commit:
            raise RuntimeError("Injected commit failure")
        self.real.commit()
        # This SELECT starts a NEW ODBC transaction. The reader checks durability.
        self.traces.append(("new_transaction_after_commit", self.count()))

    def rollback(self):
        self.real.rollback()

    def close(self):
        self.real.close()


@unittest.skipUnless(os.getenv("AUTH_OTP_SQLSERVER_INTEGRATION") == "1", "SQL Server integration opt-in required")
class OtpSqlServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = DisposableSqlServer()
        cls.addClassCleanup(cls.db.close)
        conn = cls.db.connect(autocommit=True)
        try:
            conn.execute("""CREATE TABLE dbo.Users (
                UserID int IDENTITY PRIMARY KEY, FullName nvarchar(100) NOT NULL,
                Username varchar(30) NOT NULL, Email nvarchar(254) NOT NULL,
                Phone varchar(10) NOT NULL, PasswordHash varchar(60) NOT NULL,
                Role varchar(20) NOT NULL, Status varchar(20) NOT NULL)""")
            migration = (ROOT / "backend/migrations/014_auth_email_otp.sql").read_text(encoding="utf-8")
            for _ in range(2):  # Also verify idempotent application on the disposable DB.
                cursor = conn.cursor()
                try:
                    cursor.execute(migration)
                    while cursor.nextset():
                        pass
                finally:
                    cursor.close()
        finally:
            conn.close()

    def setUp(self):
        self.traces = []
        self.sent = {}
        self.fail_commit = False
        self.inject_nested = False
        def connect():
            real = self.db.connect()
            if self.inject_nested:
                real.execute("BEGIN TRANSACTION")
            return TrackedConnection(real, self.traces, self.fail_commit)
        self.patchers = [patch.object(otp, "get_connection", side_effect=connect),
                         patch.object(otp, "configuration"),
                         patch.object(otp, "send_otp", side_effect=lambda email, code, purpose: self.sent.update({email: code})),
                         patch.dict(os.environ, {"OTP_HASH_SECRET": "integration-test-only-" * 3})]
        for patcher in self.patchers:
            patcher.start()
            self.addCleanup(patcher.stop)
        self.app = Flask(__name__)
        self.app.register_blueprint(auth_bp, url_prefix="/api/auth")
        self.client = self.app.test_client()
        tag = uuid.uuid4().hex[:16]
        self.email = f"{tag}@example.invalid"
        self.ip = "10." + ".".join(str(secrets.randbelow(256)) for _ in range(3))
        self.values = {"fullName": "OTP Integration", "username": "otp_" + tag,
                       "email": self.email, "phone": "0" + f"{secrets.randbelow(10**9):09d}",
                       "password": "TestPassword1!"}
        # Separate autocommit reader, opened before API calls and never patched.
        self.reader = self.db.connect(autocommit=True)
        self.addCleanup(self.reader.close)
        self.reader.execute("SET LOCK_TIMEOUT 2000")

    def scalar(self, sql, *args):
        cursor = self.reader.cursor()
        try:
            return cursor.execute(sql, *args).fetchone()[0]
        finally:
            cursor.close()

    def post(self, path, data, expected):
        response = self.client.post("/api/auth/" + path, json=data, environ_overrides={"REMOTE_ADDR": self.ip})
        self.assertEqual(response.status_code, expected)
        self.assertEqual(response.get_json()["success"], expected < 400)
        return response.get_json()

    def register(self):
        result = self.post("register", self.values, 202)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.PendingRegistrations WHERE Email=?", self.email), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpChallenges WHERE ChallengeID=? AND Consumed=0", result["challengeId"]), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpSendAttempts WHERE Email=?", self.email), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.Users WHERE Email=?", self.email), 0)
        return result

    def allow_resend(self):
        # Test-clock adjustment only inside the disposable DB; no sleep needed.
        self.reader.execute("UPDATE dbo.EmailOtpSendAttempts SET CreatedAt=DATEADD(second,-61,SYSUTCDATETIME()) WHERE Email=?", self.email)

    def activate(self):
        result = self.register()
        self.post("register/verify-otp", {"challengeId": result["challengeId"], "otp": self.sent[self.email]}, 201)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.Users WHERE Email=? AND Role='CUSTOMER' AND Status='ACTIVE'", self.email), 1)
        self.assertEqual(self.scalar("SELECT CONVERT(int,Consumed) FROM dbo.EmailOtpChallenges WHERE ChallengeID=?", result["challengeId"]), 1)
        return result

    def test_all_seven_endpoints_visible_from_independent_connection(self):
        initial = self.register()
        old_code = self.sent[self.email]
        self.allow_resend()
        resent = self.post("register/resend-otp", {"challengeId": initial["challengeId"]}, 202)
        self.assertEqual(self.scalar("SELECT CONVERT(int,Consumed) FROM dbo.EmailOtpChallenges WHERE ChallengeID=?", initial["challengeId"]), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpChallenges WHERE ChallengeID=? AND Consumed=0", resent["challengeId"]), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpSendAttempts WHERE Email=?", self.email), 2)
        self.post("register/verify-otp", {"challengeId": initial["challengeId"], "otp": old_code}, 400)
        self.post("register/verify-otp", {"challengeId": resent["challengeId"], "otp": self.sent[self.email]}, 201)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.Users WHERE Email=? AND Status='ACTIVE'", self.email), 1)
        self.post("register/verify-otp", {"challengeId": resent["challengeId"], "otp": self.sent[self.email]}, 400)
        self.allow_resend()
        forgot = self.post("forgot-password", {"email": self.email}, 202)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpChallenges WHERE ChallengeID=? AND Consumed=0", forgot["challengeId"]), 1)
        self.allow_resend()
        reset_otp = self.post("forgot-password/resend-otp", {"challengeId": forgot["challengeId"]}, 202)
        self.assertEqual(self.scalar("SELECT CONVERT(int,Consumed) FROM dbo.EmailOtpChallenges WHERE ChallengeID=?", forgot["challengeId"]), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpChallenges WHERE ChallengeID=? AND Consumed=0", reset_otp["challengeId"]), 1)
        verified = self.post("forgot-password/verify-otp", {"challengeId": reset_otp["challengeId"], "otp": self.sent[self.email]}, 200)
        grant_hash = otp.digest("grant:" + verified["resetGrant"])
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.PasswordResetGrants WHERE GrantHash=? AND Consumed=0", grant_hash), 1)
        self.assertEqual(self.scalar("SELECT CONVERT(int,Consumed) FROM dbo.EmailOtpChallenges WHERE ChallengeID=?", reset_otp["challengeId"]), 1)
        self.post("reset-password", {"resetGrant": verified["resetGrant"], "newPassword": "NewTestPassword1!"}, 200)
        self.assertEqual(self.scalar("SELECT CONVERT(int,Consumed) FROM dbo.PasswordResetGrants WHERE GrantHash=?", grant_hash), 1)
        hashed = self.scalar("SELECT PasswordHash FROM dbo.Users WHERE Email=?", self.email)
        self.assertTrue(verify_password("NewTestPassword1!", hashed))
        self.assertFalse(verify_password(self.values["password"], hashed))
        self.post("reset-password", {"resetGrant": verified["resetGrant"], "newPassword": "AnotherPassword1!"}, 400)
        self.assertTrue(self.traces)
        self.assertTrue(all(state == (1, 1) for _, state in self.traces))

    def test_wrong_otp_attempts_persist_despite_error_rollback(self):
        result = self.register()
        correct = self.sent[self.email]
        wrong = "000000" if correct != "000000" else "000001"
        for attempt in range(1, 6):
            self.post("register/verify-otp", {"challengeId": result["challengeId"], "otp": wrong}, 400)
            self.assertEqual(self.scalar("SELECT Attempts FROM dbo.EmailOtpChallenges WHERE ChallengeID=?", result["challengeId"]), attempt)
        self.post("register/verify-otp", {"challengeId": result["challengeId"], "otp": correct}, 400)

    def test_reset_wrong_otp_attempt_commits(self):
        self.activate()
        self.allow_resend()
        result = self.post("forgot-password", {"email": self.email}, 202)
        wrong = "000000" if self.sent[self.email] != "000000" else "000001"
        self.post("forgot-password/verify-otp", {"challengeId": result["challengeId"], "otp": wrong}, 400)
        self.assertEqual(self.scalar("SELECT Attempts FROM dbo.EmailOtpChallenges WHERE ChallengeID=?", result["challengeId"]), 1)

    def test_gmail_failure_commits_consumed_challenge_and_rate(self):
        with patch.object(otp, "send_otp", side_effect=AuthenticationError("Mock Gmail unavailable", 503)):
            self.post("register", self.values, 503)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.PendingRegistrations WHERE Email=?", self.email), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpChallenges WHERE Email=? AND Consumed=1", self.email), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpSendAttempts WHERE Email=?", self.email), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.Users WHERE Email=?", self.email), 0)

    def test_unknown_email_dummy_challenge_is_durable(self):
        result = self.post("forgot-password", {"email": self.email}, 202)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpChallenges WHERE ChallengeID=? AND UserID IS NULL", result["challengeId"]), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpSendAttempts WHERE Email=?", self.email), 1)
        self.assertNotIn(self.email, self.sent)

    def test_register_commit_failure_returns_503_and_rolls_back(self):
        self.fail_commit = True
        self.post("register", self.values, 503)
        self.assertIn(self.email, self.sent)  # Mail can precede commit, but API must fail.
        for table in ("PendingRegistrations", "EmailOtpChallenges", "EmailOtpSendAttempts", "Users"):
            self.assertEqual(self.scalar(f"SELECT COUNT(*) FROM dbo.{table} WHERE Email=?", self.email), 0)

    def test_commit_failure_on_wrong_otp_returns_503_not_false_persistence(self):
        result = self.register()
        self.fail_commit = True
        wrong = "000000" if self.sent[self.email] != "000000" else "000001"
        self.post("register/verify-otp", {"challengeId": result["challengeId"], "otp": wrong}, 503)
        self.assertEqual(self.scalar("SELECT Attempts FROM dbo.EmailOtpChallenges WHERE ChallengeID=?", result["challengeId"]), 0)

    def test_commit_failure_on_gmail_error_rolls_back(self):
        self.fail_commit = True
        with patch.object(otp, "send_otp", side_effect=AuthenticationError("Mock Gmail unavailable", 503)):
            self.post("register", self.values, 503)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpSendAttempts WHERE Email=?", self.email), 0)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpChallenges WHERE Email=?", self.email), 0)

    def test_nested_transaction_guard_never_returns_success(self):
        self.inject_nested = True
        self.post("register", self.values, 503)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.EmailOtpChallenges WHERE Email=?", self.email), 0)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.PendingRegistrations WHERE Email=?", self.email), 0)

    def snapshot(self):
        # Retained only in test memory, never printed (no OTP/plain password columns).
        queries = [f"SELECT * FROM dbo.{table} WHERE Email=?" for table in
                   ("PendingRegistrations", "EmailOtpChallenges", "EmailOtpSendAttempts", "Users")]
        queries.append("SELECT * FROM dbo.PasswordResetGrants WHERE UserID IN (SELECT UserID FROM dbo.Users WHERE Email=?)")
        values = []
        for sql in queries:
            cursor = self.reader.cursor()
            try:
                values.append(sorted(tuple(row) for row in cursor.execute(sql, self.email).fetchall()))
            finally:
                cursor.close()
        return values

    def assert_commit_failure(self, path, payload):
        before = self.snapshot()
        self.fail_commit = True
        try:
            self.post(path, payload, 503)
        finally:
            self.fail_commit = False
        self.assertTrue(before == self.snapshot(), "Rows changed despite failed commit")

    def test_commit_failure_for_each_endpoint_preserves_previous_state(self):
        self.assert_commit_failure("register", self.values)
        registered = self.register()
        self.allow_resend()
        self.assert_commit_failure("register/resend-otp", {"challengeId": registered["challengeId"]})
        # A rejected resend may have sent mail. Obtain a new durable challenge/code.
        resent = self.post("register/resend-otp", {"challengeId": registered["challengeId"]}, 202)
        payload = {"challengeId": resent["challengeId"], "otp": self.sent[self.email]}
        self.assert_commit_failure("register/verify-otp", payload)
        self.post("register/verify-otp", payload, 201)
        self.allow_resend()
        self.assert_commit_failure("forgot-password", {"email": self.email})
        forgot = self.post("forgot-password", {"email": self.email}, 202)
        self.allow_resend()
        self.assert_commit_failure("forgot-password/resend-otp", {"challengeId": forgot["challengeId"]})
        resent = self.post("forgot-password/resend-otp", {"challengeId": forgot["challengeId"]}, 202)
        payload = {"challengeId": resent["challengeId"], "otp": self.sent[self.email]}
        self.assert_commit_failure("forgot-password/verify-otp", payload)
        verified = self.post("forgot-password/verify-otp", payload, 200)
        self.assert_commit_failure("reset-password", {"resetGrant": verified["resetGrant"], "newPassword": "NewPassword1!"})

    def test_concurrent_verification_creates_exactly_one_durable_user(self):
        registered = self.register()
        payload = {"challengeId": registered["challengeId"], "otp": self.sent[self.email]}
        def request():
            with self.app.test_client() as client:
                return client.post("/api/auth/register/verify-otp", json=payload, environ_overrides={"REMOTE_ADDR": self.ip}).status_code
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(request) for _ in range(2)]
            codes = sorted(future.result(timeout=20) for future in futures)
        self.assertEqual(codes, [201, 400])
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM dbo.Users WHERE Email=?", self.email), 1)
        self.assertEqual(self.scalar("SELECT CONVERT(int,Consumed) FROM dbo.EmailOtpChallenges WHERE ChallengeID=?", registered["challengeId"]), 1)


if __name__ == "__main__":
    unittest.main()
