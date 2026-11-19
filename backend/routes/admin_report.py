from flask import Blueprint, current_app, jsonify, request

from services.jwt_service import current_user_id, jwt_required, role_required
from services.payment_service import PaymentError
from services.report_service import get_summary, validate_range


admin_report_bp = Blueprint("admin_report", __name__)


@admin_report_bp.get("/reports/summary")
@jwt_required
@role_required("ADMIN")
def summary():
    try:
        if set(request.args) - {"from", "to"} or any(len(request.args.getlist(key)) != 1 for key in ("from", "to")):
            raise PaymentError("Chỉ truyền một từ ngày và một đến ngày", 400, "INVALID_DATE_RANGE")
        start, end = validate_range(request.args.get("from"), request.args.get("to"))
        response = jsonify(get_summary(current_user_id(), start, end))
        response.headers["Cache-Control"] = "no-store"
        return response, 200
    except PaymentError as error:
        return jsonify({"code": error.code, "message": error.message}), error.status_code
    except Exception:
        current_app.logger.exception("UC16 report request failed")
        return jsonify({"code": "REPORT_ERROR", "message": "Không thể tải báo cáo, vui lòng thử lại"}), 500
