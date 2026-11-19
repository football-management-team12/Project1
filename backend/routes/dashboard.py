"""Read-only daily schedule for the management dashboard."""

from flask import Blueprint, current_app, jsonify, request

from database import get_connection
from services.business_time import business_now
from services.jwt_service import current_user_id, jwt_required, role_required
from services.payment_service import PaymentError
from datetime import date


dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/management/dashboard/schedule")
@jwt_required
@role_required("ADMIN", "STAFF")
def daily_schedule():
    day = request.args.get("date", business_now().date().isoformat())
    try:
        if date.fromisoformat(day).isoformat() != day:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify(message="Ngày không hợp lệ"), 400

    conn = None
    cursor = None
    try:
        conn = get_connection()
        if conn is None:
            raise PaymentError("Không kết nối được dữ liệu", 503, "DB_UNAVAILABLE")
        cursor = conn.cursor()
        cursor.execute(
            "SELECT Role, Status FROM dbo.Users WHERE UserID=?",
            current_user_id(),
        )
        actor = cursor.fetchone()
        if not actor or str(actor.Status).strip().upper() != "ACTIVE":
            raise PaymentError("Tài khoản không hoạt động", 403, "ACCOUNT_INACTIVE")
        if str(actor.Role).strip().upper() not in {"ADMIN", "STAFF"}:
            raise PaymentError("Không đủ quyền", 403, "FORBIDDEN")

        cursor.execute(
            "SELECT COUNT_BIG(*) FROM dbo.Bookings WHERE BookingDate=?", day
        )
        total = int(cursor.fetchone()[0])
        cursor.execute(
            """
            SELECT TOP (7) B.BookingID, B.BookingDate, B.StartTime,
                B.EndTime, B.Status, F.FieldName, U.FullName, U.Phone
            FROM dbo.Bookings B
            LEFT JOIN dbo.FootballFields F ON F.FieldID=B.FieldID
            LEFT JOIN dbo.Users U ON U.UserID=B.UserID
            WHERE B.BookingDate=?
            ORDER BY B.StartTime, B.EndTime, B.BookingID
            """,
            day,
        )
        items = [
            {
                "bookingId": int(row.BookingID),
                "date": str(row.BookingDate),
                "startTime": str(row.StartTime)[:5],
                "endTime": str(row.EndTime)[:5],
                "status": row.Status,
                "fieldName": row.FieldName,
                "customerName": row.FullName,
                "phone": row.Phone,
            }
            for row in cursor.fetchall()
        ]
        response = jsonify(date=day, total=total, items=items)
        response.headers["Cache-Control"] = "no-store"
        return response
    except PaymentError as error:
        return jsonify(message=error.message, code=error.code), error.status_code
    except Exception:
        current_app.logger.exception("Dashboard schedule failed")
        return jsonify(message="Không tải được lịch đặt sân"), 503
    finally:
        if conn is not None:
            try:
                conn.rollback()
            finally:
                if cursor is not None:
                    cursor.close()
                conn.close()
