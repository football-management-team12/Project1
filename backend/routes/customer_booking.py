import re

from flask import Blueprint, jsonify, request

from database import get_connection


customer_booking_bp = Blueprint(
    "customer_booking",
    __name__,
)


ALLOWED_BOOKING_STATUSES = {
    "PENDING",
    "CONFIRMED",
    "CANCELLED",
    "COMPLETED",
}


def normalize_time(value):
    if value is None:
        return None

    if hasattr(value, "strftime"):
        return value.strftime("%H:%M")

    text = str(value)

    match = re.match(
        r"^(\d{1,2}):(\d{2})",
        text,
    )

    if match is None:
        return text

    return (
        f"{match.group(1).zfill(2)}:"
        f"{match.group(2)}"
    )


def row_to_booking(row):
    return {
        "BookingID": row.BookingID,
        "UserID": row.UserID,

        "CustomerName": getattr(
            row,
            "FullName",
            None,
        ),

        "Phone": getattr(
            row,
            "Phone",
            None,
        ),

        "Email": getattr(
            row,
            "Email",
            None,
        ),

        "FieldID": row.FieldID,

        "FieldName": getattr(
            row,
            "FieldName",
            None,
        ),

        "FieldType": getattr(
            row,
            "FieldType",
            None,
        ),

        "Location": getattr(
            row,
            "Location",
            None,
        ),

        "BookingDate": str(
            row.BookingDate
        ),

        "StartTime": normalize_time(
            row.StartTime
        ),

        "EndTime": normalize_time(
            row.EndTime
        ),

        "TotalAmount": float(
            row.TotalAmount or 0
        ),

        "Status": str(
            row.Status or ""
        ).strip().upper(),

        "CreatedAt": (
            str(row.CreatedAt)
            if row.CreatedAt is not None
            else None
        ),

        # PAYMENT-01 sẽ tích hợp sau.
        "PaymentStatus": None,
    }


def get_active_customer(
    cursor,
    user_id,
):
    cursor.execute(
        """
        SELECT
            UserID,
            FullName,
            Email,
            Phone,
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

    role = str(
        user.Role or ""
    ).strip().upper()

    status = str(
        user.Status or ""
    ).strip().upper()

    if role != "CUSTOMER":
        return None

    if status != "ACTIVE":
        return None

    return user


def booking_select_sql():
    return """
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
    """


# ============================================================
# BOOKING-02
# CUSTOMER BOOKING HISTORY
#
# GET /api/customer-bookings/<user_id>
# GET /api/customer-bookings/<user_id>?status=PENDING
#
# Tạm thời sử dụng UserID từ flow login hiện tại.
# AUTH-01 sẽ thay bằng JWT/server-side identity.
# ============================================================

@customer_booking_bp.route(
    "/<int:user_id>",
    methods=["GET"],
)
def get_customer_bookings(user_id):
    conn = None
    cursor = None

    try:
        status_filter = str(
            request.args.get("status")
            or ""
        ).strip().upper()

        if (
            status_filter
            and status_filter
            not in ALLOWED_BOOKING_STATUSES
        ):
            return jsonify({
                "message":
                    "Trạng thái lọc không hợp lệ",

                "allowedStatus":
                    sorted(
                        ALLOWED_BOOKING_STATUSES
                    ),
            }), 400

        conn = get_connection()

        if conn is None:
            return jsonify({
                "message":
                    "Không thể kết nối database"
            }), 500

        cursor = conn.cursor()

        customer = get_active_customer(
            cursor,
            user_id,
        )

        if customer is None:
            return jsonify({
                "message":
                    "Tài khoản khách hàng không hợp lệ hoặc không hoạt động"
            }), 403

        query = (
            booking_select_sql()
            + """
            WHERE B.UserID = ?
            """
        )

        params = [
            user_id
        ]

        if status_filter:
            query += """
                AND UPPER(
                    LTRIM(
                        RTRIM(B.Status)
                    )
                ) = ?
            """

            params.append(
                status_filter
            )

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
            for row
            in cursor.fetchall()
        ]

        return jsonify({
            "Total":
                len(bookings),

            "Bookings":
                bookings,

            "Customer": {
                "UserID":
                    customer.UserID,

                "FullName":
                    customer.FullName,

                "Email":
                    customer.Email,

                "Phone":
                    customer.Phone,
            },

            "Filters": {
                "Status":
                    status_filter or None,
            },
        }), 200

    except Exception as error:
        print(
            "GET CUSTOMER BOOKINGS ERROR:"
        )

        print(error)

        return jsonify({
            "message":
                "Có lỗi xảy ra khi lấy lịch sử đặt sân"
        }), 500

    finally:
        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# BOOKING-02
# CUSTOMER BOOKING DETAIL
#
# GET /api/customer-bookings/<user_id>/<booking_id>
#
# Query kiểm tra cả UserID và BookingID.
# Việc xác thực UserID thật sự sẽ do AUTH-01/JWT xử lý.
# ============================================================

@customer_booking_bp.route(
    "/<int:user_id>/<int:booking_id>",
    methods=["GET"],
)
def get_customer_booking_detail(
    user_id,
    booking_id,
):
    conn = None
    cursor = None

    try:
        conn = get_connection()

        if conn is None:
            return jsonify({
                "message":
                    "Không thể kết nối database"
            }), 500

        cursor = conn.cursor()

        customer = get_active_customer(
            cursor,
            user_id,
        )

        if customer is None:
            return jsonify({
                "message":
                    "Tài khoản khách hàng không hợp lệ hoặc không hoạt động"
            }), 403

        query = (
            booking_select_sql()
            + """
            WHERE
                B.BookingID = ?
                AND B.UserID = ?
            """
        )

        cursor.execute(
            query,
            booking_id,
            user_id,
        )

        booking = cursor.fetchone()

        if booking is None:
            return jsonify({
                "message":
                    "Không tìm thấy booking hoặc bạn không có quyền xem booking này"
            }), 404

        return jsonify(
            row_to_booking(
                booking
            )
        ), 200

    except Exception as error:
        print(
            "GET CUSTOMER BOOKING DETAIL ERROR:"
        )

        print(error)

        return jsonify({
            "message":
                "Có lỗi xảy ra khi lấy chi tiết booking"
        }), 500

    finally:
        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()