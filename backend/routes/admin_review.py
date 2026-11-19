from flask import Blueprint,jsonify,request
from services.jwt_service import current_user_id,jwt_required,role_required
from services.payment_service import PaymentError
from services.review_reply_service import list_admin_reviews,save_reply
from routes.review import _error

admin_review_bp=Blueprint("admin_review",__name__)


@admin_review_bp.get("/reviews")
@jwt_required
@role_required("ADMIN")
def admin_reviews():
    try:
        def integer(name,default,maximum):
            raw=request.args.get(name,str(default))
            if not raw.isascii() or not raw.isdecimal() or len(raw)>7 or not 1<=int(raw)<=maximum:
                raise PaymentError("Bộ lọc hoặc phân trang không hợp lệ",400,"INVALID_FILTER")
            return int(raw)
        status=request.args.get("status","all")
        if status not in {"all","answered","unanswered"}:
            raise PaymentError("Trạng thái phản hồi không hợp lệ",400,"INVALID_FILTER")
        return jsonify(list_admin_reviews(current_user_id(),integer("page",1,1000000),integer("pageSize",10,50),
                                         status,integer("rating",1,5) if "rating" in request.args else None)),200
    except Exception as error: return _error(error)


@admin_review_bp.put("/reviews/<int:review_id>/reply")
@jwt_required
@role_required("ADMIN")
def reply_to_review(review_id):
    try:
        if not 1<=review_id<=2147483647:
            raise PaymentError("Mã đánh giá không hợp lệ",400,"INVALID_REVIEW_ID")
        request.max_content_length=16*1024
        return jsonify(save_reply(current_user_id(),review_id,request.get_json(silent=True))),200
    except Exception as error: return _error(error)
