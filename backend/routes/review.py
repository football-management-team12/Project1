"""UC10 routes kept separate from existing booking/payment contracts."""
from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge
import pyodbc

from services.jwt_service import current_user_id, jwt_required, role_required
from services.payment_service import PaymentError
from services.review_service import create_review, get_booking_review, list_field_reviews

review_bp = Blueprint("review", __name__)


def _error(error):
    if isinstance(error, PaymentError):
        return jsonify({"code":error.code, "message":error.message}), error.status_code
    if isinstance(error, RequestEntityTooLarge):
        return jsonify({"code":"REVIEW_TOO_LARGE", "message":"Nội dung yêu cầu quá lớn"}), 413
    if isinstance(error, pyodbc.ProgrammingError) and "42S02" in str(error):
        return jsonify({"code":"REVIEWS_NOT_READY", "message":"Chức năng đánh giá chưa sẵn sàng. Vui lòng liên hệ quản trị viên."}), 503
    current_app.logger.exception("UC10 request failed")
    return jsonify({"code":"REVIEW_ERROR", "message":"Không thể xử lý đánh giá, vui lòng thử lại"}), 500


@review_bp.route("/bookings/<int:booking_id>/reviews", methods=["GET", "POST"])
@jwt_required
@role_required("CUSTOMER")
def booking_reviews(booking_id):
    try:
        if not 1 <= booking_id <= 2147483647:
            raise PaymentError("Mã đơn không hợp lệ", 400, "INVALID_BOOKING_ID")
        if request.method == "GET":
            return jsonify(get_booking_review(current_user_id(), booking_id)), 200
        request.max_content_length = 16*1024
        return jsonify(create_review(current_user_id(), booking_id, request.get_json(silent=True))), 201
    except Exception as error:
        return _error(error)


@review_bp.get("/fields/<int:field_id>/reviews")
def field_reviews(field_id):
    try:
        def positive(name, default, maximum):
            value = request.args.get(name, str(default))
            if not value.isascii() or not value.isdecimal() or len(value)>9:
                raise PaymentError("Phân trang không hợp lệ", 400, "INVALID_PAGINATION")
            number = int(value)
            if not 1 <= number <= maximum:
                raise PaymentError("Phân trang không hợp lệ", 400, "INVALID_PAGINATION")
            return number
        if not 1 <= field_id <= 2147483647:
            raise PaymentError("Mã sân không hợp lệ", 400, "INVALID_FIELD_ID")
        return jsonify(list_field_reviews(field_id, positive("page",1,1000000), positive("pageSize",10,50))), 200
    except Exception as error:
        return _error(error)
