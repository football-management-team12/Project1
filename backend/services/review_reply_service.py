"""ADMIN review inbox and a single editable reply per review."""
from datetime import timezone

from database import get_connection
from services.payment_service import PaymentError


def _iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")


def _reply(row):
    return {"comment":row.Comment,"createdAt":_iso(row.CreatedAt),"updatedAt":_iso(row.UpdatedAt)}


def replies_for(cursor, review_ids):
    """Keep customer UC10 functional before optional migration 012 is applied."""
    if not review_ids:
        return {}
    cursor.execute("SELECT OBJECT_ID(N'dbo.BookingReviewReplies',N'U')")
    if cursor.fetchone()[0] is None:
        return {}
    placeholders=",".join("?" for _ in review_ids)
    cursor.execute(f"SELECT ReviewID,Comment,CreatedAt,UpdatedAt FROM dbo.BookingReviewReplies WHERE ReviewID IN ({placeholders})",*review_ids)
    return {int(row.ReviewID):_reply(row) for row in cursor.fetchall()}


def _connection():
    conn=get_connection()
    if conn is None:
        raise PaymentError("Không thể kết nối database",503,"DB_UNAVAILABLE")
    return conn


def _admin(cursor,user_id):
    cursor.execute("SELECT Role,Status FROM dbo.Users WHERE UserID=?",user_id)
    row=cursor.fetchone()
    if row is None or str(row.Status).strip().upper()!="ACTIVE":
        raise PaymentError("Tài khoản không hoạt động",403,"ACCOUNT_INACTIVE")
    if str(row.Role).strip().upper()!="ADMIN":
        raise PaymentError("Chỉ quản trị viên được phản hồi",403,"FORBIDDEN")


def list_admin_reviews(user_id,page,page_size,status,rating):
    conn=_connection();cursor=None
    try:
        cursor=conn.cursor();_admin(cursor,user_id)
        # Referencing the reply table makes missing migration 012 explicit on admin APIs.
        cursor.execute("""SELECT COUNT(*),COALESCE(SUM(CASE WHEN A.ReviewID IS NULL THEN 1 ELSE 0 END),0)
            FROM dbo.BookingReviews R LEFT JOIN dbo.BookingReviewReplies A ON A.ReviewID=R.ReviewID""")
        total_all,unanswered=cursor.fetchone()
        where=" WHERE 1=1";args=[]
        if status=="unanswered": where+=" AND A.ReviewID IS NULL"
        elif status=="answered": where+=" AND A.ReviewID IS NOT NULL"
        if rating is not None: where+=" AND R.Rating=?";args.append(rating)
        joins="""FROM dbo.BookingReviews R JOIN dbo.Bookings B ON B.BookingID=R.BookingID
            JOIN dbo.Users U ON U.UserID=R.UserID JOIN dbo.FootballFields F ON F.FieldID=R.FieldID
            LEFT JOIN dbo.BookingReviewReplies A ON A.ReviewID=R.ReviewID"""
        cursor.execute("SELECT COUNT(*) "+joins+where,*args)
        count=int(cursor.fetchone()[0])
        cursor.execute("""SELECT R.ReviewID,R.BookingID,R.FieldID,R.Rating,R.Comment,R.CreatedAt,
            U.FullName,F.FieldName,A.Comment AS ReplyComment,A.CreatedAt AS ReplyCreatedAt,A.UpdatedAt AS ReplyUpdatedAt """
            +joins+where+" ORDER BY R.CreatedAt DESC,R.ReviewID DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
            *args,(page-1)*page_size,page_size)
        items=[]
        for row in cursor.fetchall():
            items.append({"reviewId":int(row.ReviewID),"bookingId":int(row.BookingID),"fieldId":int(row.FieldID),
                          "fieldName":row.FieldName,"customerName":row.FullName,"rating":int(row.Rating),
                          "comment":row.Comment,"createdAt":_iso(row.CreatedAt),
                          "reply":None if row.ReplyComment is None else {"comment":row.ReplyComment,
                              "createdAt":_iso(row.ReplyCreatedAt),"updatedAt":_iso(row.ReplyUpdatedAt)}})
        return {"items":items,"total":count,"page":page,"pageSize":page_size,
                "totalPages":(count+page_size-1)//page_size,"totalReviews":int(total_all),"unansweredCount":int(unanswered)}
    finally:
        if cursor is not None: cursor.close()
        conn.close()


def save_reply(user_id,review_id,payload):
    # Share exactly the same Unicode/length rules as customer comments.
    from services.review_service import validate_review
    if not isinstance(payload,dict):
        raise PaymentError("Body phải là JSON object",400,"INVALID_BODY")
    _,comment=validate_review({"rating":1,"comment":payload.get("comment")})
    conn=_connection();cursor=None
    try:
        cursor=conn.cursor();cursor.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        _admin(cursor,user_id)
        cursor.execute("SELECT ReviewID FROM dbo.BookingReviews WITH (UPDLOCK,HOLDLOCK) WHERE ReviewID=?",review_id)
        if cursor.fetchone() is None:
            raise PaymentError("Không tìm thấy đánh giá",404,"REVIEW_NOT_FOUND")
        cursor.execute("SELECT ReviewID FROM dbo.BookingReviewReplies WHERE ReviewID=?",review_id)
        if cursor.fetchone() is None:
            cursor.execute("""INSERT dbo.BookingReviewReplies (ReviewID,AdminUserID,Comment)
                VALUES (?,?,?)""",review_id,user_id,comment)
        else:
            cursor.execute("""UPDATE dbo.BookingReviewReplies SET Comment=?,AdminUserID=?,UpdatedAt=SYSUTCDATETIME()
                WHERE ReviewID=?""",comment,user_id,review_id)
        cursor.execute("SELECT Comment,CreatedAt,UpdatedAt FROM dbo.BookingReviewReplies WHERE ReviewID=?",review_id)
        result={"reviewId":review_id,"reply":_reply(cursor.fetchone())}
        conn.commit();return result
    except Exception:
        conn.rollback();raise
    finally:
        if cursor is not None: cursor.close()
        conn.close()
