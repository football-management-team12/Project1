from datetime import datetime

from flask import (
    Blueprint,
    jsonify,
    request
)

from database import get_connection

from services.availability_service import (
    build_availability_slots
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

    conn = get_connection()

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

    ORDER BY F.FieldID, P.StartTime

    """


    cursor.execute(sql)


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

            "StartTime":
                str(row.StartTime),

            "EndTime":
                str(row.EndTime),

            "Price":
                row.Price

        })


    return jsonify(fields)


# ============================================================
# UPDATE FIELD PRICE
#
# Code đã có trước BE-05
#
# PUT /api/fields/price/<field_id>
# ============================================================

@field_bp.route(
    "/price/<int:field_id>",
    methods=["PUT"]
)
def update_field_price(
    field_id
):

    data = request.json


    start_time = data.get(
        "StartTime"
    )

    end_time = data.get(
        "EndTime"
    )

    price = data.get(
        "Price"
    )


    conn = get_connection()

    cursor = conn.cursor()


    sql = """

    UPDATE FieldPrices

    SET
        StartTime = ?,
        EndTime = ?,
        Price = ?

    WHERE FieldID = ?

    """


    cursor.execute(
        sql,
        start_time,
        end_time,
        price,
        field_id
    )


    conn.commit()


    return jsonify({

        "message":
            "Update price successfully"

    })


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

        booking_date = request.args.get(
            "date"
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

            date_object = datetime.strptime(
                booking_date,
                "%Y-%m-%d"
            ).date()


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
                    )
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
                    str(row.BookingDate)
                    if row.BookingDate is not None
                    else None
                ),

                "StartTime":
                    row.StartTime,

                "EndTime":
                    row.EndTime,

                "TotalAmount": (
                    float(row.TotalAmount)
                    if row.TotalAmount is not None
                    else 0
                ),

                "Status":
                    row.Status,

                "CreatedAt": (
                    str(row.CreatedAt)
                    if row.CreatedAt is not None
                    else None
                )
            })


        # ====================================================
        # CHECK FIELD STATUS
        # ====================================================

        field_available = (
            str(field.Status)
            .strip()
            .upper()
            ==
            "AVAILABLE"
        )


        # ====================================================
        # BUILD AVAILABILITY
        # ====================================================

        slots = build_availability_slots(
            price_slots,
            bookings,
            field_available
        )


        # ====================================================
        # COUNT AVAILABLE
        # ====================================================

        available_count = sum(

            1

            for slot in slots

            if slot["available"]
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
                slots

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
# BE-05.1 - GET AVAILABILITY OF ALL FIELDS
#
# GET:
# /api/fields/availability?date=YYYY-MM-DD
#
# Mục đích:
# - Lấy toàn bộ sân
# - Lấy toàn bộ bảng giá
# - Lấy booking trong ngày
# - Chỉ dùng 3 query chính
# - Gom dữ liệu theo FieldID ở Python
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

        booking_date = request.args.get(
            "date"
        )


        if not booking_date:

            return jsonify({

                "message":
                    "Vui lòng truyền ngày cần kiểm tra",

                "example":
                    "?date=2026-10-04"

            }), 400


        # ====================================================
        # VALIDATE DATE
        # ====================================================

        try:

            date_object = datetime.strptime(
                booking_date,
                "%Y-%m-%d"
            ).date()

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

            ORDER BY FieldID
            """
        )


        field_rows = cursor.fetchall()


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


        price_rows = cursor.fetchall()


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


        booking_rows = cursor.fetchall()


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

            field_id = row.FieldID


            if field_id not in prices_by_field:

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
                    )

            })


        # ====================================================
        # GROUP BOOKINGS BY FieldID
        # ====================================================

        bookings_by_field = {}


        for row in booking_rows:

            field_id = row.FieldID


            if field_id not in bookings_by_field:

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
                    str(row.BookingDate)
                    if row.BookingDate is not None
                    else None
                ),

                "StartTime":
                    row.StartTime,

                "EndTime":
                    row.EndTime,

                "TotalAmount": (
                    float(row.TotalAmount)
                    if row.TotalAmount is not None
                    else 0
                ),

                "Status":
                    row.Status,

                "CreatedAt": (
                    str(row.CreatedAt)
                    if row.CreatedAt is not None
                    else None
                )

            })


        # ====================================================
        # BUILD WEBSITE-READY RESPONSE
        # ====================================================

        fields_result = []

        available_fields = 0

        unavailable_fields = 0


        for field in field_rows:

            field_id = field.FieldID


            # =================================================
            # FIELD STATUS
            # =================================================

            field_available = (

                str(field.Status)
                .strip()
                .upper()

                ==

                "AVAILABLE"
            )


            # =================================================
            # GET DATA OF CURRENT FIELD
            # =================================================

            price_slots = prices_by_field.get(
                field_id,
                []
            )


            bookings = bookings_by_field.get(
                field_id,
                []
            )


            # =================================================
            # REUSE BE-05 SERVICE
            # =================================================

            slots = build_availability_slots(
                price_slots,
                bookings,
                field_available
            )


            # =================================================
            # COUNT AVAILABLE / UNAVAILABLE SLOTS
            # =================================================

            available_count = sum(

                1

                for slot in slots

                if slot["available"]

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
                    slots

            })


        # ====================================================
        # FINAL RESPONSE
        # ====================================================

        return jsonify({

            "Date":
                booking_date,

            "TotalFields":
                len(fields_result),

            "AvailableFields":
                available_fields,

            "UnavailableFields":
                unavailable_fields,

            "Fields":
                fields_result

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
