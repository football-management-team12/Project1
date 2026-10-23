import re

from flask import (
    Blueprint,
    jsonify,
    request
)

from services.auth_service import (
    AuthenticationError,
    authenticate_user,
    get_user_by_id,
    register_customer,
)

from services.jwt_service import (
    create_access_token,
    current_user_id,
    jwt_required,
)


auth_bp = Blueprint(
    "auth",
    __name__
)


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "message": "Dữ liệu JSON không hợp lệ"}), 400
    try:
        user = register_customer(
            data.get("fullName"), data.get("username"), data.get("email"),
            data.get("phone"), data.get("password"),
        )
    except AuthenticationError as error:
        return jsonify({"success": False, "message": error.message}), error.status_code
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Customer registration failed")
        return jsonify({"success": False, "message": "Không thể đăng ký tài khoản"}), 500
    return jsonify({"success": True, "message": "Đăng ký thành công", "user": user}), 201


def to_public_user(
    user
):

    return {

        "id":
            user["UserID"],

        "userId":
            user["UserID"],

        "fullName":
            user["FullName"],

        "email":
            user["Email"],

        "phone":
            user["Phone"],

        "role":
            user["Role"],

        "status":
            user["Status"],
    }


# ============================================================
# LOGIN
#
# POST /api/auth/login
# ============================================================

@auth_bp.route(
    "/login",
    methods=["POST"]
)
def login():

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}

    account_field = "email" if "email" in data and "account" not in data else "account"
    account_value = data.get("account")
    if account_value is None:
        account_value = data.get("email")
    account = str(account_value or "").strip()

    password = str(
        data.get(
            "password"
        )
        or ""
    )

    errors = {}
    if not account:
        errors[account_field] = [
            "Email là bắt buộc" if account_field == "email"
            else "Vui lòng nhập tên đăng nhập, email hoặc số điện thoại"
        ]
    if not password:
        errors["password"] = ["Vui lòng nhập mật khẩu"]
    if account:
        is_valid_email = re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", account)
        is_valid_username = re.fullmatch(r"[A-Za-z0-9_]{4,30}", account)
        is_valid_phone = re.fullmatch(r"0\d{9}", account)
        if not (is_valid_email or is_valid_username or is_valid_phone):
            if "@" in account or "." in account:
                errors["email"] = ["Email không đúng định dạng"]
            else:
                errors["account"] = ["Tài khoản không đúng định dạng"]

    if errors:
        return jsonify({
            "success":
                False,

            "message":
                "Vui lòng kiểm tra thông tin đăng nhập",

            "errors":
                errors,
        }), 400

    try:

        user = authenticate_user(
            account,
            password
        )

    except AuthenticationError as error:

        return jsonify({
            "success":
                False,

            "message":
                error.message
        }), error.status_code

    access_token = (
        create_access_token(
            user["UserID"],
            user["Role"]
        )
    )

    return jsonify({
        "success":
            True,

        "accessToken":
            access_token,

        "tokenType":
            "Bearer",

        "user":
            to_public_user(
                user
            )

    }), 200


# ============================================================
# CURRENT USER
#
# GET /api/auth/me
# ============================================================

@auth_bp.route(
    "/me",
    methods=["GET"]
)
@jwt_required
def me():

    user = get_user_by_id(
        current_user_id()
    )

    if user is None:

        return jsonify({
            "message":
                "Không tìm thấy người dùng"
        }), 404

    if (
        user["Status"]
        !=
        "ACTIVE"
    ):

        return jsonify({
            "message":
                "Tài khoản hiện không hoạt động"
        }), 403

    return jsonify({
        "user":
            to_public_user(
                user
            )
    }), 200
