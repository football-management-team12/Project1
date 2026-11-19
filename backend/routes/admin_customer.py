from flask import Blueprint,current_app,jsonify,request
from werkzeug.exceptions import RequestEntityTooLarge
from services.jwt_service import current_user_id,jwt_required,role_required
from services.payment_service import PaymentError
from services.customer_service import list_customers,get_customer,customer_bookings,update_customer

admin_customer_bp=Blueprint("admin_customer",__name__)


def _pagination():
    values=[]
    for name,default,maximum in (("page",1,1000000),("pageSize",10,50)):
        text=request.args.get(name,str(default))
        if not text.isascii() or not text.isdecimal() or len(text)>7 or not 1<=int(text)<=maximum:
            raise PaymentError("Phân trang không hợp lệ",400,"INVALID_PAGINATION")
        values.append(int(text))
    return values


def _id(value):
    if not 1<=value<=2147483647:
        raise PaymentError("Mã khách hàng không hợp lệ",400,"INVALID_CUSTOMER_ID")


def _error(error):
    if isinstance(error,PaymentError):
        return jsonify({"code":error.code,"message":error.message}),error.status_code
    if isinstance(error,RequestEntityTooLarge):
        return jsonify({"code":"BODY_TOO_LARGE","message":"Nội dung yêu cầu quá lớn"}),413
    current_app.logger.exception("UC13 request failed")
    return jsonify({"code":"CUSTOMER_ERROR","message":"Không thể xử lý thông tin khách hàng, vui lòng thử lại"}),500


@admin_customer_bp.get("/customers")
@jwt_required
@role_required("ADMIN")
def customers():
    try:
        keyword=request.args.get("keyword","").strip()
        try: keyword_length=len(keyword.encode("utf-16-le"))//2
        except UnicodeEncodeError: keyword_length=101
        if keyword_length>100 or any(ord(char)<32 for char in keyword):
            raise PaymentError("Từ khóa tối đa 100 ký tự",400,"INVALID_KEYWORD")
        status=request.args.get("status","").strip().upper()
        if status not in {"","ACTIVE","INACTIVE"}:
            raise PaymentError("Trạng thái lọc không hợp lệ",400,"INVALID_STATUS")
        return jsonify(list_customers(current_user_id(),keyword,status,*_pagination())),200
    except Exception as error:return _error(error)


@admin_customer_bp.route("/customers/<int:customer_id>",methods=["GET","PUT"])
@jwt_required
@role_required("ADMIN")
def customer(customer_id):
    try:
        _id(customer_id)
        if request.method=="GET":return jsonify(get_customer(current_user_id(),customer_id)),200
        request.max_content_length=16*1024
        return jsonify(update_customer(current_user_id(),customer_id,request.get_json(silent=True))),200
    except Exception as error:return _error(error)


@admin_customer_bp.get("/customers/<int:customer_id>/bookings")
@jwt_required
@role_required("ADMIN")
def bookings(customer_id):
    try:
        _id(customer_id)
        return jsonify(customer_bookings(current_user_id(),customer_id,*_pagination())),200
    except Exception as error:return _error(error)
