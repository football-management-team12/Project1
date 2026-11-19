"""Durable SQL Server OTP state. No in-process rate limits or plaintext OTP storage."""
import hashlib
import hmac
import os
import re
import secrets
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import bcrypt
from database import get_connection
from services.auth_service import AuthenticationError, validate_new_password
from services.gmail_service import configuration, send_otp

GENERIC = "Nếu email thuộc tài khoản đang hoạt động, mã xác minh sẽ được gửi."


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)  # SQL datetime2 uses UTC.


def digest(value):
    secret = os.getenv("OTP_HASH_SECRET", "")
    if len(secret.encode()) < 32:
        raise AuthenticationError("Dịch vụ xác minh chưa được cấu hình.", 503)
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def identifier(value):
    try:
        return str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise AuthenticationError("Yêu cầu xác minh không hợp lệ.", 400) from None


def email_value(value):
    if not isinstance(value, str) or len(value) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value.strip()):
        raise AuthenticationError("Email không đúng định dạng.", 400)
    return value.strip().lower()


@contextmanager
def transaction():
    conn = get_connection()
    if conn is None:
        raise AuthenticationError("Không thể kết nối dịch vụ xác minh.", 503)
    cursor = None
    try:
        if conn.autocommit:
            raise RuntimeError("OTP requires an ODBC manual-commit connection")
        cursor = conn.cursor()
        # ODBC starts/ends the transaction. A T-SQL BEGIN here creates a nested
        # transaction whose outer work may survive commit() and roll back on close.
        cursor.execute("SET XACT_ABORT ON; SET LOCK_TIMEOUT 15000;")
        # One transaction-owned lock gives all gunicorn workers the same ordering,
        # including first-ever requests with no row to lock yet.
        cursor.execute("""DECLARE @r int;
            EXEC @r = sys.sp_getapplock @Resource='auth-email-otp-v1',
                @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=15000;
            IF @r < 0 THROW 51000, 'Auth lock unavailable', 1;""")
        yield conn, cursor
        commit_transaction(conn, cursor)
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            if cursor is not None:
                cursor.close()
        finally:
            conn.close()


def commit_transaction(conn, cursor):
    """Reject nested/doomed transactions before any successful API response.

    Used by normal completion and by error paths that must persist attempts.
    Do not inspect @@TRANCOUNT after commit: that query starts a new ODBC txn.
    """
    depth, state = cursor.execute("SELECT @@TRANCOUNT, XACT_STATE()").fetchone()
    if depth != 1 or state != 1:
        raise RuntimeError("OTP transaction is not a single committable ODBC transaction")
    conn.commit()


def check_rate(cursor, email, ip):
    timestamp = now()
    ip_hash = digest("ip:" + str(ip))
    cursor.execute("""SELECT COUNT(*) FROM dbo.EmailOtpSendAttempts
        WHERE CreatedAt > ? AND (Email = ? OR IpHash = ?)""",
                   timestamp - timedelta(hours=1), email, ip_hash)
    if cursor.fetchone()[0] >= 10:
        raise AuthenticationError("Quá nhiều yêu cầu. Vui lòng thử lại sau.", 429)
    cursor.execute("""SELECT COUNT(*) FROM dbo.EmailOtpSendAttempts
        WHERE CreatedAt > ? AND Email = ?""", timestamp - timedelta(seconds=60), email)
    if cursor.fetchone()[0]:
        raise AuthenticationError("Vui lòng đợi ít nhất 60 giây trước khi gửi lại.", 429)
    cursor.execute("INSERT dbo.EmailOtpSendAttempts (Email, IpHash, CreatedAt) VALUES (?, ?, ?)",
                   email, ip_hash, timestamp)


def issue(conn, cursor, email, purpose, pending_id=None, user_id=None):
    challenge_id = str(uuid.uuid4())
    otp = f"{secrets.randbelow(1000000):06d}"
    timestamp = now()
    hashed = digest(f"otp:{challenge_id}:{otp}")
    cursor.execute("UPDATE dbo.EmailOtpChallenges SET Consumed=1 WHERE Email=? AND Purpose=? AND Consumed=0",
                   email, purpose)
    cursor.execute("""INSERT dbo.EmailOtpChallenges
        (ChallengeID, Email, Purpose, PendingID, UserID, OtpHash, ExpiresAt, SentAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", challenge_id, email, purpose, pending_id,
                   user_id, hashed, timestamp + timedelta(minutes=5), timestamp)
    # Dummy challenges use exactly the same public response but never send mail.
    if purpose == "REGISTER" or user_id is not None:
        try:
            send_otp(email, otp, purpose)
        except AuthenticationError:
            cursor.execute("UPDATE dbo.EmailOtpChallenges SET Consumed=1 WHERE ChallengeID=?", challenge_id)
            commit_transaction(conn, cursor)  # Persist failed-send rate accounting.
            raise
    return {"challengeId": challenge_id, "expiresIn": 300, "resendAfter": 60,
            "message": GENERIC if purpose == "RESET_PASSWORD" else "Mã xác minh đã được gửi đến email của bạn."}


def duplicate(cursor, username, email, phone):
    cursor.execute("""SELECT TOP 1 UserID FROM dbo.Users WITH (UPDLOCK, HOLDLOCK)
        WHERE Username=? OR LOWER(LTRIM(RTRIM(Email)))=? OR Phone=?""", username, email, phone)
    if cursor.fetchone() is not None:
        raise AuthenticationError("Username/Email/Phone đã tồn tại.", 409)


def start_registration(values, ip):
    full_name, username, email, phone, password = values
    email = email_value(email)
    configuration()
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    with transaction() as (conn, cursor):
        duplicate(cursor, username, email, phone)
        check_rate(cursor, email, ip)
        pending_id = str(uuid.uuid4())
        cursor.execute("""INSERT dbo.PendingRegistrations
            (PendingID, FullName, Username, Email, Phone, PasswordHash, ExpiresAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)""", pending_id, full_name, username, email, phone,
                       password_hash, now() + timedelta(minutes=30))
        return issue(conn, cursor, email, "REGISTER", pending_id=pending_id)


def start_reset(email, ip):
    email = email_value(email)
    configuration()
    with transaction() as (conn, cursor):
        check_rate(cursor, email, ip)
        cursor.execute("""SELECT TOP 1 UserID FROM dbo.Users WITH (UPDLOCK, HOLDLOCK)
            WHERE LOWER(LTRIM(RTRIM(Email)))=? AND Status='ACTIVE'""", email)
        row = cursor.fetchone()
        return issue(conn, cursor, email, "RESET_PASSWORD", user_id=row[0] if row else None)


def challenge(cursor, challenge_id, purpose):
    challenge_id = identifier(challenge_id)
    cursor.execute("""SELECT ChallengeID, Email, Purpose, PendingID, UserID, OtpHash,
        ExpiresAt, SentAt, Attempts, Consumed FROM dbo.EmailOtpChallenges WITH (UPDLOCK, HOLDLOCK)
        WHERE ChallengeID=? AND Purpose=?""", challenge_id, purpose)
    row = cursor.fetchone()
    if not row or row.Consumed or row.Attempts >= 5:
        raise AuthenticationError("Mã xác minh không hợp lệ hoặc đã được sử dụng.", 400)
    return row


def resend(challenge_id, purpose, ip):
    configuration()
    with transaction() as (conn, cursor):
        row = challenge(cursor, challenge_id, purpose)
        check_rate(cursor, row.Email, ip)
        if purpose == "REGISTER":
            cursor.execute("SELECT ExpiresAt FROM dbo.PendingRegistrations WHERE PendingID=?", row.PendingID)
            pending = cursor.fetchone()
            if not pending or pending[0] <= now():
                raise AuthenticationError("Phiên đăng ký đã hết hạn. Vui lòng đăng ký lại.", 400)
        elif row.UserID is not None:
            cursor.execute("SELECT Status FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE UserID=?", row.UserID)
            user = cursor.fetchone()
            if not user or user[0] != "ACTIVE":
                return issue(conn, cursor, row.Email, purpose)
        return issue(conn, cursor, row.Email, purpose, row.PendingID, row.UserID)


def verify(challenge_id, otp, purpose):
    if not isinstance(otp, str) or not re.fullmatch(r"[0-9]{6}", otp):
        # Malformed guesses also consume the same attempt budget.
        otp = "invalid"
    with transaction() as (conn, cursor):
        row = challenge(cursor, challenge_id, purpose)
        if row.ExpiresAt <= now():
            raise AuthenticationError("Mã xác minh đã hết hạn. Vui lòng gửi lại.", 400)
        expected = digest(f"otp:{identifier(challenge_id)}:{otp}")
        if not hmac.compare_digest(row.OtpHash, expected) or (purpose == "RESET_PASSWORD" and row.UserID is None):
            cursor.execute("UPDATE dbo.EmailOtpChallenges SET Attempts=Attempts+1 WHERE ChallengeID=?", challenge_id)
            commit_transaction(conn, cursor)  # Wrong attempts survive the public error.
            raise AuthenticationError("Mã xác minh không đúng hoặc đã vượt quá số lần thử.", 400)
        if purpose == "REGISTER":
            cursor.execute("""SELECT FullName, Username, Email, Phone, PasswordHash, ExpiresAt
                FROM dbo.PendingRegistrations WITH (UPDLOCK, HOLDLOCK) WHERE PendingID=?""", row.PendingID)
            pending = cursor.fetchone()
            if not pending or pending.ExpiresAt <= now():
                raise AuthenticationError("Phiên đăng ký đã hết hạn.", 400)
            duplicate(cursor, pending.Username, pending.Email, pending.Phone)
            cursor.execute("""INSERT dbo.Users (FullName, Username, Email, Phone, PasswordHash, Role, Status)
                OUTPUT INSERTED.UserID VALUES (?, ?, ?, ?, ?, 'CUSTOMER', 'ACTIVE')""",
                           pending.FullName, pending.Username, pending.Email, pending.Phone, pending.PasswordHash)
            user_id = cursor.fetchone()[0]
            result = {"message": "Đăng ký thành công. Vui lòng đăng nhập.", "user": {"userId": user_id, "role": "CUSTOMER"}}
        else:
            cursor.execute("SELECT Status FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE UserID=?", row.UserID)
            user = cursor.fetchone()
            if not user or user[0] != "ACTIVE":
                raise AuthenticationError("Yêu cầu xác minh không hợp lệ.", 400)
            grant = secrets.token_urlsafe(32)
            cursor.execute("UPDATE dbo.PasswordResetGrants SET Consumed=1 WHERE UserID=?", row.UserID)
            cursor.execute("INSERT dbo.PasswordResetGrants (GrantHash, UserID, ExpiresAt) VALUES (?, ?, ?)",
                           digest("grant:" + grant), row.UserID, now() + timedelta(minutes=10))
            result = {"resetGrant": grant, "expiresIn": 600}
        cursor.execute("UPDATE dbo.EmailOtpChallenges SET Consumed=1 WHERE Email=? AND Purpose=?", row.Email, purpose)
        return result


def reset_password(grant, password):
    password = validate_new_password(password)
    if not isinstance(grant, str) or not 32 <= len(grant) <= 128:
        raise AuthenticationError("Phiên khôi phục không hợp lệ.", 400)
    hashed = digest("grant:" + grant)
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    with transaction() as (conn, cursor):
        cursor.execute("SELECT UserID, ExpiresAt, Consumed FROM dbo.PasswordResetGrants WITH (UPDLOCK, HOLDLOCK) WHERE GrantHash=?", hashed)
        row = cursor.fetchone()
        if not row or row.Consumed or row.ExpiresAt <= now():
            raise AuthenticationError("Phiên khôi phục đã hết hạn hoặc đã được sử dụng.", 400)
        cursor.execute("SELECT Email, Status FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE UserID=?", row.UserID)
        user = cursor.fetchone()
        if not user or user.Status != "ACTIVE":
            raise AuthenticationError("Tài khoản không hoạt động.", 400)
        cursor.execute("UPDATE dbo.Users SET PasswordHash=? WHERE UserID=?", password_hash, row.UserID)
        cursor.execute("UPDATE dbo.PasswordResetGrants SET Consumed=1 WHERE UserID=?", row.UserID)
        cursor.execute("UPDATE dbo.EmailOtpChallenges SET Consumed=1 WHERE Purpose='RESET_PASSWORD' AND (UserID=? OR Email=?)", row.UserID, user.Email.strip().lower())
        return {"message": "Đổi mật khẩu thành công. Vui lòng đăng nhập lại."}
