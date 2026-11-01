"""UC15 (T123-74) - Admin-only CRUD for FootballFields and FieldPrices.

Keep existing public field/availability endpoints untouched. All writes use
SQL Server transactions; linked booking history is never deleted.
"""
from datetime import datetime
from decimal import Decimal, InvalidOperation
from flask import Blueprint, jsonify, request, current_app

from database import get_connection
from services.jwt_service import jwt_required, role_required, current_user_id

field_admin_bp = Blueprint("field_admin", __name__)
STATUSES = {"AVAILABLE", "MAINTENANCE"}


class FieldError(Exception):
    def __init__(self, message, status=400, code="INVALID_FIELD"):
        super().__init__(message)
        self.status = status
        self.code = code


def _json():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise FieldError("Body phải là JSON object")
    return value


def _text(value, name, max_length, *, required=True):
    if not isinstance(value, str):
        raise FieldError(f"{name} phải là chuỗi")
    value = value.strip()
    if required and not value:
        raise FieldError(f"Thiếu {name}")
    if len(value) > max_length:
        raise FieldError(f"{name} tối đa {max_length} ký tự")
    return value


def _price(value):
    try:
        if isinstance(value, bool):
            raise ValueError()
        result = Decimal(str(value))
        if not result.is_finite() or result <= 0 or result > 999999999:
            raise ValueError()
        return result
    except (ValueError, InvalidOperation, TypeError):
        raise FieldError("Giá phải là số dương hợp lệ", 400, "INVALID_PRICE")


def _clock(value):
    if not isinstance(value, str):
        raise FieldError("Giờ phải ở định dạng HH:MM")
    try:
        return datetime.strptime(value[:5], "%H:%M").time()
    except ValueError:
        raise FieldError("Giờ phải ở định dạng HH:MM")


def _slot(data):
    start = _clock(data.get("StartTime"))
    end = _clock(data.get("EndTime"))
    if start >= end:
        raise FieldError("Giờ kết thúc phải sau giờ bắt đầu")
    return start, end, _price(data.get("Price"))


def _active_admin(cur):
    cur.execute("SELECT Role, Status FROM dbo.Users WHERE UserID=?", current_user_id())
    user = cur.fetchone()
    if not user or str(user[0] or "").strip().upper() != "ADMIN" or str(user[1] or "").strip().upper() != "ACTIVE":
        raise FieldError("Chỉ ADMIN đang hoạt động được quản lý sân", 403, "FORBIDDEN")


def _field(cur, field_id, *, lock=False):
    hint = "WITH (UPDLOCK, HOLDLOCK)" if lock else ""
    cur.execute(f"""SELECT FieldID, FieldName, FieldType, Location, Image, Status
                    FROM dbo.FootballFields {hint} WHERE FieldID=?""", field_id)
    row = cur.fetchone()
    if not row:
        raise FieldError("Không tìm thấy sân", 404, "FIELD_NOT_FOUND")
    return row


def _future_bookings(cur, field_id):
    cur.execute("""SELECT COUNT(*) FROM dbo.Bookings WITH (UPDLOCK, HOLDLOCK)
                    WHERE FieldID=? AND Status IN ('PENDING','CONFIRMED')
                      AND (CAST(BookingDate AS DATE)>CAST(GETDATE() AS DATE)
                           OR (CAST(BookingDate AS DATE)=CAST(GETDATE() AS DATE)
                               AND EndTime>CAST(GETDATE() AS TIME)))""", field_id)
    return int(cur.fetchone()[0] or 0)


def _serialize_field(row):
    return {"FieldID": int(row.FieldID), "FieldName": row.FieldName,
            "FieldType": row.FieldType, "Location": row.Location,
            "Image": row.Image, "Status": row.Status}


def _load_details(cur, field_id, *, lock=False):
    field = _field(cur, field_id, lock=lock)
    cur.execute("""SELECT PriceID, StartTime, EndTime, Price
                    FROM dbo.FieldPrices WHERE FieldID=?
                    ORDER BY StartTime, PriceID""", field_id)
    slots = [{"PriceID": int(p.PriceID), "StartTime": str(p.StartTime)[:5],
              "EndTime": str(p.EndTime)[:5], "Price": float(p.Price)}
             for p in cur.fetchall()]
    return dict(_serialize_field(field), Prices=slots)


def _ensure_nonoverlap(cur, field_id, start, end, exclude_id=None):
    cur.execute("""SELECT COUNT(*) FROM dbo.FieldPrices WITH (UPDLOCK, HOLDLOCK)
                    WHERE FieldID=? AND StartTime<? AND EndTime>?
                      AND (? IS NULL OR PriceID<>?)""",
                field_id, end, start, exclude_id, exclude_id)
    if int(cur.fetchone()[0] or 0):
        raise FieldError("Khung giờ trùng với một khung giá hiện có", 409, "SLOT_OVERLAP")


def _perform(handler):
    conn = get_connection()
    if conn is None:
        return jsonify(message="Không thể kết nối database"), 500
    cur = conn.cursor()
    try:
        cur.execute("SET XACT_ABORT ON")
        cur.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        _active_admin(cur)
        result, status = handler(cur)
        conn.commit()
        return jsonify(result), status
    except FieldError as exc:
        conn.rollback()
        return jsonify(message=str(exc), code=exc.code), exc.status
    except Exception:
        conn.rollback()
        current_app.logger.exception("UC15 SQL operation failed")
        return jsonify(message="Lỗi xử lý quản lý sân"), 500
    finally:
        cur.close()
        conn.close()


@field_admin_bp.get("/<int:field_id>")
@jwt_required
@role_required("ADMIN")
def get_field_admin(field_id):
    return _perform(lambda cur: (_load_details(cur, field_id), 200))


@field_admin_bp.post("/")
@jwt_required
@role_required("ADMIN")
def create_field():
    def operation(cur):
        data = _json()
        name = _text(data.get("FieldName"), "FieldName", 150)
        field_type = _text(data.get("FieldType"), "FieldType", 50)
        location = _text(data.get("Location"), "Location", 255)
        image = _text(data.get("Image", ""), "Image", 500, required=False)
        status = str(data.get("Status", "AVAILABLE")).strip().upper()
        if status not in STATUSES:
            raise FieldError("Trạng thái chỉ được AVAILABLE hoặc MAINTENANCE")
        prices = data.get("Prices", [])
        if not isinstance(prices, list):
            raise FieldError("Prices phải là danh sách")
        validated = [_slot(p) for p in prices if isinstance(p, dict)]
        if len(validated) != len(prices):
            raise FieldError("Prices chứa phần tử không hợp lệ")
        ordered = sorted(validated, key=lambda x: x[0])
        for left, right in zip(ordered, ordered[1:]):
            if left[1] > right[0]:
                raise FieldError("Các khung giờ bị chồng lấn", 409, "SLOT_OVERLAP")
        cur.execute("""INSERT INTO dbo.FootballFields (FieldName, FieldType, Location, Image, Status)
                       OUTPUT INSERTED.FieldID VALUES (?,?,?,?,?)""",
                    name, field_type, location, image or None, status)
        field_id = int(cur.fetchone()[0])
        for start, end, price in ordered:
            cur.execute("""INSERT INTO dbo.FieldPrices (FieldID, StartTime, EndTime, Price)
                           VALUES (?,?,?,?)""", field_id, start, end, price)
        return {"message": "Thêm sân thành công", "field": _load_details(cur, field_id)}, 201
    return _perform(operation)


@field_admin_bp.put("/<int:field_id>")
@jwt_required
@role_required("ADMIN")
def update_field_admin(field_id):
    def operation(cur):
        existing = _field(cur, field_id, lock=True)
        data = _json()
        allowed = {"FieldName", "FieldType", "Location", "Image"}
        if not data or set(data) - allowed:
            raise FieldError("Chỉ được sửa FieldName, FieldType, Location, Image")
        values = {
            "FieldName": existing.FieldName, "FieldType": existing.FieldType,
            "Location": existing.Location, "Image": existing.Image or ""
        }
        for key in data:
            values[key] = _text(data[key], key, 500 if key == "Image" else (255 if key == "Location" else 150 if key == "FieldName" else 50), required=key != "Image")
        cur.execute("""UPDATE dbo.FootballFields SET FieldName=?, FieldType=?,
                       Location=?, Image=? WHERE FieldID=?""",
                    values["FieldName"], values["FieldType"], values["Location"],
                    values["Image"] or None, field_id)
        return {"message": "Cập nhật sân thành công", "field": _load_details(cur, field_id)}, 200
    return _perform(operation)


@field_admin_bp.patch("/<int:field_id>/status")
@jwt_required
@role_required("ADMIN")
def update_field_status(field_id):
    def operation(cur):
        _field(cur, field_id, lock=True)
        data = _json()
        status = str(data.get("Status", "")).strip().upper()
        if status not in STATUSES:
            raise FieldError("Status phải là AVAILABLE hoặc MAINTENANCE")
        if status == "MAINTENANCE" and _future_bookings(cur, field_id):
            raise FieldError("Sân còn booking hiệu lực; xử lý booking trước khi bảo trì", 409, "ACTIVE_BOOKINGS")
        cur.execute("UPDATE dbo.FootballFields SET Status=? WHERE FieldID=?", status, field_id)
        return {"message": "Đã cập nhật trạng thái sân", "field": _load_details(cur, field_id)}, 200
    return _perform(operation)


@field_admin_bp.delete("/<int:field_id>")
@jwt_required
@role_required("ADMIN")
def delete_field_admin(field_id):
    def operation(cur):
        _field(cur, field_id, lock=True)
        if _future_bookings(cur, field_id):
            raise FieldError("Sân còn booking hiệu lực, không thể xóa", 409, "ACTIVE_BOOKINGS")
        cur.execute("SELECT COUNT(*) FROM dbo.Bookings WITH (UPDLOCK,HOLDLOCK) WHERE FieldID=?", field_id)
        linked = int(cur.fetchone()[0] or 0)
        if linked:
            # Existing bookings/invoices must remain valid; use maintenance
            # rather than hard-delete. Historical data is untouched.
            cur.execute("UPDATE dbo.FootballFields SET Status='MAINTENANCE' WHERE FieldID=?", field_id)
            return {"message": "Sân có lịch sử booking: đã ngừng hoạt động (MAINTENANCE), không xóa dữ liệu",
                    "deactivated": True, "fieldId": field_id}, 200
        cur.execute("DELETE FROM dbo.FieldPrices WHERE FieldID=?", field_id)
        cur.execute("DELETE FROM dbo.FootballFields WHERE FieldID=?", field_id)
        return {"message": "Đã xóa sân không có booking", "deleted": True, "fieldId": field_id}, 200
    return _perform(operation)


@field_admin_bp.post("/<int:field_id>/prices")
@jwt_required
@role_required("ADMIN")
def create_price_slot(field_id):
    def operation(cur):
        _field(cur, field_id, lock=True)
        if _future_bookings(cur, field_id):
            raise FieldError("Sân còn booking hiệu lực; không thể đổi bảng khung giờ", 409, "ACTIVE_BOOKINGS")
        start, end, price = _slot(_json())
        _ensure_nonoverlap(cur, field_id, start, end)
        cur.execute("""INSERT INTO dbo.FieldPrices(FieldID,StartTime,EndTime,Price)
                       OUTPUT INSERTED.PriceID VALUES(?,?,?,?)""", field_id, start, end, price)
        return {"message": "Đã thêm khung giờ", "priceId": int(cur.fetchone()[0]),
                "field": _load_details(cur, field_id)}, 201
    return _perform(operation)


@field_admin_bp.put("/<int:field_id>/prices/<int:price_id>")
@jwt_required
@role_required("ADMIN")
def update_price_slot(field_id, price_id):
    def operation(cur):
        _field(cur, field_id, lock=True)
        if _future_bookings(cur, field_id):
            raise FieldError("Sân còn booking hiệu lực; không thể đổi bảng khung giờ", 409, "ACTIVE_BOOKINGS")
        cur.execute("SELECT PriceID FROM dbo.FieldPrices WITH (UPDLOCK,HOLDLOCK) WHERE FieldID=? AND PriceID=?", field_id, price_id)
        if cur.fetchone() is None:
            raise FieldError("Không tìm thấy khung giá", 404, "PRICE_NOT_FOUND")
        start, end, price = _slot(_json())
        _ensure_nonoverlap(cur, field_id, start, end, price_id)
        cur.execute("""UPDATE dbo.FieldPrices SET StartTime=?,EndTime=?,Price=?
                       WHERE FieldID=? AND PriceID=?""", start, end, price, field_id, price_id)
        return {"message": "Đã sửa khung giá", "field": _load_details(cur, field_id)}, 200
    return _perform(operation)


@field_admin_bp.delete("/<int:field_id>/prices/<int:price_id>")
@jwt_required
@role_required("ADMIN")
def delete_price_slot(field_id, price_id):
    def operation(cur):
        _field(cur, field_id, lock=True)
        if _future_bookings(cur, field_id):
            raise FieldError("Sân còn booking hiệu lực; không thể đổi bảng khung giờ", 409, "ACTIVE_BOOKINGS")
        cur.execute("DELETE FROM dbo.FieldPrices WHERE FieldID=? AND PriceID=?", field_id, price_id)
        if cur.rowcount != 1:
            raise FieldError("Không tìm thấy khung giá", 404, "PRICE_NOT_FOUND")
        return {"message": "Đã xóa khung giá", "field": _load_details(cur, field_id)}, 200
    return _perform(operation)
