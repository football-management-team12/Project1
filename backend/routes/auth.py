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


def otp_response(action, status=200):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "message": "Dữ liệu JSON không hợp lệ"}), 400
    try:
        result = action(data)
        response = jsonify({"success": True, **result})
        response.headers["Cache-Control"] = "no-store"
        return response, status
    except AuthenticationError as error:
        response = jsonify({"success": False, "message": error.message})
        response.headers["Cache-Control"] = "no-store"
        if error.status_code == 429:
            response.headers["Retry-After"] = "60"
        return response, error.status_code
    except Exception:
        # Never log driver/Google exception details or request bodies.
        return jsonify({"success": False, "message": "Dịch vụ xác minh tạm thời không khả dụng."}), 503


@auth_bp.route("/register", methods=["POST"])
def register():
    return otp_response(lambda d: register_customer(
        d.get("fullName"), d.get("username"), d.get("email"), d.get("phone"),
        d.get("password"), request.remote_addr or "unknown"), 202)


@auth_bp.route("/register/verify-otp", methods=["POST"])
def register_verify():
    from services.otp_service import verify
    return otp_response(lambda d: verify(d.get("challengeId"), d.get("otp"), "REGISTER"), 201)


@auth_bp.route("/register/resend-otp", methods=["POST"])
def register_resend():
    from services.otp_service import resend
    return otp_response(lambda d: resend(d.get("challengeId"), "REGISTER", request.remote_addr or "unknown"), 202)


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    from services.otp_service import start_reset
    return otp_response(lambda d: start_reset(d.get("email"), request.remote_addr or "unknown"), 202)


@auth_bp.route("/forgot-password/verify-otp", methods=["POST"])
def forgot_verify():
    from services.otp_service import verify
    return otp_response(lambda d: verify(d.get("challengeId"), d.get("otp"), "RESET_PASSWORD"))


@auth_bp.route("/forgot-password/resend-otp", methods=["POST"])
def forgot_resend():
    from services.otp_service import resend
    return otp_response(lambda d: resend(d.get("challengeId"), "RESET_PASSWORD", request.remote_addr or "unknown"), 202)


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password_route():
    from services.otp_service import reset_password
    return otp_response(lambda d: reset_password(d.get("resetGrant"), d.get("newPassword")))


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
        if account_field == "email" and not is_valid_email:
            errors["email"] = ["Email không đúng định dạng, vui lòng nhập lại"]
        elif not (is_valid_email or is_valid_username or is_valid_phone):
            if "@" in account or "." in account:
                errors["email"] = ["Email không đúng định dạng, vui lòng nhập lại"]
            else:
                errors["account"] = ["Tài khoản không đúng định dạng"]

    if errors:
        return jsonify({
            "success":
                False,

            "message":
                errors.get("email", ["Vui lòng kiểm tra thông tin đăng nhập"])[0],

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
