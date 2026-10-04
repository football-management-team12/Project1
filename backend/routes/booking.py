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


ALLOWED_BOOKING_STATUSES = {
    "PENDING",
    "CONFIRMED",
    "CANCELLED",
    "COMPLETED",
}


STATUS_TRANSITIONS = {
    "PENDING": {
        "CONFIRMED",
        "CANCELLED",
    },
    "CONFIRMED": {
        "COMPLETED",
        "CANCELLED",
    },
    "CANCELLED": set(),
    "COMPLETED": set(),
}


BOOKING_MANAGER_ROLES = {
    "ADMIN",
    "STAFF",
}


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


def row_to_booking(row):
    return {
        "BookingID": row.BookingID,
        "UserID": row.UserID,
        "CustomerName": getattr(row, "FullName", None),
        "Phone": getattr(row, "Phone", None),
        "Email": getattr(row, "Email", None),
        "FieldID": row.FieldID,
        "FieldName": getattr(row, "FieldName", None),
        "FieldType": getattr(row, "FieldType", None),
        "Location": getattr(row, "Location", None),
        "BookingDate": str(row.BookingDate),
        "StartTime": normalize_time(row.StartTime),
        "EndTime": normalize_time(row.EndTime),
        "TotalAmount": float(row.TotalAmount or 0),
        "Status": str(row.Status or "").strip().upper(),
        "CreatedAt": (
            str(row.CreatedAt)
            if row.CreatedAt is not None
            else None
        ),
    }


def get_booking_manager(cursor, user_id):
    """
    Temporary S1 Role check for T123-71.

    T123-72 will replace this approach with JWT/server-side authorization.
    """

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return None

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
        return None

    role = str(user.Role or "").strip().upper()
    status = str(user.Status or "").strip().upper()

    if role not in BOOKING_MANAGER_ROLES:
        return None

    if status != "ACTIVE":
        return None

    return user


def get_booking_row(cursor, booking_id):
    cursor.execute(
        """
        SELECT
            B.BookingID,
            B.UserID,
            B.FieldID,
            B.BookingDate,
            B.StartTime,
            B.EndTime,
            B.TotalAmount,
            B.Status,
            B.CreatedAt,

            F.FieldName,
            F.FieldType,
            F.Location,

            U.FullName,
            U.Phone,
            U.Email

        FROM Bookings B

        INNER JOIN FootballFields F
            ON B.FieldID = F.FieldID

        INNER JOIN Users U
            ON B.UserID = U.UserID

        WHERE B.BookingID = ?
        """,
        booking_id,
    )

    return cursor.fetchone()


# ============================================================
# BE-06 - CREATE BOOKING
#
# POST /api/bookings/
#
# Booking mới luôn có Status = PENDING.
# Giá lấy từ FieldPrices, không tin giá frontend gửi lên.
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

        # DB Bookings hiện chưa lưu PaymentMethod.
        # Vẫn trả lại để frontend tiếp tục flow xác nhận.
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

        # Giảm race condition khi hai request cùng đặt một slot.
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
            # CANCELLED không chiếm sân.
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
        # Booking mới luôn PENDING, không tự CONFIRMED.
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


# ============================================================
# GET BOOKING DETAIL
#
# GET /api/bookings/<booking_id>
# ============================================================

@booking_bp.route(
    "/<int:booking_id>",
    methods=["GET"],
)
def get_booking_detail(booking_id):
    conn = None
    cursor = None

    try:
        conn = get_connection()

        if conn is None:
            return jsonify({
                "message": "Không thể kết nối database"
            }), 500

        cursor = conn.cursor()

        booking = get_booking_row(
            cursor,
            booking_id,
        )

        if booking is None:
            return jsonify({
                "message": "Không tìm thấy booking"
            }), 404

        return jsonify(
            row_to_booking(booking)
        ), 200

    except Exception as error:
        print("GET BOOKING DETAIL ERROR:")
        print(error)

        return jsonify({
            "message": "Có lỗi xảy ra khi lấy booking"
        }), 500

    finally:
        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# STAFF / ADMIN - GET ALL BOOKINGS
#
# GET /api/bookings/?adminUserID=1&status=PENDING&search=Nguyen
#
# T123-72 sẽ thay adminUserID bằng JWT/Role authorization.
# ============================================================

@booking_bp.route(
    "/",
    methods=["GET"],
)
def get_all_bookings():
    conn = None
    cursor = None

    try:
        manager_user_id = request.args.get("adminUserID")
        status_filter = str(
            request.args.get("status") or ""
        ).strip().upper()
        search_text = str(
            request.args.get("search") or ""
        ).strip()

        if (
            status_filter
            and status_filter not in ALLOWED_BOOKING_STATUSES
        ):
            return jsonify({
                "message": "Trạng thái lọc không hợp lệ",
                "allowedStatus": sorted(ALLOWED_BOOKING_STATUSES),
            }), 400

        conn = get_connection()

        if conn is None:
            return jsonify({
                "message": "Không thể kết nối database"
            }), 500

        cursor = conn.cursor()

        manager = get_booking_manager(
            cursor,
            manager_user_id,
        )

        if manager is None:
            return jsonify({
                "message": "Bạn không có quyền quản lý booking"
            }), 403

        query = """
            SELECT
                B.BookingID,
                B.UserID,
                B.FieldID,
                B.BookingDate,
                B.StartTime,
                B.EndTime,
                B.TotalAmount,
                B.Status,
                B.CreatedAt,

                F.FieldName,
                F.FieldType,
                F.Location,

                U.FullName,
                U.Phone,
                U.Email

            FROM Bookings B

            INNER JOIN FootballFields F
                ON B.FieldID = F.FieldID

            INNER JOIN Users U
                ON B.UserID = U.UserID

            WHERE 1 = 1
        """

        params = []

        if status_filter:
            query += """
                AND UPPER(LTRIM(RTRIM(B.Status))) = ?
            """
            params.append(status_filter)

        if search_text:
            keyword = f"%{search_text}%"
            query += """
                AND (
                    CAST(B.BookingID AS NVARCHAR(50)) LIKE ?
                    OR U.FullName LIKE ?
                    OR U.Phone LIKE ?
                    OR U.Email LIKE ?
                    OR F.FieldName LIKE ?
                    OR CONVERT(NVARCHAR(10), B.BookingDate, 23) LIKE ?
                )
            """
            params.extend([
                keyword,
                keyword,
                keyword,
                keyword,
                keyword,
                keyword,
            ])

        query += """
            ORDER BY
                B.CreatedAt DESC,
                B.BookingID DESC
        """

        cursor.execute(
            query,
            *params,
        )

        bookings = [
            row_to_booking(row)
            for row in cursor.fetchall()
        ]

        return jsonify({
            "Total": len(bookings),
            "Bookings": bookings,
            "Filters": {
                "Status": status_filter or None,
                "Search": search_text or None,
            },
            "RequestedBy": {
                "UserID": manager.UserID,
                "FullName": manager.FullName,
                "Role": str(manager.Role or "").strip().upper(),
            },
        }), 200

    except Exception as error:
        print("GET ALL BOOKINGS ERROR:")
        print(error)

        return jsonify({
            "message": "Có lỗi xảy ra khi lấy danh sách booking"
        }), 500

    finally:
        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# STAFF / ADMIN - UPDATE BOOKING STATUS
#
# PATCH /api/bookings/<booking_id>/status
#
# Body:
# {
#   "Status": "CONFIRMED",
#   "AdminUserID": 1
# }
# ============================================================

@booking_bp.route(
    "/<int:booking_id>/status",
    methods=["PATCH"],
)
def update_booking_status(booking_id):
    conn = None
    cursor = None

    try:
        data = request.get_json(silent=True) or {}

        new_status = str(
            data.get("Status") or ""
        ).strip().upper()

        manager_user_id = data.get("AdminUserID")

        if new_status not in ALLOWED_BOOKING_STATUSES:
            return jsonify({
                "message": "Trạng thái booking không hợp lệ",
                "allowedStatus": sorted(ALLOWED_BOOKING_STATUSES),
            }), 400

        conn = get_connection()

        if conn is None:
            return jsonify({
                "message": "Không thể kết nối database"
            }), 500

        cursor = conn.cursor()

        manager = get_booking_manager(
            cursor,
            manager_user_id,
        )

        if manager is None:
            return jsonify({
                "message": "Bạn không có quyền cập nhật booking"
            }), 403

        # Lock row while checking/updating status.
        cursor.execute(
            """
            SELECT
                BookingID,
                Status
            FROM Bookings WITH (UPDLOCK, HOLDLOCK)
            WHERE BookingID = ?
            """,
            booking_id,
        )

        booking = cursor.fetchone()

        if booking is None:
            conn.rollback()
            return jsonify({
                "message": "Không tìm thấy booking"
            }), 404

        current_status = str(
            booking.Status or ""
        ).strip().upper()

        if current_status not in ALLOWED_BOOKING_STATUSES:
            conn.rollback()
            return jsonify({
                "message": "Trạng thái hiện tại của booking không hợp lệ"
            }), 409

        if new_status == current_status:
            conn.rollback()
            return jsonify({
                "message": "Booking đã ở trạng thái này",
                "BookingID": booking_id,
                "Status": current_status,
            }), 200

        allowed_next_status = STATUS_TRANSITIONS.get(
            current_status,
            set(),
        )

        if new_status not in allowed_next_status:
            conn.rollback()
            return jsonify({
                "message": (
                    f"Không thể chuyển từ {current_status} "
                    f" sang {new_status}"
                ),
                "OldStatus": current_status,
                "RequestedStatus": new_status,
                "AllowedNextStatus": sorted(allowed_next_status),
            }), 409

        cursor.execute(
            """
            UPDATE Bookings
            SET Status = ?
            WHERE BookingID = ?
            """,
            new_status,
            booking_id,
        )

        conn.commit()

        updated_booking = get_booking_row(
            cursor,
            booking_id,
        )

        return jsonify({
            "message": "Cập nhật trạng thái booking thành công",
            "BookingID": booking_id,
            "OldStatus": current_status,
            "Status": new_status,
            "UpdatedBy": {
                "UserID": manager.UserID,
                "FullName": manager.FullName,
                "Role": str(manager.Role or "").strip().upper(),
            },
            "Booking": (
                row_to_booking(updated_booking)
                if updated_booking is not None
                else None
            ),
        }), 200

    except Exception as error:
        print("UPDATE BOOKING STATUS ERROR:")
        print(error)

        if conn is not None:
            conn.rollback()

        return jsonify({
            "message": "Có lỗi xảy ra khi cập nhật trạng thái booking"
        }), 500

    finally:
        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()