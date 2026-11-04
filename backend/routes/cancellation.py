
"""UC07 routes: CUSTOMER submits request, ADMIN reviews or directly cancels."""

from io import BytesIO
from flask import Blueprint, current_app, jsonify, request, send_file
from werkzeug.exceptions import RequestEntityTooLarge

from services.jwt_service import (
    jwt_required,
    role_required,
    current_user_id,
)
from services.payment_service import PaymentError
from services.cancellation_service import (
    get_cancellation_info,
    cancel_booking,
)
from services.cancellation_request_service import (
    request_cancellation,
    latest_request,
    list_requests,
    review_request,
)


cancellation_bp = Blueprint("cancellation", __name__)


@cancellation_bp.post("/bookings/<int:booking_id>/deposit-refund")
@jwt_required
@role_required("ADMIN")
def admin_confirm_deposit_refund(booking_id):
    from services.cancellation_service import confirm_deposit_refund
    try:
        request.max_content_length = 3 * 1024 * 1024
        return jsonify(confirm_deposit_refund(current_user_id(), booking_id, payload())), 200
    except Exception as e:
        return reply_error(e)


def reply_error(e):
    if isinstance(e, RequestEntityTooLarge):
        return jsonify({"message": "Biên lai tối đa 2 MB", "code": "EVIDENCE_TOO_LARGE"}), 413
    if isinstance(e, PaymentError):
        return jsonify({
            "message": e.message,
            "code": e.code,
        }), e.status_code

    current_app.logger.exception("UC07 failed")
    return jsonify({"message": "Lỗi hệ thống UC07"}), 500


@cancellation_bp.get("/bookings/<int:booking_id>/deposit-refund/evidence")
@jwt_required
@role_required("ADMIN", "CUSTOMER")
def download_refund_evidence(booking_id):
    from services.cancellation_service import get_refund_evidence
    try:
        data, mime, filename = get_refund_evidence(current_user_id(), booking_id)
        response = send_file(BytesIO(data), mimetype=mime, as_attachment=True, download_name=filename)
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response
    except Exception as e:
        return reply_error(e)


def payload():
    value = request.get_json(silent=True)

    if value is None:
        return {}

    if not isinstance(value, dict):
        raise PaymentError(
            "Body phải là JSON object",
            400,
            "INVALID_BODY",
        )

    return value


# 1. Xem điều kiện hủy và yêu cầu hủy gần nhất
@cancellation_bp.get(
    "/bookings/<int:booking_id>/cancellation"
)
@jwt_required
@role_required("CUSTOMER", "ADMIN")
def cancellation_info(booking_id):
    try:
        info = get_cancellation_info(
            current_user_id(),
            booking_id,
        )

        info["latestRequest"] = latest_request(
            current_user_id(),
            booking_id,
        )

        if (
            info["latestRequest"]
            and info["latestRequest"]["status"] == "PENDING_REVIEW"
        ):
            info["canCancel"] = False
            info["message"] = (
                "Đã gửi yêu cầu hủy, đang chờ ADMIN duyệt"
            )

        return jsonify(info), 200

    except Exception as e:
        return reply_error(e)


# 2. CUSTOMER gửi yêu cầu hủy
@cancellation_bp.post(
    "/bookings/<int:booking_id>/cancellation-requests"
)
@jwt_required
@role_required("CUSTOMER")
def submit_request(booking_id):
    try:
        data = payload()

        result = request_cancellation(
            current_user_id(),
            booking_id,
            data.get("reason", ""),
            data.get("refundAccount"),
        )

        return jsonify(result), 201

    except Exception as e:
        return reply_error(e)


# 3. ADMIN xem danh sách yêu cầu hủy
@cancellation_bp.get(
    "/admin/cancellation-requests"
)
@jwt_required
@role_required("ADMIN")
def admin_list_requests():
    try:
        status = request.args.get(
            "status",
            "PENDING_REVIEW",
        )

        result = list_requests(
            current_user_id(),
            status,
        )

        return jsonify({"requests": result}), 200

    except Exception as e:
        return reply_error(e)


# 4. ADMIN duyệt hoặc từ chối
@cancellation_bp.post(
    "/admin/cancellation-requests/<int:request_id>/decision"
)
@jwt_required
@role_required("ADMIN")
def admin_review_request(request_id):
    try:
        data = payload()

        result = review_request(
            current_user_id(),
            request_id,
            data.get("decision"),
            data.get("note", ""),
        )

        return jsonify(result), 200

    except Exception as e:
        return reply_error(e)


# 5. ADMIN hủy trực tiếp một booking
@cancellation_bp.post(
    "/bookings/<int:booking_id>/cancel"
)
@jwt_required
@role_required("ADMIN")
def admin_direct_cancel(booking_id):
    try:
        data = payload()

        pending = latest_request(
            current_user_id(),
            booking_id,
        )

        if (
            pending
            and pending["status"] == "PENDING_REVIEW"
        ):
            raise PaymentError(
                "Booking đang có yêu cầu chờ duyệt, "
                "hãy duyệt hoặc từ chối trước",
                409,
                "REQUEST_PENDING",
            )

        result = cancel_booking(
            current_user_id(),
            booking_id,
            data.get("reason", ""),
        )

        return jsonify(result), 200

    except Exception as e:
        return reply_error(e)
