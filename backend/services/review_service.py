"""UC10: one review per completed booking, independently of payment balance."""
from datetime import timezone

import pyodbc

from database import get_connection
from services.payment_service import PaymentError


MAX_COMMENT_LENGTH = 1000


def validate_review(payload):
    if not isinstance(payload, dict):
        raise PaymentError("Body phải là JSON object", 400, "INVALID_BODY")
    rating = payload.get("rating")
    if type(rating) is not int or not 1 <= rating <= 5:
        raise PaymentError("Điểm đánh giá phải là số nguyên từ 1 đến 5", 400, "INVALID_RATING")
    comment = payload.get("comment")
    if not isinstance(comment, str) or not comment.strip():
        raise PaymentError("Vui lòng nhập nhận xét", 400, "INVALID_COMMENT")
    comment = comment.strip()
    # NVARCHAR lengths are measured in UTF-16 code units, including emoji.
    try:
        units = len(comment.encode("utf-16-le")) // 2
    except UnicodeEncodeError as error:
        raise PaymentError("Nhận xét chứa ký tự không hợp lệ", 400, "INVALID_COMMENT") from error
    if units > MAX_COMMENT_LENGTH:
        raise PaymentError("Nhận xét tối đa 1.000 ký tự", 400, "INVALID_COMMENT")
    if any(ord(char) < 32 and char not in "\n\r\t" for char in comment):
        raise PaymentError("Nhận xét chứa ký tự không hợp lệ", 400, "INVALID_COMMENT")
    return rating, comment


def _connection():
    conn = get_connection()
    if conn is None:
        raise PaymentError("Không thể kết nối database", 503, "DB_UNAVAILABLE")
    return conn


def _customer(cursor, user_id):
    cursor.execute("SELECT Role,Status FROM dbo.Users WHERE UserID=?", user_id)
    row = cursor.fetchone()
    if row is None or str(row.Status).strip().upper() != "ACTIVE":
        raise PaymentError("Tài khoản không hoạt động", 403, "ACCOUNT_INACTIVE")
    if str(row.Role).strip().upper() != "CUSTOMER":
        raise PaymentError("Chỉ khách hàng được đánh giá", 403, "FORBIDDEN")


def _booking(cursor, user_id, booking_id, lock=False):
    hint = "WITH (UPDLOCK,HOLDLOCK)" if lock else ""
    cursor.execute(f"SELECT BookingID,UserID,FieldID,Status FROM dbo.Bookings {hint} WHERE BookingID=?", booking_id)
    row = cursor.fetchone()
    if row is None:
        raise PaymentError("Không tìm thấy đơn đặt sân", 404, "BOOKING_NOT_FOUND")
    if int(row.UserID) != int(user_id):
        raise PaymentError("Bạn chỉ được đánh giá đơn của mình", 403, "BOOKING_NOT_OWNED")
    return row


def _serialize(row):
    created = row.CreatedAt
    if created is not None and hasattr(created, "isoformat"):
        created = created.replace(tzinfo=timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    return {"reviewId": int(row.ReviewID), "bookingId": int(row.BookingID),
            "fieldId": int(row.FieldID), "rating": int(row.Rating),
            "comment": row.Comment, "createdAt": created}


def _existing(cursor, booking_id):
    cursor.execute("""SELECT ReviewID,BookingID,FieldID,Rating,Comment,CreatedAt
        FROM dbo.BookingReviews WHERE BookingID=?""", booking_id)
    return cursor.fetchone()


def create_review(user_id, booking_id, payload):
    rating, comment = validate_review(payload)
    conn = _connection()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        _customer(cursor, user_id)
        booking = _booking(cursor, user_id, booking_id, lock=True)
        if str(booking.Status).strip().upper() != "COMPLETED":
            raise PaymentError("Chỉ được đánh giá đơn đã hoàn thành", 409, "BOOKING_NOT_COMPLETED")
        if _existing(cursor, booking_id) is not None:
            raise PaymentError("Đơn này đã được đánh giá", 409, "REVIEW_ALREADY_EXISTS")
        cursor.execute("""INSERT INTO dbo.BookingReviews (BookingID,UserID,FieldID,Rating,Comment)
            OUTPUT INSERTED.ReviewID,INSERTED.BookingID,INSERTED.FieldID,
                   INSERTED.Rating,INSERTED.Comment,INSERTED.CreatedAt
            VALUES (?,?,?,?,?)""", booking.BookingID, booking.UserID, booking.FieldID, rating, comment)
        result = _serialize(cursor.fetchone())
        conn.commit()
        return result
    except pyodbc.IntegrityError as error:
        conn.rollback()
        if any(code in str(error) for code in ("2601", "2627", "UQ_BookingReviews_Booking")):
            raise PaymentError("Đơn này đã được đánh giá", 409, "REVIEW_ALREADY_EXISTS") from error
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        if cursor is not None:
            cursor.close()
        conn.close()


def get_booking_review(user_id, booking_id):
    conn = _connection()
    cursor = None
    try:
        cursor = conn.cursor()
        _customer(cursor, user_id)
        booking = _booking(cursor, user_id, booking_id)
        row = _existing(cursor, booking_id)
        completed = str(booking.Status).strip().upper() == "COMPLETED"
        return {"bookingId": int(booking.BookingID), "fieldId": int(booking.FieldID),
                "canReview": completed and row is None,
                "reason": "REVIEW_ALREADY_EXISTS" if row is not None else None if completed else "BOOKING_NOT_COMPLETED",
                "review": _serialize(row) if row is not None else None}
    finally:
        if cursor is not None:
            cursor.close()
        conn.close()


def list_field_reviews(field_id, page, page_size):
    conn = _connection()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT FieldID,FieldName FROM dbo.FootballFields WHERE FieldID=? AND IsArchived=0", field_id)
        field = cursor.fetchone()
        if field is None:
            raise PaymentError("Không tìm thấy sân bóng", 404, "FIELD_NOT_FOUND")
        eligible = """FROM dbo.BookingReviews R JOIN dbo.Bookings B ON B.BookingID=R.BookingID
            AND B.UserID=R.UserID AND B.FieldID=R.FieldID
            WHERE R.FieldID=? AND B.Status='COMPLETED'"""
        cursor.execute("SELECT COUNT(*),AVG(CAST(R.Rating AS DECIMAL(8,2))) " + eligible, field_id)
        count, average = cursor.fetchone()
        cursor.execute("""SELECT R.ReviewID,R.Rating,R.Comment,R.CreatedAt """ + eligible + """
            ORDER BY R.CreatedAt DESC,R.ReviewID DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY""",
            field_id, (page-1)*page_size, page_size)
        items = []
        for row in cursor.fetchall():
            created = row.CreatedAt.replace(tzinfo=timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
            items.append({"reviewId":int(row.ReviewID), "fieldId":field_id, "rating":int(row.Rating),
                          "comment":row.Comment, "createdAt":created, "reviewerName":"Khách đã đặt sân"})
        return {"fieldId":field_id, "fieldName":field.FieldName, "page":page, "pageSize":page_size,
                "total":int(count), "totalPages":(int(count)+page_size-1)//page_size,
                "averageRating":round(float(average),2) if average is not None else None, "items":items}
    finally:
        if cursor is not None:
            cursor.close()
        conn.close()
