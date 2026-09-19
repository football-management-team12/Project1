from flask import Blueprint, jsonify
from database import get_connection
from flask import request

field_bp = Blueprint(
    "field",
    __name__
)


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


    fields=[]


    for row in rows:

        fields.append({

            "FieldID": row.FieldID,
            "FieldName": row.FieldName,
            "FieldType": row.FieldType,
            "Location": row.Location,
            "Image": row.Image,
            "Status": row.Status,

            "StartTime": str(row.StartTime),
            "EndTime": str(row.EndTime),
            "Price": row.Price

        })


    return jsonify(fields)


@field_bp.route("/price/<int:field_id>", methods=["PUT"])
def update_field_price(field_id):

    data = request.json


    start_time = data.get("StartTime")
    end_time = data.get("EndTime")
    price = data.get("Price")


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

        "message":"Update price successfully"

    })