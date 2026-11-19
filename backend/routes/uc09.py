"""API UC09: Admin xác nhận đã thu tiền tại sân."""

from flask import Blueprint, current_app, jsonify

from services.invoice_cash_service import (
    confirm_final_cash_payment,
    get_settlement,
)

from services.jwt_service import (
    current_user_id,
    jwt_required,
    role_required,
)

from services.payment_service import PaymentError


uc09_bp = Blueprint("uc09", __name__)


def _error_response(error: PaymentError):
    return jsonify({
        "message": error.message,
        "code": error.code
    }), error.status_code


@uc09_bp.route(
    "/bookings/<int:booking_id>/settlement",
    methods=["GET"]
)
@jwt_required
@role_required("ADMIN", "CUSTOMER")
def booking_settlement(booking_id: int):
    """Xem số tiền còn lại và trạng thái thanh toán."""

    try:
        result = get_settlement(
            current_user_id(),
            booking_id
        )

        return jsonify(result), 200

    except PaymentError as error:
        return _error_response(error)

    except Exception:
        current_app.logger.exception(
            "UC09 get settlement failed"
        )

        return jsonify({
            "message": "Không thể tải thông tin thanh toán"
        }), 500


@uc09_bp.route(
    "/admin/bookings/<int:booking_id>/confirm-final-payment",
    methods=["POST"]
)
@jwt_required
@role_required("ADMIN")
def confirm_final_payment(booking_id: int):
    """Admin xác nhận khoản tiền đã nhận trực tiếp."""

    try:
        result = confirm_final_cash_payment(
            current_user_id(),
            booking_id
        )

        return jsonify(result), 200

    except PaymentError as error:
        return _error_response(error)

    except Exception:
        current_app.logger.exception(
            "UC09 confirm cash payment failed"
        )

        return jsonify({
            "message": "Không thể xác nhận đã thu tiền"
        }), 500