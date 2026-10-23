import os
import sys

import bcrypt
import re
from email.utils import parseaddr


sys.path.append(

    os.path.dirname(

        os.path.dirname(
            __file__
        )
    )
)


from database import get_connection


class AuthenticationError(
    Exception
):

    def __init__(
        self,
        message,
        status_code=401
    ):

        super().__init__(
            message
        )

        self.message = message

        self.status_code = (
            status_code
        )


def register_customer(full_name, username, email, phone, password):
    """Validate and create a CUSTOMER account atomically."""
    if not all(isinstance(value, str) for value in (full_name, username, email, phone, password)):
        raise AuthenticationError("Vui lòng nhập đầy đủ thông tin hợp lệ", 400)
    full_name = _normalize(full_name)
    username = _normalize(username)
    email = _normalize(email).lower()
    phone = _normalize(phone)
    password = str(password or "")

    if not all((full_name, username, email, phone, password)):
        raise AuthenticationError("Vui lòng nhập đầy đủ thông tin", 400)
    if len(full_name) > 100:
        raise AuthenticationError("Họ và tên không được vượt quá 100 ký tự", 400)
    if not re.fullmatch(r"[A-Za-z0-9_]{4,30}", username):
        raise AuthenticationError("Tên đăng nhập phải gồm 4-30 ký tự chữ, số hoặc dấu gạch dưới", 400)
    if len(parseaddr(email)[1]) != len(email) or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise AuthenticationError("Email không đúng định dạng", 400)
    if not re.fullmatch(r"0\d{9}", phone):
        raise AuthenticationError("Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0", 400)
    if len(password) < 8 or len(password.encode("utf-8")) > 72:
        raise AuthenticationError("Mật khẩu phải có từ 8 đến 72 ký tự", 400)

    conn = get_connection()
    if conn is None:
        raise AuthenticationError("Không thể kết nối database", 500)

    cursor = conn.cursor()
    try:
        # UPDLOCK + HOLDLOCK serializes duplicate checks for concurrent requests.
        cursor.execute(
            """
            SELECT TOP 1 UserID FROM Users WITH (UPDLOCK, HOLDLOCK)
            WHERE Username = ? OR Email = ? OR Phone = ?
            """,
            username, email, phone,
        )
        existing = cursor.fetchone()
        if existing is not None:
            raise AuthenticationError("Username/Email/Phone đã tồn tại", 409)

        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        cursor.execute(
            """
            INSERT INTO Users (FullName, Username, Email, Phone, PasswordHash, Role, Status)
            OUTPUT INSERTED.UserID
            VALUES (?, ?, ?, ?, ?, 'CUSTOMER', 'ACTIVE')
            """,
            full_name, username, email, phone, password_hash,
        )
        row = cursor.fetchone()
        if row is None:
            raise RuntimeError("Không nhận được UserID sau khi tạo tài khoản")
        user_id = row[0]
        conn.commit()
        return {"userId": user_id, "username": username, "email": email, "role": "CUSTOMER"}
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


def _normalize(
    value
):

    return str(
        value
        or ""
    ).strip()


def _is_bcrypt_hash(
    password_hash
):

    value = _normalize(
        password_hash
    )

    return value.startswith(
        (
            "$2a$",
            "$2b$",
            "$2y$"
        )
    )


def verify_password(
    password,
    password_hash
):

    password = str(
        password
        or ""
    )

    stored_hash = (
        _normalize(
            password_hash
        )
    )


    if (
        not password
        or
        not stored_hash
    ):

        return False


    if not _is_bcrypt_hash(
        stored_hash
    ):

        return False


    try:

        return bcrypt.checkpw(

            password.encode(
                "utf-8"
            ),

            stored_hash.encode(
                "utf-8"
            ),
        )


    except (
        TypeError,
        ValueError
    ):

        return False


def _row_to_user(
    user
):

    return {

        "UserID":
            user.UserID,

        "FullName":
            user.FullName,

        "Email":
            user.Email,

        "Phone":
            user.Phone,

        "Role":
            _normalize(
                user.Role
            ).upper(),

        "Status":
            _normalize(
                user.Status
            ).upper(),
    }


def authenticate_user(
    account,
    password
):

    account = _normalize(
        account
    )

    password = str(
        password
        or ""
    )


    if (
        not account
        or
        not password
    ):

        raise AuthenticationError(

            "Vui lòng nhập tài khoản và mật khẩu",

            400,
        )


    conn = get_connection()


    if conn is None:

        raise AuthenticationError(

            "Không thể kết nối database",

            500,
        )


    cursor = conn.cursor()


    try:

        cursor.execute(

            """
            SELECT
                UserID,
                FullName,
                Email,
                Phone,
                PasswordHash,
                Role,
                Status

            FROM Users

            WHERE Username COLLATE Latin1_General_100_CS_AS = ?
               OR Email COLLATE Latin1_General_100_CS_AS = ?
               OR Phone = ?
            """,

            account,
            account,
            account,
        )


        user = cursor.fetchone()


        if user is None:

            raise AuthenticationError(

                "Tên đăng nhập hoặc mật khẩu không hợp lệ",

                401,
            )


        status = _normalize(
            user.Status
        ).upper()


        if status != "ACTIVE":

            raise AuthenticationError(

                "Tài khoản hiện không hoạt động",

                403,
            )


        if not verify_password(

            password,

            user.PasswordHash,
        ):

            if not _is_bcrypt_hash(
                user.PasswordHash
            ):

                raise AuthenticationError(

                    "Mật khẩu trong database chưa được migrate sang bcrypt. Hãy chạy scripts/hash_existing_passwords.py một lần.",

                    500,
                )


            raise AuthenticationError(

                "Tên đăng nhập hoặc mật khẩu không hợp lệ",

                401,
            )


        return _row_to_user(
            user
        )


    finally:

        cursor.close()

        conn.close()


def get_user_by_id(
    user_id
):

    try:

        user_id = int(
            user_id
        )


    except (
        TypeError,
        ValueError
    ):

        return None


    conn = get_connection()


    if conn is None:

        return None


    cursor = conn.cursor()


    try:

        cursor.execute(

            """
            SELECT
                UserID,
                FullName,
                Email,
                Phone,
                Role,
                Status

            FROM Users

            WHERE UserID = ?
            """,

            user_id,
        )


        user = cursor.fetchone()


        if user is None:

            return None


        return _row_to_user(
            user
        )


    finally:

        cursor.close()

        conn.close()
