import re
from email.utils import parseaddr

from database import get_connection


class ProfileError(Exception):

    def __init__(
        self,
        message,
        status_code=400
    ):

        super().__init__(
            message
        )

        self.message = message
        self.status_code = status_code


# ============================================================
# NORMALIZE
# ============================================================

def _normalize(value):

    return str(
        value
        or ""
    ).strip()


# ============================================================
# VALIDATE EMAIL
# ============================================================

def _is_valid_email(email):

    email = _normalize(
        email
    )

    if not email:
        return False

    parsed_email = (
        parseaddr(email)[1]
    )

    if (
        len(parsed_email)
        != len(email)
    ):
        return False

    return bool(
        re.fullmatch(
            r"[^\s@]+@[^\s@]+\.[^\s@]+",
            email
        )
    )


# ============================================================
# VALIDATE PHONE
# ============================================================

def _is_valid_phone(phone):

    phone = _normalize(
        phone
    )

    return bool(
        re.fullmatch(
            r"0\d{9}",
            phone
        )
    )


# ============================================================
# PARSE USER ID
# ============================================================

def _parse_user_id(user_id):

    try:

        user_id = int(
            user_id
        )

    except (
        TypeError,
        ValueError
    ):

        raise ProfileError(
            "Người dùng không hợp lệ",
            400
        )

    if user_id <= 0:

        raise ProfileError(
            "Người dùng không hợp lệ",
            400
        )

    return user_id


# ============================================================
# ROW -> PROFILE
# ============================================================

def _row_to_profile(row):

    return {

        "userId":
            row.UserID,

        "fullName":
            row.FullName,

        "username":
            row.Username,

        "email":
            row.Email,

        "phone":
            row.Phone,

        "role":
            _normalize(
                row.Role
            ).upper(),

        "status":
            _normalize(
                row.Status
            ).upper(),
    }


# ============================================================
# GET CURRENT USER PROFILE
#
# UC03
#
# UserID MUST come from verified JWT.
# ============================================================

def get_user_profile(user_id):

    user_id = _parse_user_id(
        user_id
    )

    conn = get_connection()

    if conn is None:

        raise ProfileError(
            "Không thể kết nối database",
            500
        )

    cursor = conn.cursor()

    try:

        cursor.execute(
            """
            SELECT
                UserID,
                FullName,
                Username,
                Email,
                Phone,
                Role,
                Status

            FROM Users

            WHERE UserID = ?
            """,
            user_id
        )

        user = cursor.fetchone()

        if user is None:

            raise ProfileError(
                "Không tìm thấy người dùng",
                404
            )

        profile = _row_to_profile(
            user
        )

        if (
            profile["status"]
            != "ACTIVE"
        ):

            raise ProfileError(
                "Tài khoản hiện không hoạt động",
                403
            )

        return profile

    finally:

        cursor.close()
        conn.close()


# ============================================================
# UPDATE CURRENT USER PROFILE
#
# UC03
#
# Allowed:
# - FullName
# - Email
# - Phone
#
# Not allowed:
# - UserID
# - Username
# - Role
# - Status
# - PasswordHash
# ============================================================

_MISSING = object()


def update_user_profile(
    user_id,
    full_name=_MISSING,
    email=_MISSING,
    phone=_MISSING
):

    user_id = _parse_user_id(
        user_id
    )


    # Validate only supplied fields. Missing is distinct from explicit null/empty.
    supplied = {key: value for key, value in (
        ("fullName", full_name), ("email", email), ("phone", phone)
    ) if value is not _MISSING}
    if not supplied:
        raise ProfileError("Vui lòng gửi ít nhất một trường thông tin", 400)
    for key, value in supplied.items():
        if not isinstance(value, str) or not value.strip():
            raise ProfileError("Thông tin cập nhật không được rỗng và phải là chuỗi", 400)
        supplied[key] = value.strip()
    if "fullName" in supplied and len(supplied["fullName"]) > 100:
        raise ProfileError("Họ và tên không được vượt quá 100 ký tự", 400)
    if "email" in supplied:
        supplied["email"] = supplied["email"].lower()
        if not _is_valid_email(supplied["email"]):
            raise ProfileError("Email không đúng định dạng, vui lòng nhập lại", 400)
    if "phone" in supplied and not _is_valid_phone(supplied["phone"]):
        raise ProfileError("Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0", 400)

    # ========================================================
    # DATABASE
    # ========================================================

    conn = get_connection()

    if conn is None:

        raise ProfileError(
            "Không thể kết nối database",
            500
        )

    cursor = conn.cursor()

    try:

        # ----------------------------------------------------
        # SERIALIZABLE
        #
        # Tránh hai request đồng thời cùng đổi sang một
        # Email/Phone giống nhau.
        # ----------------------------------------------------

        cursor.execute(
            """
            SET TRANSACTION ISOLATION LEVEL SERIALIZABLE
            """
        )


        # ----------------------------------------------------
        # LOCK CURRENT USER
        # ----------------------------------------------------

        cursor.execute(
            """
            SELECT
                UserID,
                FullName,
                Email,
                Phone,
                Status

            FROM Users
                WITH (
                    UPDLOCK,
                    HOLDLOCK
                )

            WHERE UserID = ?
            """,
            user_id
        )

        current_user = (
            cursor.fetchone()
        )

        if current_user is None:

            raise ProfileError(
                "Không tìm thấy người dùng",
                404
            )


        if (
            _normalize(
                current_user.Status
            ).upper()
            != "ACTIVE"
        ):

            raise ProfileError(
                "Tài khoản hiện không hoạt động",
                403
            )


        # Merge under the existing UPDLOCK/HOLDLOCK, avoiding lost concurrent edits.
        full_name = supplied.get("fullName", current_user.FullName)
        email = supplied.get("email", current_user.Email)
        phone = supplied.get("phone", current_user.Phone)

        # ----------------------------------------------------
        # CHECK DUPLICATE EMAIL / PHONE
        #
        # User hiện tại được phép giữ nguyên Email/Phone
        # của chính mình.
        # ----------------------------------------------------

        cursor.execute(
            """
            SELECT TOP 1
                UserID,
                Email,
                Phone

            FROM Users
                WITH (
                    UPDLOCK,
                    HOLDLOCK
                )

            WHERE
                UserID <> ?
                AND
                (
                    LOWER(Email) = ?
                    OR Phone = ?
                )
            """,
            user_id,
            email,
            phone
        )

        duplicated_user = (
            cursor.fetchone()
        )

        if duplicated_user is not None:

            duplicated_email = (
                _normalize(
                    duplicated_user.Email
                )
                .lower()
            )

            duplicated_phone = (
                _normalize(
                    duplicated_user.Phone
                )
            )


            if (
                duplicated_email
                == email
            ):

                raise ProfileError(
                    "Email đã được sử dụng bởi tài khoản khác",
                    409
                )


            if (
                duplicated_phone
                == phone
            ):

                raise ProfileError(
                    "Số điện thoại đã được sử dụng bởi tài khoản khác",
                    409
                )


            raise ProfileError(
                "Email hoặc số điện thoại đã tồn tại",
                409
            )


        # ----------------------------------------------------
        # UPDATE ONLY ALLOWED FIELDS
        #
        # Không hề có:
        # Role
        # Status
        # PasswordHash
        # Username
        #
        # nên client không thể dùng endpoint này để nâng quyền.
        # ----------------------------------------------------

        cursor.execute(
            """
            UPDATE Users

            SET
                FullName = ?,
                Email = ?,
                Phone = ?

            OUTPUT
                INSERTED.UserID,
                INSERTED.FullName,
                INSERTED.Username,
                INSERTED.Email,
                INSERTED.Phone,
                INSERTED.Role,
                INSERTED.Status

            WHERE UserID = ?
            """,
            full_name,
            email,
            phone,
            user_id
        )

        updated_user = (
            cursor.fetchone()
        )

        if updated_user is None:

            raise ProfileError(
                "Không thể cập nhật thông tin người dùng",
                404
            )


        conn.commit()


        return _row_to_profile(
            updated_user
        )


    except ProfileError:

        conn.rollback()

        raise


    except Exception:

        conn.rollback()

        raise


    finally:

        cursor.close()
        conn.close()
