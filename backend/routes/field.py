from datetime import datetime

from flask import (
    Blueprint,
    jsonify,
    request
)

from database import get_connection

from services.availability_service import (
    build_availability_slots,
    expire_pending_bookings,
)

from services.jwt_service import (
    jwt_required,
    role_required,
    current_user_id,
)


field_bp = Blueprint(
    "field",
    __name__
)


# ============================================================
# GET ALL FIELDS
#
# BE-03
#
# GET /api/fields/
# ============================================================

@field_bp.route("/")
def get_fields():

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


        sql = """
            SELECT
                F.FieldID,
                F.FieldName,
                F.FieldType,
                F.Location,
                F.Image,
                F.Status,

                P.StartTime,
                P.EndTime,
                P.Price

            FROM FootballFields F

            LEFT JOIN FieldPrices P
                ON F.FieldID = P.FieldID

            WHERE F.IsArchived = 0

            ORDER BY
                F.FieldID,
                P.StartTime
        """

        cursor.execute(
            sql
        )

        rows = cursor.fetchall()

        fields = []

        for row in rows:

            fields.append({

                "FieldID":
                    row.FieldID,

                "FieldName":
                    row.FieldName,

                "FieldType":
                    row.FieldType,

                "Location":
                    row.Location,

                "Image":
                    row.Image,

                "Status":
                    row.Status,

                "StartTime": (
                    str(
                        row.StartTime
                    )
                    if row.StartTime
                    is not None
                    else None
                ),

                "EndTime": (
                    str(
                        row.EndTime
                    )
                    if row.EndTime
                    is not None
                    else None
                ),

                "Price": (
                    float(
                        row.Price
                    )
                    if row.Price
                    is not None
                    else None
                ),

            })

        return jsonify(
            fields
        ), 200

    except Exception as error:

        print(
            "GET FIELDS ERROR:"
        )

        print(error)

        return jsonify({
            "message":
                "Có lỗi xảy ra khi lấy danh sách sân"
        }), 500

    finally:

        if cursor is not None:

            cursor.close()

        if conn is not None:

            conn.close()


# ============================================================
# UPDATE FIELD PRICE
#
# PUT /api/fields/price/<field_id>
#
# T123-72:
# Chỉ ADMIN được cập nhật bảng giá.
# ============================================================

@field_bp.route(
    "/price/<int:field_id>",
    methods=["PUT"]
)
@jwt_required
@role_required(
    "ADMIN"
)
def update_field_price(
    field_id
):

    conn = None
    cursor = None

    try:

        data = (
            request.get_json(
                silent=True
            )
            or {}
        )

        if not isinstance(data, dict):
            return jsonify({"message": "Body phải là JSON object"}), 400

        start_time = data.get(
            "StartTime"
        )

        end_time = data.get(
            "EndTime"
        )

        price = data.get(
            "Price"
        )

        # ====================================================
        # BASIC VALIDATION
        # ====================================================

        if (
            start_time is None
            or
            end_time is None
            or
            price is None
        ):

            return jsonify({
                "message":
                    "Thiếu StartTime, EndTime hoặc Price"
            }), 400

        # UC15/T123-105: Chặn giá âm và khung giờ không hợp lệ.
        from services.field_management_service import (
            FieldManagementError,
            validate_slot,
            ensure_no_active_bookings,
            require_active_admin,
        )
        try:
            start_time, end_time, price = validate_slot(data)
        except FieldManagementError as exc:
            return jsonify({"message": exc.message, "code": exc.code}), exc.status

        conn = get_connection()

        if conn is None:

            return jsonify({
                "message":
                    "Không thể kết nối database"
            }), 500

        cursor = conn.cursor()
        cursor.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        try:
            require_active_admin(cursor, current_user_id())
        except FieldManagementError as exc:
            conn.rollback()
            return jsonify({"message": exc.message, "code": exc.code}), exc.status
        cursor.execute(
            """SELECT FieldID, IsArchived FROM dbo.FootballFields
               WITH (UPDLOCK, HOLDLOCK) WHERE FieldID=?""",
            field_id
        )
        current_field = cursor.fetchone()
        if current_field is None:
            conn.rollback()
            return jsonify({"message": "Không tìm thấy sân bóng"}), 404
        if current_field.IsArchived:
            conn.rollback()
            return jsonify({"message": "Không thể đổi giá sân đã lưu trữ"}), 409

        try:
            ensure_no_active_bookings(cursor, field_id)
        except FieldManagementError as exc:
            conn.rollback()
            return jsonify({"message": exc.message, "code": exc.code}), exc.status

        # Legacy API không nhận PriceID: tránh ghi đè tất cả
        # khung giờ khi một sân có nhiều mức giá.
        cursor.execute(
            "SELECT COUNT(*) FROM dbo.FieldPrices WHERE FieldID=?",
            field_id
        )
        if int(cursor.fetchone()[0]) != 1:
            conn.rollback()
            return jsonify({
                "message": "Sân có nhiều khung giá. Hãy dùng API /api/admin/fields/<id>/prices/<price_id>"
            }), 409

        cursor.execute(
            """UPDATE dbo.FieldPrices
               SET StartTime=?, EndTime=?, Price=?
               WHERE FieldID=?""",
            start_time, end_time, price, field_id
        )

        if cursor.rowcount == 0:

            conn.rollback()

            return jsonify({
                "message":
                    "Không tìm thấy bảng giá của sân"
            }), 404

        conn.commit()

        return jsonify({
            "message":
                "Update price successfully"
        }), 200

    except Exception as error:

        print(
            "UPDATE FIELD PRICE ERROR:"
        )

        print(error)

        if conn is not None:

            conn.rollback()

        return jsonify({
            "message":
                "Có lỗi xảy ra khi cập nhật giá sân"
        }), 500

    finally:

        if cursor is not None:

            cursor.close()

        if conn is not None:

            conn.close()


# ============================================================
# GET FIELD AVAILABILITY
#
# T123-59 - BE-05
#
# GET:
# /api/fields/<field_id>/availability?date=YYYY-MM-DD
#
# Example:
# /api/fields/1/availability?date=2026-09-26
#
# Public endpoint:
# Không cần Login/JWT.
# ============================================================

@field_bp.route(
    "/<int:field_id>/availability",
    methods=["GET"]
)
def get_field_availability(
    field_id
):

    conn = None
    cursor = None

    try:

        # ====================================================
        # GET DATE
        # ====================================================

        booking_date = (
            request.args.get(
                "date"
            )
        )

        if not booking_date:

            return jsonify({

                "message":
                    "Vui lòng truyền ngày cần kiểm tra",

                "example":
                    "?date=2026-09-26"

            }), 400

        # ====================================================
        # VALIDATE DATE
        # ====================================================

        try:

            date_object = (
                datetime.strptime(
                    booking_date,
                    "%Y-%m-%d"
                ).date()
            )

        except ValueError:

            return jsonify({
                "message":
                    "Ngày không đúng định dạng YYYY-MM-DD"
            }), 400

        # ====================================================
        # DATABASE
        # ====================================================

        conn = get_connection()

        if conn is None:

            return jsonify({
                "message":
                    "Không thể kết nối database"
            }), 500

        cursor = conn.cursor()

        expire_pending_bookings(cursor)
        conn.commit()

        # ====================================================
        # CHECK FIELD EXISTS
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
              AND IsArchived = 0
            """,
            field_id
        )

        field = cursor.fetchone()

        if field is None:

            return jsonify({
                "message":
                    "Không tìm thấy sân bóng"
            }), 404

        # ====================================================
        # GET PRICE SLOTS
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

            ORDER BY StartTime
            """,
            field_id
        )

        price_rows = (
            cursor.fetchall()
        )

        price_slots = []

        for row in price_rows:

            price_slots.append({

                "PriceID":
                    row.PriceID,

                "FieldID":
                    row.FieldID,

                "StartTime":
                    row.StartTime,

                "EndTime":
                    row.EndTime,

                "Price":
                    float(
                        row.Price or 0
                    ),

            })

        # ====================================================
        # GET BOOKINGS
        # ====================================================

        cursor.execute(
            """
            SELECT
                BookingID,
                UserID,
                FieldID,
                BookingDate,
                StartTime,
                EndTime,
                TotalAmount,
                Status,
                CreatedAt

            FROM Bookings

            WHERE FieldID = ?

              AND CAST(
                    BookingDate AS DATE
                  ) = ?

            ORDER BY
                StartTime
            """,
            field_id,
            date_object
        )

        booking_rows = (
            cursor.fetchall()
        )

        bookings = []

        for row in booking_rows:

            bookings.append({

                "BookingID":
                    row.BookingID,

                "UserID":
                    row.UserID,

                "FieldID":
                    row.FieldID,

                "BookingDate": (
                    str(
                        row.BookingDate
                    )
                    if row.BookingDate
                    is not None
                    else None
                ),

                "StartTime":
                    row.StartTime,

                "EndTime":
                    row.EndTime,

                "TotalAmount": (
                    float(
                        row.TotalAmount
                    )
                    if row.TotalAmount
                    is not None
                    else 0
                ),

                "Status":
                    row.Status,

                "CreatedAt": (
                    str(
                        row.CreatedAt
                    )
                    if row.CreatedAt
                    is not None
                    else None
                ),

            })

        # ====================================================
        # CHECK FIELD STATUS
        # ====================================================

        field_available = (

            str(
                field.Status
            )
            .strip()
            .upper()

            ==

            "AVAILABLE"
        )

        # ====================================================
        # BUILD AVAILABILITY
        # ====================================================

        slots = (
            build_availability_slots(
                price_slots,
                bookings,
                field_available
            )
        )

        # ====================================================
        # COUNT AVAILABLE
        # ====================================================

        available_count = sum(

            1

            for slot
            in slots

            if slot[
                "available"
            ]
        )

        unavailable_count = (
            len(slots)
            -
            available_count
        )

        # ====================================================
        # RESPONSE
        # ====================================================

        return jsonify({

            "FieldID":
                field.FieldID,

            "FieldName":
                field.FieldName,

            "FieldType":
                field.FieldType,

            "Location":
                field.Location,

            "FieldStatus":
                field.Status,

            "Date":
                booking_date,

            "FieldAvailable":
                field_available,

            "AvailableCount":
                available_count,

            "UnavailableCount":
                unavailable_count,

            "Slots":
                slots,

        }), 200

    except Exception as error:

        print(
            "GET FIELD AVAILABILITY ERROR:"
        )

        print(error)

        return jsonify({
            "message":
                "Có lỗi xảy ra khi kiểm tra lịch sân"
        }), 500

    finally:

        if cursor is not None:

            cursor.close()

        if conn is not None:

            conn.close()


# ============================================================
# BE-05.1
# GET AVAILABILITY OF ALL FIELDS
#
# GET:
# /api/fields/availability?date=YYYY-MM-DD
#
# Mục đích:
# - Lấy toàn bộ sân.
# - Lấy toàn bộ bảng giá.
# - Lấy booking trong ngày.
# - Chỉ dùng 3 query chính.
# - Gom dữ liệu theo FieldID ở Python.
#
# Public endpoint:
# Không yêu cầu JWT.
# ============================================================

@field_bp.route(
    "/availability",
    methods=["GET"]
)
def get_all_fields_availability():

    conn = None
    cursor = None

    try:

        # ====================================================
        # GET DATE
        # ====================================================

        booking_date = (
            request.args.get(
                "date"
            )
        )

        if not booking_date:

            return jsonify({

                "message":
                    "Vui lòng truyền ngày cần kiểm tra",

                "example":
                    "?date=2026-10-04",

            }), 400

        # ====================================================
        # VALIDATE DATE
        # ====================================================

        try:

            date_object = (
                datetime.strptime(
                    booking_date,
                    "%Y-%m-%d"
                ).date()
            )

        except ValueError:

            return jsonify({
                "message":
                    "Ngày không đúng định dạng YYYY-MM-DD"
            }), 400

        # ====================================================
        # CONNECT DATABASE
        # ====================================================

        conn = get_connection()

        if conn is None:

            return jsonify({
                "message":
                    "Không thể kết nối database"
            }), 500

        cursor = conn.cursor()

        expire_pending_bookings(cursor)
        conn.commit()

        # ====================================================
        # QUERY 1
        # GET ALL FIELDS
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

            WHERE IsArchived = 0

            ORDER BY FieldID
            """
        )

        field_rows = (
            cursor.fetchall()
        )

        # ====================================================
        # QUERY 2
        # GET ALL FIELD PRICE SLOTS
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

            ORDER BY
                FieldID,
                StartTime
            """
        )

        price_rows = (
            cursor.fetchall()
        )

        # ====================================================
        # QUERY 3
        # GET ALL BOOKINGS OF SELECTED DATE
        # ====================================================

        cursor.execute(
            """
            SELECT
                BookingID,
                UserID,
                FieldID,
                BookingDate,
                StartTime,
                EndTime,
                TotalAmount,
                Status,
                CreatedAt

            FROM Bookings

            WHERE CAST(
                BookingDate AS DATE
            ) = ?

            ORDER BY
                FieldID,
                StartTime
            """,
            date_object
        )

        booking_rows = (
            cursor.fetchall()
        )

        # ====================================================
        # GROUP FIELD PRICES BY FieldID
        #
        # {
        #     1001: [...],
        #     1002: [...]
        # }
        # ====================================================

        prices_by_field = {}

        for row in price_rows:

            field_id = (
                row.FieldID
            )

            if (
                field_id
                not in
                prices_by_field
            ):

                prices_by_field[
                    field_id
                ] = []

            prices_by_field[
                field_id
            ].append({

                "PriceID":
                    row.PriceID,

                "FieldID":
                    row.FieldID,

                "StartTime":
                    row.StartTime,

                "EndTime":
                    row.EndTime,

                "Price":
                    float(
                        row.Price or 0
                    ),

            })

        # ====================================================
        # GROUP BOOKINGS BY FieldID
        # ====================================================

        bookings_by_field = {}

        for row in booking_rows:

            field_id = (
                row.FieldID
            )

            if (
                field_id
                not in
                bookings_by_field
            ):

                bookings_by_field[
                    field_id
                ] = []

            bookings_by_field[
                field_id
            ].append({

                "BookingID":
                    row.BookingID,

                "UserID":
                    row.UserID,

                "FieldID":
                    row.FieldID,

                "BookingDate": (
                    str(
                        row.BookingDate
                    )
                    if row.BookingDate
                    is not None
                    else None
                ),

                "StartTime":
                    row.StartTime,

                "EndTime":
                    row.EndTime,

                "TotalAmount": (
                    float(
                        row.TotalAmount
                    )
                    if row.TotalAmount
                    is not None
                    else 0
                ),

                "Status":
                    row.Status,

                "CreatedAt": (
                    str(
                        row.CreatedAt
                    )
                    if row.CreatedAt
                    is not None
                    else None
                ),

            })

        # ====================================================
        # BUILD WEBSITE-READY RESPONSE
        # ====================================================

        fields_result = []

        available_fields = 0
        unavailable_fields = 0

        for field in field_rows:

            field_id = (
                field.FieldID
            )

            # =================================================
            # FIELD STATUS
            # =================================================

            field_available = (

                str(
                    field.Status
                )
                .strip()
                .upper()

                ==

                "AVAILABLE"
            )

            # =================================================
            # GET DATA OF CURRENT FIELD
            # =================================================

            price_slots = (
                prices_by_field.get(
                    field_id,
                    []
                )
            )

            bookings = (
                bookings_by_field.get(
                    field_id,
                    []
                )
            )

            # =================================================
            # REUSE BE-05 SERVICE
            # =================================================

            slots = (
                build_availability_slots(
                    price_slots,
                    bookings,
                    field_available
                )
            )

            # =================================================
            # COUNT AVAILABLE / UNAVAILABLE SLOTS
            # =================================================

            available_count = sum(

                1

                for slot
                in slots

                if slot[
                    "available"
                ]
            )

            unavailable_count = (
                len(slots)
                -
                available_count
            )

            # =================================================
            # FIELD HAS AT LEAST ONE AVAILABLE SLOT
            # =================================================

            has_available_slot = (

                field_available
                and
                available_count > 0
            )

            # =================================================
            # COUNT AVAILABLE FIELDS
            # =================================================

            if has_available_slot:

                available_fields += 1

            else:

                unavailable_fields += 1

            # =================================================
            # ADD FIELD TO RESPONSE
            # =================================================

            fields_result.append({

                "FieldID":
                    field.FieldID,

                "FieldName":
                    field.FieldName,

                "FieldType":
                    field.FieldType,

                "Location":
                    field.Location,

                "FieldStatus":
                    field.Status,

                "FieldAvailable":
                    field_available,

                "AvailableCount":
                    available_count,

                "UnavailableCount":
                    unavailable_count,

                "HasAvailableSlot":
                    has_available_slot,

                "Slots":
                    slots,

            })

        # ====================================================
        # FINAL RESPONSE
        # ====================================================

        return jsonify({

            "Date":
                booking_date,

            "TotalFields":
                len(
                    fields_result
                ),

            "AvailableFields":
                available_fields,

            "UnavailableFields":
                unavailable_fields,

            "Fields":
                fields_result,

        }), 200

    except Exception as error:

        print(
            "GET ALL FIELDS AVAILABILITY ERROR:"
        )

        print(error)

        return jsonify({
            "message":
                "Có lỗi xảy ra khi kiểm tra lịch toàn bộ sân"
        }), 500

    finally:

        if cursor is not None:

            cursor.close()

        if conn is not None:

            conn.close()
