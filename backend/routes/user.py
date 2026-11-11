import logging

from flask import (
    Blueprint,
    jsonify,
    request,
)

from services.jwt_service import (
    current_user_id,
    jwt_required,
)

from services.user_service import (
    ProfileError,
    get_user_profile,
    update_user_profile,
)


user_bp = Blueprint(
    "user",
    __name__
)


FORBIDDEN_UPDATE_FIELDS = {
    "userid",
    "user_id",
    "username",
    "role",
    "status",
    "password",
    "passwordhash",
    "password_hash",
}


# ============================================================
# GET CURRENT USER PROFILE
#
# UC03
# GET /api/users/me
# ============================================================

@user_bp.route(
    "/me",
    methods=["GET"]
)
@jwt_required
def get_my_profile():

    try:

        profile = get_user_profile(
            current_user_id()
        )

        return jsonify(
            profile
        ), 200

    except ProfileError as error:

        return jsonify({
            "message":
                error.message
        }), error.status_code

    except Exception:

        logging.getLogger(
            __name__
        ).exception(
            "Get current user profile failed"
        )

        return jsonify({
            "message":
                "Không thể tải thông tin cá nhân"
        }), 500


# ============================================================
# UPDATE CURRENT USER PROFILE
#
# UC03
# PUT /api/users/me
# ============================================================

@user_bp.route(
    "/me",
    methods=["PUT"]
)
@jwt_required
def update_my_profile():

    data = request.get_json(
        silent=True
    )

    if not isinstance(
        data,
        dict
    ):

        return jsonify({
            "success":
                False,

            "message":
                "Dữ liệu JSON không hợp lệ"
        }), 400


    # ========================================================
    # SECURITY
    #
    # UC03 chỉ cho sửa:
    # FullName / Email / Phone
    # ========================================================

    normalized_keys = {
        str(key)
        .strip()
        .lower()

        for key in data.keys()
    }


    forbidden_fields = (
        normalized_keys
        &
        FORBIDDEN_UPDATE_FIELDS
    )


    if forbidden_fields:

        return jsonify({
            "success":
                False,

            "message":
                "Không được phép cập nhật UserID, Username, Role, Status hoặc Password bằng chức năng hồ sơ"
        }), 400


    allowed_fields = {
        "fullName",
        "email",
        "phone",
    }


    unknown_fields = (
        set(data)
        -
        allowed_fields
    )


    if unknown_fields:

        return jsonify({
            "success":
                False,

            "message":
                "Request chứa trường không được hỗ trợ"
        }), 400


    if not data:

        return jsonify({
            "success":
                False,

            "message":
                "Vui lòng gửi ít nhất một trường họ tên, email hoặc số điện thoại"
        }), 400


    try:

        profile = update_user_profile(
            current_user_id(),
            **{target: data[source] for source, target in (
                ("fullName", "full_name"), ("email", "email"), ("phone", "phone")
            ) if source in data},
        )


        return jsonify({
            "success":
                True,

            "message":
                "Cập nhật thông tin thành công",

            "user":
                profile,
        }), 200


    except ProfileError as error:

        return jsonify({
            "success":
                False,

            "message":
                error.message
        }), error.status_code


    except Exception:

        logging.getLogger(
            __name__
        ).exception(
            "Update current user profile failed"
        )

        return jsonify({
            "success":
                False,

            "message":
                "Không thể cập nhật thông tin cá nhân"
        }), 500
