"""Mock-only OTP regression tests. Never connect to a real database or Gmail."""
import base64
import os
import sys
import unittest
import uuid
from datetime import timedelta
from email import policy
from email.parser import BytesParser
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.auth import auth_bp
from services import otp_service as otp
from services import gmail_service as gmail
from services.auth_service import AuthenticationError, authenticate_user, verify_password


class OtpTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"OTP_HASH_SECRET": "test-only-" * 5})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.connection = patch.object(otp, "get_connection")
        self.conn = self.connection.start().return_value
        self.conn.autocommit = False
        self.addCleanup(self.connection.stop)
        self.cursor = self.conn.cursor.return_value
        self.cursor.execute.return_value.fetchone.return_value = (1, 1)
        self.send = patch.object(otp, "send_otp").start()
        self.config = patch.object(otp, "configuration").start()
        self.addCleanup(patch.stopall)
        self.cid = str(uuid.uuid4())
        self.row = Row(ChallengeID=self.cid, Email="a@example.com", Purpose="REGISTER",
                       PendingID=str(uuid.uuid4()), UserID=7, OtpHash=otp.digest(f"otp:{self.cid}:123456"),
                       ExpiresAt=otp.now() + timedelta(minutes=5), SentAt=otp.now(), Attempts=0, Consumed=False)
        app = Flask(__name__)
        app.register_blueprint(auth_bp, url_prefix="/api/auth")
        self.client = app.test_client()

    def test_registration_saves_bcrypt_pending_not_user(self):
        self.cursor.fetchone.side_effect = [None, (0,), (0,)]
        result = otp.start_registration(("Test", "test_user", "a@example.com", "0900000000", "Password1"), "127.0.0.1")
        self.assertEqual(result["expiresIn"], 300)
        self.assertNotIn("otp", result)
        calls = self.cursor.execute.call_args_list
        pending = next(c for c in calls if "INSERT dbo.PendingRegistrations" in c.args[0])
        self.assertTrue(verify_password("Password1", pending.args[-2]))
        self.assertFalse(any("INSERT dbo.Users" in c.args[0] for c in calls))
        self.assertEqual(len(self.send.call_args.args[1]), 6)
        self.conn.commit.assert_called_once()

    def test_registration_verify_creates_active_user_and_consumes(self):
        pending = Row(FullName="Test", Username="test_user", Email="a@example.com", Phone="0900000000",
                      PasswordHash="bcrypt-hash", ExpiresAt=otp.now() + timedelta(minutes=30))
        self.cursor.fetchone.side_effect = [self.row, pending, None, (7,)]
        result = otp.verify(self.cid, "123456", "REGISTER")
        self.assertEqual(result["user"]["userId"], 7)
        sql = " ".join(c.args[0] for c in self.cursor.execute.call_args_list)
        self.assertIn("'CUSTOMER', 'ACTIVE'", sql)
        self.assertIn("SET Consumed=1", sql)

    def test_wrong_and_malformed_guesses_persist_attempt(self):
        for guess in ("000000", {}, None, "12345", "abcdef"):
            self.cursor.fetchone.side_effect = None
            self.cursor.fetchone.return_value = self.row
            with self.assertRaises(AuthenticationError):
                otp.verify(self.cid, guess, "REGISTER")
        self.assertEqual(self.conn.commit.call_count, 5)
        self.assertTrue(any("Attempts=Attempts+1" in c.args[0] for c in self.cursor.execute.call_args_list))

    def test_expired_consumed_and_five_attempts_rejected(self):
        for changes in ({"ExpiresAt": otp.now() - timedelta(seconds=1)}, {"Consumed": True}, {"Attempts": 5}):
            self.cursor.fetchone.return_value = Row(**{**vars(self.row), **changes})
            with self.assertRaises(AuthenticationError):
                otp.verify(self.cid, "123456", "REGISTER")
        self.conn.commit.assert_not_called()

    def test_rate_limit_email_or_ip(self):
        self.cursor.fetchone.return_value = (10,)
        with self.assertRaises(AuthenticationError) as error:
            otp.start_reset("a@example.com", "127.0.0.1")
        self.assertEqual(error.exception.status_code, 429)
        self.send.assert_not_called()

    def test_resend_cooldown(self):
        self.cursor.fetchone.side_effect = [self.row, (0,), (1,)]
        with self.assertRaises(AuthenticationError) as error:
            otp.resend(self.cid, "REGISTER", "127.0.0.1")
        self.assertEqual(error.exception.status_code, 429)
        self.send.assert_not_called()

    def test_resend_rotates_hash_and_challenge(self):
        self.cursor.fetchone.side_effect = [self.row, (0,), (0,), (otp.now() + timedelta(minutes=10),)]
        result = otp.resend(self.cid, "REGISTER", "127.0.0.1")
        self.assertNotEqual(result["challengeId"], self.cid)
        sql = " ".join(c.args[0] for c in self.cursor.execute.call_args_list)
        self.assertIn("SET Consumed=1 WHERE Email=? AND Purpose=?", sql)
        self.send.assert_called_once()

    def test_unknown_email_generic_and_no_email_sent(self):
        self.cursor.fetchone.side_effect = [(0,), (0,), None]
        result = otp.start_reset("nobody@example.com", "127.0.0.1")
        self.assertEqual(result["message"], otp.GENERIC)
        self.assertIn("challengeId", result)
        self.send.assert_not_called()

    def test_known_email_has_same_contract(self):
        self.cursor.fetchone.side_effect = [(0,), (0,), (7,)]
        result = otp.start_reset("a@example.com", "127.0.0.1")
        self.assertEqual(result["message"], otp.GENERIC)
        self.assertEqual(set(result), {"message", "challengeId", "expiresIn", "resendAfter"})

    def test_reset_verify_only_stores_grant_hash(self):
        self.cursor.fetchone.side_effect = [self.row, ("ACTIVE",)]
        result = otp.verify(self.cid, "123456", "RESET_PASSWORD")
        calls = self.cursor.execute.call_args_list
        insert = next(c for c in calls if "INSERT dbo.PasswordResetGrants" in c.args[0])
        self.assertEqual(insert.args[1], otp.digest("grant:" + result["resetGrant"]))
        self.assertNotIn(result["resetGrant"], str(calls))

    def test_reset_updates_bcrypt_and_consumes_all_grants(self):
        self.cursor.fetchone.side_effect = [Row(UserID=7, Consumed=False, ExpiresAt=otp.now() + timedelta(minutes=10)),
                                             Row(Email="a@example.com", Status="ACTIVE")]
        otp.reset_password("x" * 43, "NewPassword1")
        update = next(c for c in self.cursor.execute.call_args_list if "UPDATE dbo.Users SET PasswordHash" in c.args[0])
        self.assertTrue(verify_password("NewPassword1", update.args[1]))
        self.assertFalse(verify_password("OldPassword1", update.args[1]))
        self.conn.commit.assert_called_once()

    def test_used_expired_missing_grant_rejected(self):
        for row in (None, Row(UserID=7, Consumed=True, ExpiresAt=otp.now()+timedelta(minutes=1)),
                    Row(UserID=7, Consumed=False, ExpiresAt=otp.now()-timedelta(seconds=1))):
            self.cursor.fetchone.return_value = row
            with self.assertRaises(AuthenticationError):
                otp.reset_password("x" * 43, "NewPassword1")
        self.conn.commit.assert_not_called()

    def test_duplicate_and_sql_error_rollback(self):
        self.cursor.fetchone.return_value = (7,)
        with self.assertRaises(AuthenticationError):
            otp.start_registration(("Test", "test_user", "a@example.com", "0900000000", "Password1"), "ip")
        self.conn.rollback.assert_called_once()
        self.cursor.fetchone.side_effect = RuntimeError("SQL failed")
        with self.assertRaises(RuntimeError):
            otp.start_reset("a@example.com", "ip")
        self.assertEqual(self.conn.rollback.call_count, 2)

    def test_send_failure_persists_consumed_challenge_and_rate(self):
        self.cursor.fetchone.side_effect = [(0,), (0,), (7,)]
        self.send.side_effect = AuthenticationError("Unavailable", 503)
        with self.assertRaises(AuthenticationError):
            otp.start_reset("a@example.com", "ip")
        self.conn.commit.assert_called_once()
        self.assertTrue(any("SET Consumed=1 WHERE ChallengeID=?" in c.args[0] for c in self.cursor.execute.call_args_list))

    def test_transaction_uses_database_lock_and_parameterized_queries(self):
        self.cursor.fetchone.side_effect = [(0,), (0,), None]
        otp.start_reset("a@example.com", "ip")
        self.assertIn("sp_getapplock", self.cursor.execute.call_args_list[1].args[0])
        self.assertTrue(all("a@example.com" not in c.args[0] for c in self.cursor.execute.call_args_list))

    def test_missing_secret_fails_closed(self):
        with patch.dict(os.environ, {"OTP_HASH_SECRET": ""}):
            with self.assertRaises(AuthenticationError):
                otp.digest("test")

    def test_invalid_json_and_uuid_fail_safely(self):
        self.assertEqual(self.client.post("/api/auth/reset-password", json=[]).status_code, 400)
        response = self.client.post("/api/auth/register/verify-otp", json={"challengeId": {}, "otp": "123456"})
        self.assertEqual(response.status_code, 400)

    def test_old_active_roles_still_login(self):
        import bcrypt
        hashed = bcrypt.hashpw(b"Password1", bcrypt.gensalt()).decode()
        for role in ("ADMIN", "STAFF", "CUSTOMER"):
            user = Row(UserID=7, FullName="Test", Email="a@example.com", Phone="0900000000", Role=role, Status="ACTIVE", PasswordHash=hashed)
            with patch("services.auth_service.get_connection") as connect:
                connect.return_value.cursor.return_value.fetchone.return_value = user
                self.assertEqual(authenticate_user("test_user", "Password1")["Role"], role)

    def test_register_verify_login_api_flow(self):
        self.cursor.fetchone.side_effect = [None, (0,), (0,)]
        response = self.client.post("/api/auth/register", json={"fullName": "Test User", "username": "test_user",
            "email": "a@example.com", "phone": "0900000000", "password": "Password1"})
        self.assertEqual(response.status_code, 202)
        cid = response.get_json()["challengeId"]
        code = self.send.call_args.args[1]
        inserts = self.cursor.execute.call_args_list
        pending_insert = next(c for c in inserts if "INSERT dbo.PendingRegistrations" in c.args[0])
        pending = Row(FullName="Test User", Username="test_user", Email="a@example.com", Phone="0900000000",
                      PasswordHash=pending_insert.args[-2], ExpiresAt=otp.now()+timedelta(minutes=30))
        row = Row(**{**vars(self.row), "ChallengeID": cid, "OtpHash": otp.digest(f"otp:{cid}:{code}")})
        self.cursor.fetchone.side_effect = [row, pending, None, (7,)]
        verified = self.client.post("/api/auth/register/verify-otp", json={"challengeId": cid, "otp": code})
        self.assertEqual(verified.status_code, 201)
        user_insert = next(c for c in self.cursor.execute.call_args_list if "INSERT dbo.Users" in c.args[0])
        user = Row(UserID=7, FullName=pending.FullName, Email=pending.Email, Phone=pending.Phone,
                   PasswordHash=user_insert.args[-1], Role="CUSTOMER", Status="ACTIVE")
        with patch("services.auth_service.get_connection") as connect:
            connect.return_value.cursor.return_value.fetchone.return_value = user
            logged_in = self.client.post("/api/auth/login", json={"account": "test_user", "password": "Password1"})
            self.assertEqual(logged_in.status_code, 200)
            self.assertTrue(logged_in.get_json()["accessToken"])

    def test_forgot_verify_reset_login_api_flow(self):
        self.cursor.fetchone.side_effect = [(0,), (0,), (7,)]
        response = self.client.post("/api/auth/forgot-password", json={"email": "a@example.com"})
        self.assertEqual(response.status_code, 202)
        cid = response.get_json()["challengeId"]
        code = self.send.call_args.args[1]
        row = Row(**{**vars(self.row), "ChallengeID": cid, "OtpHash": otp.digest(f"otp:{cid}:{code}")})
        self.cursor.fetchone.side_effect = [row, ("ACTIVE",)]
        verified = self.client.post("/api/auth/forgot-password/verify-otp", json={"challengeId": cid, "otp": code})
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(verified.headers["Cache-Control"], "no-store")
        grant = verified.get_json()["resetGrant"]
        self.cursor.fetchone.side_effect = [Row(UserID=7, Consumed=False, ExpiresAt=otp.now()+timedelta(minutes=10)),
                                             Row(Email="a@example.com", Status="ACTIVE")]
        reset = self.client.post("/api/auth/reset-password", json={"resetGrant": grant, "newPassword": "NewPassword1"})
        self.assertEqual(reset.status_code, 200)
        update = next(c for c in self.cursor.execute.call_args_list if "UPDATE dbo.Users SET PasswordHash" in c.args[0])
        user = Row(UserID=7, FullName="Test", Email="a@example.com", Phone="0900000000",
                   PasswordHash=update.args[1], Role="CUSTOMER", Status="ACTIVE")
        with patch("services.auth_service.get_connection") as connect:
            connect.return_value.cursor.return_value.fetchone.return_value = user
            for password, expected in (("NewPassword1", 200), ("OldPassword1", 401)):
                self.assertEqual(self.client.post("/api/auth/login", json={"account": "test_user", "password": password}).status_code, expected)

    def test_sql_failure_after_verify_insert_rolls_back(self):
        pending = Row(FullName="Test", Username="test_user", Email="a@example.com", Phone="0900000000",
                      PasswordHash="bcrypt", ExpiresAt=otp.now()+timedelta(minutes=30))
        self.cursor.fetchone.side_effect = [self.row, pending, None, RuntimeError("SQL insert failed")]
        response = self.client.post("/api/auth/register/verify-otp", json={"challengeId": self.cid, "otp": "123456"})
        self.assertEqual(response.status_code, 503)
        self.conn.rollback.assert_called_once()
        self.conn.commit.assert_not_called()
        self.assertNotIn("SQL insert failed", response.get_data(as_text=True))

    def test_nested_or_uncommittable_transaction_never_returns_success(self):
        for state in ((2, 1), (1, -1), (0, 0)):
            with self.subTest(state=state):
                self.cursor.fetchone.side_effect = [(0,), (0,), None]
                self.cursor.execute.return_value.fetchone.return_value = state
                response = self.client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
                self.assertEqual(response.status_code, 503)
                self.assertFalse(response.get_json()["success"])
        self.conn.commit.assert_not_called()

    def test_commit_failure_never_returns_success(self):
        self.cursor.fetchone.side_effect = [None, (0,), (0,)]
        self.conn.commit.side_effect = RuntimeError("commit failed")
        response = self.client.post("/api/auth/register", json={"fullName": "Test", "username": "test_user",
            "email": "a@example.com", "phone": "0900000000", "password": "Password1"})
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.get_json()["success"])
        self.conn.rollback.assert_called_once()

    def test_autocommit_connection_rejected_without_sending(self):
        self.conn.autocommit = True
        with self.assertRaises(RuntimeError):
            otp.start_reset("a@example.com", "ip")
        self.send.assert_not_called()
        self.conn.close.assert_called_once()


class GmailTests(unittest.TestCase):
    @patch.dict(os.environ, {}, clear=True)
    def test_missing_config(self):
        with self.assertRaises(AuthenticationError) as error:
            gmail.send_otp("a@example.com", "123456", "REGISTER")
        self.assertEqual(error.exception.status_code, 503)

    def test_send_mime_and_provider_errors(self):
        with patch.object(gmail, "configuration", return_value=("sender@example.com", {})), \
             patch("google.oauth2.credentials.Credentials.from_authorized_user_info") as credentials, \
             patch("google_auth_httplib2.AuthorizedHttp"), \
             patch("googleapiclient.discovery.build") as build:
            send = build.return_value.users.return_value.messages.return_value.send
            send.return_value.execute.return_value = {"id": "mock-id"}
            gmail.send_otp("a@example.com", "123456", "REGISTER")
            mime = BytesParser(policy=policy.default).parsebytes(base64.urlsafe_b64decode(send.call_args.kwargs["body"]["raw"]))
            self.assertIn("123456", mime.get_content())
            self.assertEqual(send.call_args.kwargs["userId"], "me")
            credentials.return_value.refresh.assert_called_once()
            for code in (401, 403, 429, 500, 503):
                from googleapiclient.errors import HttpError
                send.return_value.execute.side_effect = HttpError(Row(status=code, reason="mock"), b'{}')
                with self.assertRaises(AuthenticationError) as error:
                    gmail.send_otp("a@example.com", "123456", "RESET_PASSWORD")
                self.assertEqual(error.exception.status_code, 503)
                self.assertNotIn("123456", str(error.exception))

    def test_expired_refresh_token(self):
        from google.auth.exceptions import RefreshError
        with patch.object(gmail, "configuration", return_value=("sender@example.com", {})), \
             patch("google.oauth2.credentials.Credentials.from_authorized_user_info") as credentials, \
             patch("googleapiclient.discovery.build") as build:
            credentials.return_value.refresh.side_effect = RefreshError("invalid_grant secret-value")
            with self.assertRaises(AuthenticationError) as error:
                gmail.send_otp("a@example.com", "123456", "REGISTER")
            self.assertEqual(error.exception.status_code, 503)
            self.assertNotIn("secret-value", str(error.exception))
            build.assert_not_called()


if __name__ == "__main__":
    unittest.main()
