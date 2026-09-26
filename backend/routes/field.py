from datetime import datetime

import pyodbc
from flask import Blueprint, jsonify, request

from database import get_connection


field_bp = Blueprint("field", __name__)


ALLOWED_STATUS = [
    "AVAILABLE",
    "MAINTENANCE"
]


# ============================================================
# HELPERS
# ============================================================

def validate_time(start_time, end_time):

    if not start_time:
        return "Giờ bắt đầu không được để trống"

    if not end_time:
        return "Giờ kết thúc không được để trống"

    try:

        start_object = datetime.strptime(
            start_time[:5],
            "%H:%M"
        )

        end_object = datetime.strptime(
            end_time[:5],
            "%H:%M"
        )

    except ValueError:

        return "Định dạng giờ không hợp lệ"

    if start_object >= end_object:
        return "Giờ kết thúc phải lớn hơn giờ bắt đầu"

    return None


def validate_price(price):

    try:
        price = float(price)

    except (TypeError, ValueError):
        return None, "Giá sân không hợp lệ"

    if price < 0:
        return None, "Giá sân không được nhỏ hơn 0"

    return price, None


# ============================================================
# GET ALL FIELDS
# GET /api/fields/
# ============================================================

@field_bp.route("/", methods=["GET"])
def get_fields():

    conn = None
    cursor = None

    try:

        conn = get_connection()

        if conn is None:
            return jsonify({
                "message": "Không thể kết nối database"
            }), 500

        cursor = conn.cursor()

        cursor.execute("""
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
        """)

        rows = cursor.fetchall()

        fields = []

        for row in rows:

            fields.append({

                "FieldID": row.FieldID,

                "FieldName": row.FieldName,

                "FieldType": row.FieldType,

                "Location": row.Location,

                "Image": row.Image,

                "Status": row.Status,

                "PriceID": row.PriceID,

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

        return jsonify(fields), 200


    except Exception as error:

        print("GET FIELDS ERROR:")
        print(error)

        return jsonify({
            "message": "Không thể lấy danh sách sân bóng"
        }), 500


    finally:

        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# GET ONE FIELD
# GET /api/fields/<field_id>
# ============================================================

@field_bp.route("/<int:field_id>", methods=["GET"])
def get_field_detail(field_id):

    conn = None
    cursor = None

    try:

        conn = get_connection()

        if conn is None:
            return jsonify({
                "message": "Không thể kết nối database"
            }), 500

        cursor = conn.cursor()

        cursor.execute("""
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

            ORDER BY P.StartTime
        """, field_id)

        rows = cursor.fetchall()

        if not rows:

            return jsonify({
                "message": "Không tìm thấy sân bóng"
            }), 404

        first_row = rows[0]

        prices = []

        for row in rows:

            if row.PriceID is not None:

                prices.append({

                    "PriceID": row.PriceID,

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

        return jsonify({

            "FieldID": first_row.FieldID,

            "FieldName": first_row.FieldName,

            "FieldType": first_row.FieldType,

            "Location": first_row.Location,

            "Image": first_row.Image,

            "Status": first_row.Status,

            "Prices": prices

        }), 200


    except Exception as error:

        print("GET FIELD DETAIL ERROR:")
        print(error)

        return jsonify({
            "message": "Có lỗi xảy ra khi lấy thông tin sân"
        }), 500


    finally:

        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# CREATE FIELD
# POST /api/fields/
# ============================================================

@field_bp.route("/", methods=["POST"])
def create_field():

    conn = None
    cursor = None

    try:

        data = request.get_json()

        if not data:

            return jsonify({
                "message": "Dữ liệu gửi lên không hợp lệ"
            }), 400


        field_name = data.get("FieldName")
        field_type = data.get("FieldType")
        location = data.get("Location")
        image = data.get("Image")
        status = data.get("Status", "AVAILABLE")

        start_time = data.get("StartTime")
        end_time = data.get("EndTime")
        price = data.get("Price")


        # VALIDATE FIELD

        if not field_name or not field_name.strip():

            return jsonify({
                "message": "Tên sân không được để trống"
            }), 400


        if not field_type:

            return jsonify({
                "message": "Loại sân không được để trống"
            }), 400


        if not location or not location.strip():

            return jsonify({
                "message": "Địa điểm không được để trống"
            }), 400


        if status not in ALLOWED_STATUS:

            return jsonify({
                "message": "Trạng thái sân không hợp lệ"
            }), 400


        time_error = validate_time(
            start_time,
            end_time
        )

        if time_error:

            return jsonify({
                "message": time_error
            }), 400


        price, price_error = validate_price(price)

        if price_error:

            return jsonify({
                "message": price_error
            }), 400


        # DATABASE

        conn = get_connection()

        if conn is None:

            return jsonify({
                "message": "Không thể kết nối database"
            }), 500


        cursor = conn.cursor()


        # CHECK DUPLICATE NAME

        cursor.execute("""
            SELECT FieldID
            FROM FootballFields
            WHERE LOWER(FieldName) = LOWER(?)
        """, field_name.strip())


        if cursor.fetchone() is not None:

            return jsonify({
                "message": "Tên sân đã tồn tại"
            }), 409


        # INSERT FIELD

        cursor.execute("""
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


        new_field_id = cursor.fetchone()[0]


        # INSERT INITIAL PRICE

        cursor.execute("""
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

            "message": "Thêm sân mới thành công",

            "FieldID": new_field_id

        }), 201


    except Exception as error:

        print("CREATE FIELD ERROR:")
        print(error)

        if conn is not None:
            conn.rollback()

        return jsonify({
            "message": "Có lỗi xảy ra khi thêm sân"
        }), 500


    finally:

        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# UPDATE FIELD INFORMATION
# PUT /api/fields/<field_id>
# ============================================================

@field_bp.route("/<int:field_id>", methods=["PUT"])
def update_field(field_id):

    conn = None
    cursor = None

    try:

        data = request.get_json()

        if not data:

            return jsonify({
                "message": "Dữ liệu gửi lên không hợp lệ"
            }), 400


        field_name = data.get("FieldName")
        field_type = data.get("FieldType")
        location = data.get("Location")
        image = data.get("Image")


        if not field_name or not field_name.strip():

            return jsonify({
                "message": "Tên sân không được để trống"
            }), 400


        if not field_type:

            return jsonify({
                "message": "Loại sân không được để trống"
            }), 400


        if not location or not location.strip():

            return jsonify({
                "message": "Địa điểm không được để trống"
            }), 400


        conn = get_connection()

        if conn is None:

            return jsonify({
                "message": "Không thể kết nối database"
            }), 500


        cursor = conn.cursor()


        # CHECK FIELD EXISTS

        cursor.execute("""
            SELECT FieldID
            FROM FootballFields
            WHERE FieldID = ?
        """, field_id)


        if cursor.fetchone() is None:

            return jsonify({
                "message": "Không tìm thấy sân bóng"
            }), 404


        # CHECK DUPLICATE NAME

        cursor.execute("""
            SELECT FieldID
            FROM FootballFields

            WHERE LOWER(FieldName) = LOWER(?)
            AND FieldID <> ?
        """,
            field_name.strip(),
            field_id
        )


        if cursor.fetchone() is not None:

            return jsonify({
                "message": "Tên sân đã tồn tại"
            }), 409


        # UPDATE

        cursor.execute("""
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

            "message": "Cập nhật thông tin sân thành công",

            "FieldID": field_id

        }), 200


    except Exception as error:

        print("UPDATE FIELD ERROR:")
        print(error)

        if conn is not None:
            conn.rollback()

        return jsonify({
            "message": "Có lỗi xảy ra khi cập nhật sân"
        }), 500


    finally:

        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# UPDATE FIELD STATUS
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

        data = request.get_json()

        if not data:

            return jsonify({
                "message": "Dữ liệu gửi lên không hợp lệ"
            }), 400


        status = data.get("Status")


        if status not in ALLOWED_STATUS:

            return jsonify({
                "message": "Trạng thái sân không hợp lệ"
            }), 400


        conn = get_connection()

        if conn is None:

            return jsonify({
                "message": "Không thể kết nối database"
            }), 500


        cursor = conn.cursor()


        cursor.execute("""
            SELECT FieldID
            FROM FootballFields
            WHERE FieldID = ?
        """, field_id)


        if cursor.fetchone() is None:

            return jsonify({
                "message": "Không tìm thấy sân bóng"
            }), 404


        cursor.execute("""
            UPDATE FootballFields

            SET Status = ?

            WHERE FieldID = ?
        """,
            status,
            field_id
        )


        conn.commit()


        return jsonify({

            "message": "Cập nhật trạng thái sân thành công",

            "FieldID": field_id,

            "Status": status

        }), 200


    except Exception as error:

        print("UPDATE FIELD STATUS ERROR:")
        print(error)

        if conn is not None:
            conn.rollback()

        return jsonify({
            "message":
                "Có lỗi xảy ra khi cập nhật trạng thái sân"
        }), 500


    finally:

        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


# ============================================================
# UPDATE ONE PRICE SLOT
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

        data = request.get_json()

        if not data:

            return jsonify({
                "message": "Dữ liệu gửi lên không hợp lệ"
            }), 400


        start_time = data.get("StartTime")
        end_time = data.get("EndTime")
        price = data.get("Price")


        time_error = validate_time(
            start_time,
            end_time
        )

        if time_error:

            return jsonify({
                "message": time_error
            }), 400


        price, price_error = validate_price(price)

        if price_error:

            return jsonify({
                "message": price_error
            }), 400


        conn = get_connection()

        if conn is None:

            return jsonify({
                "message": "Không thể kết nối database"
            }), 500


        cursor = conn.cursor()


        cursor.execute("""
            SELECT
                PriceID,
                FieldID

            FROM FieldPrices

            WHERE PriceID = ?
        """, price_id)


        price_row = cursor.fetchone()


        if price_row is None:

            return jsonify({
                "message": "Không tìm thấy khung giá"
            }), 404


        cursor.execute("""
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

        print("UPDATE PRICE ERROR:")
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
# DELETE FIELD
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
                "message": "Không thể kết nối database"
            }), 500


        cursor = conn.cursor()


        # CHECK FIELD EXISTS

        cursor.execute("""
            SELECT
                FieldID,
                FieldName

            FROM FootballFields

            WHERE FieldID = ?
        """, field_id)


        field = cursor.fetchone()


        if field is None:

            return jsonify({
                "message": "Không tìm thấy sân bóng"
            }), 404


        field_name = field.FieldName


        # DELETE PRICES FIRST

        cursor.execute("""
            DELETE FROM FieldPrices
            WHERE FieldID = ?
        """, field_id)


        # DELETE FIELD

        cursor.execute("""
            DELETE FROM FootballFields
            WHERE FieldID = ?
        """, field_id)


        conn.commit()


        return jsonify({

            "message":
                f"Đã xóa {field_name} thành công",

            "FieldID":
                field_id

        }), 200


    except pyodbc.IntegrityError as error:

        print("DELETE FIELD INTEGRITY ERROR:")
        print(error)

        if conn is not None:
            conn.rollback()

        return jsonify({

            "message":
                "Không thể xóa sân vì sân đang "
                "được sử dụng trong booking hoặc "
                "dữ liệu liên quan."

        }), 409


    except Exception as error:

        print("DELETE FIELD ERROR:")
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