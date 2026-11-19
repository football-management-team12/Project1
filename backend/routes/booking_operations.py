from flask import Blueprint, jsonify, request
from services.jwt_service import jwt_required, role_required, current_user_id
from services.booking_operations import operate, history
from routes.cancellation import reply_error

booking_operations_bp = Blueprint("booking_operations", __name__)


@booking_operations_bp.post(
    "/admin/bookings/<int:booking_id>/operations/<action>"
)
@jwt_required
@role_required("ADMIN")
def booking_operation(booking_id, action):
    try:
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify(message="Body phải là JSON object"), 400
        return jsonify(
            operate(
                current_user_id(), booking_id, action, body.get("reason", "")
            )
        )
    except Exception as error:
        return reply_error(error)


@booking_operations_bp.get("/bookings/<int:booking_id>/operations")
@jwt_required
@role_required("ADMIN", "CUSTOMER")
def booking_operation_history(booking_id):
    try:
        return jsonify(history(current_user_id(), booking_id))
    except Exception as error:
        return reply_error(error)
