from flask import Blueprint, jsonify
from services.field_service import get_all_fields

fields = Blueprint("fields", __name__)

@fields.route("/fields", methods=["GET"])
def get_fields():
    try:
        data = get_all_fields()

        return jsonify({
            "success": True,
            "data": data
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500