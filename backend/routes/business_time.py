from flask import Blueprint, jsonify
from services.business_time import business_now

business_time_bp = Blueprint("business_time", __name__)


@business_time_bp.get("/time")
def current_time():
    now = business_now()
    response = jsonify(
        serverTimeMs=int(now.timestamp() * 1000),
        serverTime=now.isoformat(),
        timeZone="Asia/Ho_Chi_Minh",
    )
    response.headers["Cache-Control"] = "no-store"
    return response
