from datetime import date, datetime

from flask import Blueprint, jsonify, request

from database import get_connection
from services.availability_service import (
    booking_is_cancelled,
    is_time_overlap,
)


booking_bp = Blueprint(
    "booking",
    __name__,
)


# ============================================================
# HELPERS
# ============================================================

def parse_date(value):
    if not value:
        return None

    try:
        return datetime.strptime(
            str(value),
            "%Y-%m-%d",
        ).date()
    except (TypeError, ValueError):
        return None


def normalize_time(value):
    if value is None:
        return None

    if hasattr(value, "strftime"):
        return value.strftime("%H:%M")

    try:
        return datetime.strptime(
            str(value)[:5],
            "%H:%M",
        ).strftime("%H:%M")
    except (TypeError, ValueError):
        return None


# ============================================================
# BE-06 - CREATE BOOKING
#
# POST /api/bookings/
#
# Booking moi luon co Status = PENDING.
# Gia duoc lay tu FieldPrices, khong tin gia frontend gui len.
# ============================================================

@booking_bp.route(
    "/",
    methods=["POST"],
)
def create_booking():
    conn = None
    cursor = None

    try:
        data = request.get_json(silent=True) or {}

        user_id = data.get("UserID")
        field_id = data.get("FieldID")
        booking_date_text = data.get("BookingDate")
        start_time = normalize_time(data.get("StartTime"))
        end_time = normalize_time(data.get("EndTime"))

        # Hien tai DB Bookings chua luu PaymentMethod.
        # Van tra lai de frontend co the tiep tuc flow xac nhan.
        payment_method = data.get("PaymentMethod")

        # ====================================================
        # VALIDATE ID
        # ====================================================
        try:
            user_id = int(user_id)
            field_id = int(field_id)
        except (TypeError, ValueError):
            return jsonify({
                "message": "UserID hoặc FieldID không hợp lệ"
            }), 400

        # ====================================================
        # VALIDATE DATE
        # ====================================================
        booking_date = parse_date(booking_date_text)

        if booking_date is None:
            return jsonify({
                "message": "Ngày đặt không đúng định dạng YYYY-MM-DD"
            }), 400

        if booking_date < date.today():
            return jsonify({
                "message": "Không thể đặt sân cho ngày đã qua"
            }), 400

        # ====================================================
        # VALIDATE TIME
        # ====================================================
        if not start_time or not end_time:
            return jsonify({
                "message": "Khung giờ không hợp lệ"
            }), 400

        start_object = datetime.strptime(start_time, "%H:%M")
        end_object = datetime.strptime(end_time, "%H:%M")

        if start_object >= end_object:
            return jsonify({
                "message": "Giờ kết thúc phải lớn hơn giờ bắt đầu"
            }), 400

        # ====================================================
        # DATABASE
        # ====================================================
        conn = get_connection()

        if conn is None:
            return jsonify({
                "message": "Không thể kết nối database"
            }), 500

        cursor = conn.cursor()

        # Giam race condition khi hai request cung dat mot slot.
        cursor.execute(
            "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"
        )

        # ====================================================
        # CHECK USER
        # ====================================================
        cursor.execute(
            """
            SELECT
                UserID,
                FullName,
                Role,
                Status
            FROM Users
            WHERE UserID = ?
            """,
            user_id,
        )

        user = cursor.fetchone()

        if user is None:
            conn.rollback()
            return jsonify({
                "message": "Không tìm thấy người dùng"
            }), 404

        if str(user.Status or "").strip().upper() != "ACTIVE":
            conn.rollback()
            return jsonify({
                "message": "Tài khoản hiện không hoạt động"
            }), 403

        if str(user.Role or "").strip().upper() != "CUSTOMER":
            conn.rollback()
            return jsonify({
                "message": "Chỉ tài khoản khách hàng mới được đặt sân"
            }), 403

        # ====================================================
        # CHECK FIELD
        # ====================================================
        cursor.execute(
            """
            SELECT
                FieldID,
                FieldName,
                FieldType,
                Location,
                Status
            FROM FootballFields
            WHERE FieldID = ?
            """,
            field_id,
        )

        field = cursor.fetchone()

        if field is None:
            conn.rollback()
            return jsonify({
                "message": "Không tìm thấy sân bóng"
            }), 404

        if str(field.Status or "").strip().upper() != "AVAILABLE":
            conn.rollback()
            return jsonify({
                "message": "Sân hiện không thể đặt"
            }), 409

        # ====================================================
        # GET PRICE FROM DATABASE
        # ====================================================
        cursor.execute(
            """
            SELECT
                PriceID,
                FieldID,
                StartTime,
                EndTime,
                Price
            FROM FieldPrices
            WHERE FieldID = ?
              AND StartTime = CAST(? AS TIME)
              AND EndTime = CAST(? AS TIME)
            """,
            field_id,
            start_time,
            end_time,
        )

        price_row = cursor.fetchone()

        if price_row is None:
            conn.rollback()
            return jsonify({
                "message": "Khung giờ này không tồn tại trong bảng giá"
            }), 400

        total_amount = float(price_row.Price or 0)

        # ====================================================
        # CHECK OVERLAP / DOUBLE BOOKING
        # ====================================================
        cursor.execute(
            """
            SELECT
                BookingID,
                StartTime,
                EndTime,
                Status
            FROM Bookings WITH (UPDLOCK, HOLDLOCK)
            WHERE FieldID = ?
              AND CAST(BookingDate AS DATE) = ?
            """,
            field_id,
            booking_date,
        )

        existing_bookings = cursor.fetchall()

        for booking in existing_bookings:
            # CANCELLED khong chiem san.
            if booking_is_cancelled(booking.Status):
                continue

            if is_time_overlap(
                start_time,
                end_time,
                booking.StartTime,
                booking.EndTime,
            ):
                conn.rollback()
                return jsonify({
                    "message": (
                        "Khung giờ vừa được người khác đặt. "
                        "Vui lòng chọn khung giờ khác."
                    ),
                    "code": "BOOKING_CONFLICT",
                }), 409

        # ====================================================
        # INSERT BOOKING
        # Booking moi luon PENDING, khong tu CONFIRMED.
        # ====================================================
        cursor.execute(
            """
            INSERT INTO Bookings
            (
                UserID,
                FieldID,
                BookingDate,
                StartTime,
                EndTime,
                TotalAmount,
                Status,
                CreatedAt
            )
            OUTPUT INSERTED.BookingID
            VALUES
            (
                ?,
                ?,
                ?,
                CAST(? AS TIME),
                CAST(? AS TIME),
                ?,
                'PENDING',
                GETDATE()
            )
            """,
            user_id,
            field_id,
            booking_date,
            start_time,
            end_time,
            total_amount,
        )

        booking_id = cursor.fetchone()[0]

        conn.commit()

        return jsonify({
            "message": "Yêu cầu đặt sân đã được gửi và đang chờ admin xác nhận",
            "Booking": {
                "BookingID": booking_id,
                "UserID": user_id,
                "CustomerName": user.FullName,
                "FieldID": field.FieldID,
                "FieldName": field.FieldName,
                "FieldType": field.FieldType,
                "Location": field.Location,
                "BookingDate": booking_date_text,
                "PriceID": price_row.PriceID,
                "StartTime": start_time,
                "EndTime": end_time,
                "TotalAmount": total_amount,
                "Status": "PENDING",
                "PaymentMethod": payment_method,
            },
        }), 201

    except Exception as error:
        print("CREATE BOOKING ERROR:")
        print(error)

        if conn is not None:
            conn.rollback()

        return jsonify({
            "message": "Có lỗi xảy ra khi tạo booking"
        }), 500

    finally:
        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()