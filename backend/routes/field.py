from datetime import datetime

import pyodbc

from flask import (
    Blueprint,
    jsonify,
    request
)

from database import get_connection

from services.availability_service import (
    build_availability_slots
)


# ============================================================
# BLUEPRINT
# ============================================================

field_bp = Blueprint(
    "field",
    __name__
)


# ============================================================
# FIELD STATUS
# ============================================================

ALLOWED_STATUS = [
    "AVAILABLE",
    "MAINTENANCE"
]


# ============================================================
# HELPER - VALIDATE TIME
# ============================================================

def validate_time(
    start_time,
    end_time
):

    if not start_time:

        return (
            "Giờ bắt đầu không được để trống"
        )


    if not end_time:

        return (
            "Giờ kết thúc không được để trống"
        )


    try:

        start_object = datetime.strptime(
            str(start_time)[:5],
            "%H:%M"
        )

        end_object = datetime.strptime(
            str(end_time)[:5],
            "%H:%M"
        )


    except ValueError:

        return (
            "Định dạng giờ không hợp lệ"
        )


    if start_object >= end_object:

        return (
            "Giờ kết thúc phải lớn hơn "
            "giờ bắt đầu"
        )


    return None


# ============================================================
# HELPER - VALIDATE PRICE
# ============================================================

def validate_price(price):

    if price is None:

        return (
            None,
            "Giá sân không được để trống"
        )


    try:

        price = float(price)


    except (TypeError, ValueError):

        return (
            None,
            "Giá sân không hợp lệ"
        )


    if price < 0:

        return (
            None,
            "Giá sân không được nhỏ hơn 0"
        )


    return (
        price,
        None
    )


# ============================================================
# GET ALL FIELDS
#
# GET /api/fields/
# ============================================================

@field_bp.route(
    "/",
    methods=["GET"]
)
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


        cursor.execute(
            """
            SELECT
                F.FieldID,
                F.FieldName,
                F.FieldType,
                F.Location,
                F.Image,
                F.Status,

                P.PriceID,
                P.StartTime,
                P.EndTime,
                P.Price

            FROM FootballFields F

            LEFT JOIN FieldPrices P
                ON F.FieldID = P.FieldID

            ORDER BY
                F.FieldID,
                P.StartTime
            """
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

                "PriceID":
                    row.PriceID,

                "StartTime": (
                    str(row.StartTime)
                    if row.StartTime is not None
                    else None
                ),

                "EndTime": (
                    str(row.EndTime)
                    if row.EndTime is not None
                    else None
                ),

                "Price": (
                    float(row.Price)
                    if row.Price is not None
                    else 0
                )
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
                "Không thể lấy danh sách sân bóng"

        }), 500


    finally:

        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# GET ONE FIELD
#
# GET /api/fields/<field_id>
# ============================================================

@field_bp.route(
    "/<int:field_id>",
    methods=["GET"]
)
def get_field_detail(field_id):

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


        cursor.execute(
            """
            SELECT
                F.FieldID,
                F.FieldName,
                F.FieldType,
                F.Location,
                F.Image,
                F.Status,

                P.PriceID,
                P.StartTime,
                P.EndTime,
                P.Price

            FROM FootballFields F

            LEFT JOIN FieldPrices P
                ON F.FieldID = P.FieldID

            WHERE F.FieldID = ?

            ORDER BY
                P.StartTime
            """,
            field_id
        )


        rows = cursor.fetchall()


        if not rows:

            return jsonify({

                "message":
                    "Không tìm thấy sân bóng"

            }), 404


        first_row = rows[0]


        prices = []


        for row in rows:

            if row.PriceID is not None:

                prices.append({

                    "PriceID":
                        row.PriceID,

                    "StartTime": (
                        str(row.StartTime)
                        if row.StartTime is not None
                        else None
                    ),

                    "EndTime": (
                        str(row.EndTime)
                        if row.EndTime is not None
                        else None
                    ),

                    "Price": (
                        float(row.Price)
                        if row.Price is not None
                        else 0
                    )
                })


        result = {

            "FieldID":
                first_row.FieldID,

            "FieldName":
                first_row.FieldName,

            "FieldType":
                first_row.FieldType,

            "Location":
                first_row.Location,

            "Image":
                first_row.Image,

            "Status":
                first_row.Status,

            "Prices":
                prices
        }


        return jsonify(
            result
        ), 200


    except Exception as error:

        print(
            "GET FIELD DETAIL ERROR:"
        )

        print(error)


        return jsonify({

            "message":
                "Có lỗi xảy ra khi lấy thông tin sân"

        }), 500


    finally:

        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# CREATE NEW FIELD
#
# POST /api/fields/
# ============================================================

@field_bp.route(
    "/",
    methods=["POST"]
)
def create_field():

    conn = None
    cursor = None


    try:

        data = request.get_json(
            silent=True
        )


        if not data:

            return jsonify({

                "message":
                    "Dữ liệu gửi lên không hợp lệ"

            }), 400


        field_name = data.get(
            "FieldName"
        )

        field_type = data.get(
            "FieldType"
        )

        location = data.get(
            "Location"
        )

        image = data.get(
            "Image"
        )

        status = data.get(
            "Status",
            "AVAILABLE"
        )

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
        # VALIDATE FIELD NAME
        # ====================================================

        if (
            not field_name
            or
            not field_name.strip()
        ):

            return jsonify({

                "message":
                    "Tên sân không được để trống"

            }), 400


        # ====================================================
        # VALIDATE TYPE
        # ====================================================

        if not field_type:

            return jsonify({

                "message":
                    "Loại sân không được để trống"

            }), 400


        # ====================================================
        # VALIDATE LOCATION
        # ====================================================

        if (
            not location
            or
            not location.strip()
        ):

            return jsonify({

                "message":
                    "Địa điểm không được để trống"

            }), 400


        # ====================================================
        # VALIDATE STATUS
        # ====================================================

        if status not in ALLOWED_STATUS:

            return jsonify({

                "message":
                    "Trạng thái sân không hợp lệ"

            }), 400


        # ====================================================
        # VALIDATE TIME
        # ====================================================

        time_error = validate_time(
            start_time,
            end_time
        )


        if time_error:

            return jsonify({

                "message":
                    time_error

            }), 400


        # ====================================================
        # VALIDATE PRICE
        # ====================================================

        price, price_error = (
            validate_price(price)
        )


        if price_error:

            return jsonify({

                "message":
                    price_error

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
        # CHECK DUPLICATE FIELD NAME
        # ====================================================

        cursor.execute(
            """
            SELECT FieldID

            FROM FootballFields

            WHERE LOWER(FieldName)
                =
                LOWER(?)
            """,
            field_name.strip()
        )


        existed_field = (
            cursor.fetchone()
        )


        if existed_field is not None:

            return jsonify({

                "message":
                    "Tên sân đã tồn tại"

            }), 409


        # ====================================================
        # INSERT FIELD
        # ====================================================

        cursor.execute(
            """
            INSERT INTO FootballFields
            (
                FieldName,
                FieldType,
                Location,
                Image,
                Status
            )

            OUTPUT INSERTED.FieldID

            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                ?
            )
            """,

            field_name.strip(),
            field_type,
            location.strip(),
            image,
            status
        )


        new_field_id = (
            cursor.fetchone()[0]
        )


        # ====================================================
        # INSERT INITIAL PRICE
        # ====================================================

        cursor.execute(
            """
            INSERT INTO FieldPrices
            (
                FieldID,
                StartTime,
                EndTime,
                Price
            )

            VALUES
            (
                ?,
                ?,
                ?,
                ?
            )
            """,

            new_field_id,
            start_time,
            end_time,
            price
        )


        conn.commit()


        return jsonify({

            "message":
                "Thêm sân mới thành công",

            "FieldID":
                new_field_id

        }), 201


    except Exception as error:

        print(
            "CREATE FIELD ERROR:"
        )

        print(error)


        if conn is not None:
            conn.rollback()


        return jsonify({

            "message":
                "Có lỗi xảy ra khi thêm sân"

        }), 500


    finally:

        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# UPDATE FIELD INFORMATION
#
# PUT /api/fields/<field_id>
# ============================================================

@field_bp.route(
    "/<int:field_id>",
    methods=["PUT"]
)
def update_field(field_id):

    conn = None
    cursor = None


    try:

        data = request.get_json(
            silent=True
        )


        if not data:

            return jsonify({

                "message":
                    "Dữ liệu gửi lên không hợp lệ"

            }), 400


        field_name = data.get(
            "FieldName"
        )

        field_type = data.get(
            "FieldType"
        )

        location = data.get(
            "Location"
        )

        image = data.get(
            "Image"
        )


        # ====================================================
        # VALIDATE
        # ====================================================

        if (
            not field_name
            or
            not field_name.strip()
        ):

            return jsonify({

                "message":
                    "Tên sân không được để trống"

            }), 400


        if not field_type:

            return jsonify({

                "message":
                    "Loại sân không được để trống"

            }), 400


        if (
            not location
            or
            not location.strip()
        ):

            return jsonify({

                "message":
                    "Địa điểm không được để trống"

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
            SELECT FieldID

            FROM FootballFields

            WHERE FieldID = ?
            """,
            field_id
        )


        if cursor.fetchone() is None:

            return jsonify({

                "message":
                    "Không tìm thấy sân bóng"

            }), 404


        # ====================================================
        # CHECK DUPLICATE NAME
        # ====================================================

        cursor.execute(
            """
            SELECT FieldID

            FROM FootballFields

            WHERE LOWER(FieldName)
                =
                LOWER(?)

            AND FieldID <> ?
            """,

            field_name.strip(),
            field_id
        )


        if cursor.fetchone() is not None:

            return jsonify({

                "message":
                    "Tên sân đã tồn tại"

            }), 409


        # ====================================================
        # UPDATE FIELD
        # ====================================================

        cursor.execute(
            """
            UPDATE FootballFields

            SET
                FieldName = ?,
                FieldType = ?,
                Location = ?,
                Image = ?

            WHERE FieldID = ?
            """,

            field_name.strip(),
            field_type,
            location.strip(),
            image,
            field_id
        )


        conn.commit()


        return jsonify({

            "message":
                "Cập nhật thông tin sân thành công",

            "FieldID":
                field_id

        }), 200


    except Exception as error:

        print(
            "UPDATE FIELD ERROR:"
        )

        print(error)


        if conn is not None:
            conn.rollback()


        return jsonify({

            "message":
                "Có lỗi xảy ra khi cập nhật sân"

        }), 500


    finally:

        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# UPDATE FIELD STATUS
#
# PATCH /api/fields/<field_id>/status
# ============================================================

@field_bp.route(
    "/<int:field_id>/status",
    methods=["PATCH"]
)
def update_field_status(field_id):

    conn = None
    cursor = None


    try:

        data = request.get_json(
            silent=True
        )


        if not data:

            return jsonify({

                "message":
                    "Dữ liệu gửi lên không hợp lệ"

            }), 400


        status = data.get(
            "Status"
        )


        if status not in ALLOWED_STATUS:

            return jsonify({

                "message":
                    "Trạng thái sân không hợp lệ"

            }), 400


        conn = get_connection()


        if conn is None:

            return jsonify({

                "message":
                    "Không thể kết nối database"

            }), 500


        cursor = conn.cursor()


        # ====================================================
        # CHECK FIELD
        # ====================================================

        cursor.execute(
            """
            SELECT FieldID

            FROM FootballFields

            WHERE FieldID = ?
            """,
            field_id
        )


        if cursor.fetchone() is None:

            return jsonify({

                "message":
                    "Không tìm thấy sân bóng"

            }), 404


        # ====================================================
        # UPDATE STATUS
        # ====================================================

        cursor.execute(
            """
            UPDATE FootballFields

            SET Status = ?

            WHERE FieldID = ?
            """,

            status,
            field_id
        )


        conn.commit()


        return jsonify({

            "message":
                "Cập nhật trạng thái sân thành công",

            "FieldID":
                field_id,

            "Status":
                status

        }), 200


    except Exception as error:

        print(
            "UPDATE FIELD STATUS ERROR:"
        )

        print(error)


        if conn is not None:
            conn.rollback()


        return jsonify({

            "message":
                "Có lỗi xảy ra khi cập nhật "
                "trạng thái sân"

        }), 500


    finally:

        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# UPDATE ONE PRICE SLOT
#
# PUT /api/fields/price/<price_id>
# ============================================================

@field_bp.route(
    "/price/<int:price_id>",
    methods=["PUT"]
)
def update_field_price(price_id):

    conn = None
    cursor = None


    try:

        data = request.get_json(
            silent=True
        )


        if not data:

            return jsonify({

                "message":
                    "Dữ liệu gửi lên không hợp lệ"

            }), 400


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
        # VALIDATE TIME
        # ====================================================

        time_error = validate_time(
            start_time,
            end_time
        )


        if time_error:

            return jsonify({

                "message":
                    time_error

            }), 400


        # ====================================================
        # VALIDATE PRICE
        # ====================================================

        price, price_error = (
            validate_price(price)
        )


        if price_error:

            return jsonify({

                "message":
                    price_error

            }), 400


        conn = get_connection()


        if conn is None:

            return jsonify({

                "message":
                    "Không thể kết nối database"

            }), 500


        cursor = conn.cursor()


        # ====================================================
        # CHECK PRICE EXISTS
        # ====================================================

        cursor.execute(
            """
            SELECT
                PriceID,
                FieldID

            FROM FieldPrices

            WHERE PriceID = ?
            """,
            price_id
        )


        price_row = (
            cursor.fetchone()
        )


        if price_row is None:

            return jsonify({

                "message":
                    "Không tìm thấy khung giá"

            }), 404


        # ====================================================
        # UPDATE
        # ====================================================

        cursor.execute(
            """
            UPDATE FieldPrices

            SET
                StartTime = ?,
                EndTime = ?,
                Price = ?

            WHERE PriceID = ?
            """,

            start_time,
            end_time,
            price,
            price_id
        )


        conn.commit()


        return jsonify({

            "message":
                "Cập nhật giá sân thành công",

            "PriceID":
                price_id,

            "FieldID":
                price_row.FieldID,

            "StartTime":
                start_time,

            "EndTime":
                end_time,

            "Price":
                price

        }), 200


    except Exception as error:

        print(
            "UPDATE PRICE ERROR:"
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
# BE-05
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
def get_field_availability(field_id):

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
        #
        # Schema:
        # BookingID
        # UserID
        # FieldID
        # BookingDate
        # StartTime
        # EndTime
        # TotalAmount
        # Status
        # CreatedAt
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
# DELETE FIELD
#
# DELETE /api/fields/<field_id>
# ============================================================

@field_bp.route(
    "/<int:field_id>",
    methods=["DELETE"]
)
def delete_field(field_id):

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


        # ====================================================
        # CHECK FIELD EXISTS
        # ====================================================

        cursor.execute(
            """
            SELECT
                FieldID,
                FieldName

            FROM FootballFields

            WHERE FieldID = ?
            """,
            field_id
        )


        field = (
            cursor.fetchone()
        )


        if field is None:

            return jsonify({

                "message":
                    "Không tìm thấy sân bóng"

            }), 404


        field_name = (
            field.FieldName
        )


        # ====================================================
        # DELETE FIELD PRICES
        # ====================================================

        cursor.execute(
            """
            DELETE FROM FieldPrices

            WHERE FieldID = ?
            """,
            field_id
        )


        # ====================================================
        # DELETE FIELD
        # ====================================================

        cursor.execute(
            """
            DELETE FROM FootballFields

            WHERE FieldID = ?
            """,
            field_id
        )


        conn.commit()


        return jsonify({

            "message":
                f"Đã xóa {field_name} thành công",

            "FieldID":
                field_id

        }), 200


    except pyodbc.IntegrityError as error:

        print(
            "DELETE FIELD INTEGRITY ERROR:"
        )

        print(error)


        if conn is not None:
            conn.rollback()


        return jsonify({

            "message":
                "Không thể xóa sân này vì sân "
                "đang được sử dụng trong booking "
                "hoặc dữ liệu liên quan."

        }), 409


    except Exception as error:

        print(
            "DELETE FIELD ERROR:"
        )

        print(error)


        if conn is not None:
            conn.rollback()


        return jsonify({

            "message":
                "Có lỗi xảy ra khi xóa sân bóng"

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

        booking_date = request.args.get("date")


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
        # GET ALL FIELDS
        # ====================================================

        cursor.execute(
            """
            SELECT
                FieldID,
                FieldName,
                FieldType,
                Location,
                Image,
                Status

            FROM FootballFields

            ORDER BY FieldID
            """
        )


        field_rows = cursor.fetchall()


        # ====================================================
        # GET ALL PRICE SLOTS
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
        # GET BOOKINGS BY DATE
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

            WHERE CAST(BookingDate AS DATE) = ?

            ORDER BY
                FieldID,
                StartTime
            """,
            date_object
        )


        booking_rows = cursor.fetchall()


        # ====================================================
        # GROUP PRICES BY FIELD
        # ====================================================

        prices_by_field = {}


        for row in price_rows:

            field_id = row.FieldID


            if field_id not in prices_by_field:

                prices_by_field[field_id] = []


            prices_by_field[field_id].append({

                "PriceID":
                    row.PriceID,

                "FieldID":
                    row.FieldID,

                "StartTime":
                    row.StartTime,

                "EndTime":
                    row.EndTime,

                "Price": (
                    float(row.Price)
                    if row.Price is not None
                    else 0
                )
            })


        # ====================================================
        # GROUP BOOKINGS BY FIELD
        # ====================================================

        bookings_by_field = {}


        for row in booking_rows:

            field_id = row.FieldID


            if field_id not in bookings_by_field:

                bookings_by_field[field_id] = []


            bookings_by_field[field_id].append({

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
        # BUILD RESPONSE
        # ====================================================

        fields = []


        for field in field_rows:

            field_id = field.FieldID


            price_slots = prices_by_field.get(
                field_id,
                []
            )


            bookings = bookings_by_field.get(
                field_id,
                []
            )


            field_available = (
                str(field.Status)
                .strip()
                .upper()
                ==
                "AVAILABLE"
            )


            slots = build_availability_slots(
                price_slots,
                bookings,
                field_available
            )


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


            fields.append({

                "FieldID":
                    field.FieldID,

                "FieldName":
                    field.FieldName,

                "FieldType":
                    field.FieldType,

                "Location":
                    field.Location,

                "Image":
                    field.Image,

                "FieldStatus":
                    field.Status,

                "FieldAvailable":
                    field_available,

                "AvailableCount":
                    available_count,

                "UnavailableCount":
                    unavailable_count,

                "HasAvailableSlot":
                    available_count > 0,

                "Slots":
                    slots
            })


        # ====================================================
        # SUMMARY
        # ====================================================

        available_fields = sum(
            1
            for field in fields
            if field["HasAvailableSlot"]
        )


        unavailable_fields = (
            len(fields)
            -
            available_fields
        )


        # ====================================================
        # RETURN
        # ====================================================

        return jsonify({

            "Date":
                booking_date,

            "TotalFields":
                len(fields),

            "AvailableFields":
                available_fields,

            "UnavailableFields":
                unavailable_fields,

            "Fields":
                fields

        }), 200


    except Exception as error:

        print(
            "GET ALL FIELD AVAILABILITY ERROR:"
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