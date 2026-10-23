from flask import Blueprint, jsonify, request

from services.jwt_service import (
    current_user_id,
    jwt_required,
    role_required,
)

from services.payment_service import (
    PaymentError,
    create_deposit,
    get_deposit_info,
    update_deposit_demo_status,
)


payment_bp = Blueprint(
    "payment",
    __name__,
)


# ============================================================
# ERROR RESPONSE
# ============================================================

def _error_response(error):

    body = {
        "message":
            error.message,
    }

    if error.code:

        body["code"] = (
            error.code
        )

    return (
        jsonify(body),
        error.status_code,
    )


# ============================================================
# UC06
#
# GET /api/bookings/<booking_id>/deposit
# ============================================================

@payment_bp.route(
    "/bookings/<int:booking_id>/deposit",
    methods=["GET"],
)
@jwt_required
@role_required(
    "CUSTOMER"
)
def get_booking_deposit(
    booking_id
):

    try:

        result = (
            get_deposit_info(
                current_user_id(),
                booking_id,
            )
        )

        return jsonify(
            result
        ), 200


    except PaymentError as error:

        return (
            _error_response(
                error
            )
        )


    except Exception as error:

        print(
            "GET DEPOSIT ERROR:"
        )

        print(
            error
        )

        return jsonify({
            "message":
                "Có lỗi xảy ra khi lấy thông tin đặt cọc"
        }), 500


# ============================================================
# UC06
#
# POST /api/bookings/<booking_id>/deposit
#
# Không nhận Amount từ frontend.
# ============================================================

@payment_bp.route(
    "/bookings/<int:booking_id>/deposit",
    methods=["POST"],
)
@jwt_required
@role_required(
    "CUSTOMER"
)
def create_booking_deposit(
    booking_id
):

    try:

        result = (
            create_deposit(
                current_user_id(),
                booking_id,
            )
        )

        return jsonify(
            result
        ), 201


    except PaymentError as error:

        return (
            _error_response(
                error
            )
        )


    except Exception as error:

        print(
            "CREATE DEPOSIT ERROR:"
        )

        print(
            error
        )

        return jsonify({
            "message":
                "Có lỗi xảy ra khi tạo giao dịch đặt cọc"
        }), 500


# ============================================================
# UC06
#
# PATCH /api/payments/<payment_id>/demo-status
#
# {
#     "status": "SUCCESS"
# }
# ============================================================

@payment_bp.route(
    "/payments/<int:payment_id>/demo-status",
    methods=["PATCH"],
)
@jwt_required
@role_required(
    "CUSTOMER"
)
def patch_demo_payment_status(
    payment_id
):

    try:

        data = (
            request.get_json(
                silent=True
            )
            or {}
        )

        result = (
            update_deposit_demo_status(
                current_user_id(),
                payment_id,
                data.get(
                    "status"
                ),
            )
        )

        return jsonify({

            "message":
                "Cập nhật trạng thái giao dịch thành công",

            "payment":
                result,

        }), 200


    except PaymentError as error:

        return (
            _error_response(
                error
            )
        )


    except Exception as error:

        print(
            "PATCH DEMO PAYMENT STATUS ERROR:"
        )

        print(
            error
        )

        return jsonify({
            "message":
                "Có lỗi xảy ra khi cập nhật giao dịch"
        }), 500