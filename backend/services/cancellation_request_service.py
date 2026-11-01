
"""UC07 review workflow. No changes to UC06/UC09 tables or financial SUCCESS records."""
from datetime import datetime
from decimal import Decimal
import re
from database import get_connection
from services.payment_service import PaymentError
from services import cancellation_service as rules


def _iso(value):
    return value.isoformat(timespec="seconds") if isinstance(value, datetime) else (str(value) if value is not None else None)


def _read_request(row):
    return {
        "requestId": int(row.RequestID), "bookingId": int(row.BookingID),
        "requestedByUserId": int(row.RequestedByUserID), "reason": row.Reason,
        "status": row.Status, "requestedAt": _iso(row.RequestedAt),
        "reviewedByUserId": row.ReviewedByUserID, "reviewedAt": _iso(row.ReviewedAt),
        "reviewNote": row.ReviewNote,
        "refundAccount": (
            {"bankName": row.RefundBankName,
             "accountNumber": row.RefundAccountNumber,
             "accountHolder": row.RefundAccountHolder}
            if row.RefundBankName else None
        ),
    }


def _validate_note(note, label="Ghi chú"):
    if note is None:
        return ""
    if not isinstance(note, str) or len(note.strip()) > 500:
        raise PaymentError(f"{label} tối đa 500 ký tự", 400, "INVALID_TEXT")
    return note.strip()


def _open():
    conn = get_connection()
    if conn is None:
        raise PaymentError("Không thể kết nối database", 500, "DB_UNAVAILABLE")
    return conn


def _validate_refund_account(value, *, required):
    if value is None and not required:
        return None
    if not isinstance(value, dict):
        raise PaymentError("Vui lòng nhập tài khoản nhận hoàn cọc", 400, "INVALID_REFUND_ACCOUNT")
    account = {}
    for key, label, limit in (
        ("bankName", "Ngân hàng", 100),
        ("accountNumber", "Số tài khoản", 34),
        ("accountHolder", "Tên chủ tài khoản", 100),
    ):
        text = value.get(key)
        if (not isinstance(text, str) or not text.strip() or len(text.strip()) > limit
                or any(ord(char) < 32 for char in text)):
            raise PaymentError(f"{label} không hợp lệ (tối đa {limit} ký tự)", 400, "INVALID_REFUND_ACCOUNT")
        account[key] = text.strip()
    if not re.fullmatch(r"[A-Za-z0-9]{1,34}", account["accountNumber"]):
        raise PaymentError("Số tài khoản chỉ gồm chữ và số, không chứa khoảng trắng", 400, "INVALID_REFUND_ACCOUNT")
    return account


def request_cancellation(user_id, booking_id, reason="", refund_account=None):
    reason = _validate_note(reason, "Lý do hủy")
    conn = _open()
    cur = conn.cursor()
    try:
        cur.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        role = rules._check_actor(cur, user_id)
        if role != "CUSTOMER":
            raise PaymentError("Chỉ CUSTOMER gửi yêu cầu hủy", 403, "FORBIDDEN")
        booking = rules._get_booking(cur, booking_id, lock=True)
        rules._check_ownership(role, user_id, booking)
        deposit, final_paid = rules._payment_summary(cur, booking_id)
        issue = rules._rule_violation(role, booking, rules._booking_now(cur),
                                      final_paid=final_paid or rules._paid_invoice_exists(cur, booking_id))
        if issue:
            raise PaymentError(issue[1], 409, issue[0])
        cur.execute("SELECT RequestID FROM dbo.BookingCancellationRequests WITH (UPDLOCK,HOLDLOCK) WHERE BookingID=? AND Status='PENDING_REVIEW'", booking_id)
        if cur.fetchone():
            raise PaymentError("Đơn đã có yêu cầu chờ duyệt", 409, "REQUEST_ALREADY_PENDING")
        account = _validate_refund_account(refund_account, required=deposit > 0)
        cur.execute("""INSERT INTO dbo.BookingCancellationRequests
                    (BookingID,RequestedByUserID,Reason,RefundBankName,RefundAccountNumber,RefundAccountHolder)
                    OUTPUT INSERTED.RequestID, INSERTED.RequestedAt VALUES (?,?,?,?,?,?)""",
                    booking_id, user_id, reason or None,
                    account["bankName"] if account else None,
                    account["accountNumber"] if account else None,
                    account["accountHolder"] if account else None)
        row = cur.fetchone()
        conn.commit()
        return {"requestId": int(row[0]), "bookingId": booking_id,
                "status": "PENDING_REVIEW", "requestedAt": _iso(row[1]),
                "refundAccount": account,
                "message": "Đã gửi yêu cầu hủy, chờ ADMIN duyệt. Sân vẫn đang được giữ."}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def latest_request(user_id, booking_id):
    conn = _open()
    cur = conn.cursor()
    try:
        role = rules._check_actor(cur, user_id)
        booking = rules._get_booking(cur, booking_id, lock=False)
        rules._check_ownership(role, user_id, booking)
        cur.execute("""SELECT TOP(1) RequestID,BookingID,RequestedByUserID,Reason,Status,
                    RequestedAt,ReviewedByUserID,ReviewedAt,ReviewNote,
                    RefundBankName,RefundAccountNumber,RefundAccountHolder
                    FROM dbo.BookingCancellationRequests WHERE BookingID=?
                    ORDER BY RequestID DESC""", booking_id)
        row = cur.fetchone()
        return _read_request(row) if row else None
    finally:
        cur.close()
        conn.close()


def list_requests(admin_id, status="PENDING_REVIEW"):
    if status not in ("PENDING_REVIEW", "APPROVED", "REJECTED", "ALL"):
        raise PaymentError("Bộ lọc không hợp lệ", 400, "INVALID_STATUS")
    conn = _open()
    cur = conn.cursor()
    try:
        if rules._check_actor(cur, admin_id) != "ADMIN":
            raise PaymentError("Chỉ ADMIN được xem yêu cầu", 403, "FORBIDDEN")
        where = "" if status == "ALL" else "WHERE r.Status=?"
        params = () if status == "ALL" else (status,)
        cur.execute(f"""SELECT r.RequestID,r.BookingID,r.RequestedByUserID,r.Reason,
                  r.Status,r.RequestedAt,r.ReviewedByUserID,r.ReviewedAt,r.ReviewNote,
                  r.RefundBankName,r.RefundAccountNumber,r.RefundAccountHolder,
                  b.Status AS BookingStatus, b.TotalAmount,
                  (SELECT COALESCE(SUM(p.Amount),0) FROM dbo.Payments p
                   WHERE p.BookingID=r.BookingID AND p.PaymentType='DEPOSIT' AND p.Status='SUCCESS') AS DepositPaid,
                  u.FullName AS CustomerName
                  FROM dbo.BookingCancellationRequests r
                  JOIN dbo.Bookings b ON b.BookingID=r.BookingID
                  JOIN dbo.Users u ON u.UserID=r.RequestedByUserID
                  {where} ORDER BY r.RequestedAt DESC, r.RequestID DESC""", *params)
        return [dict(_read_request(row), bookingStatus=row.BookingStatus,
                     customerName=row.CustomerName, totalAmount=float(row.TotalAmount or 0),
                     depositPaid=float(row.DepositPaid or 0))
                for row in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


def review_request(admin_id, request_id, decision, note=""):
    if decision not in ("APPROVED", "REJECTED"):
        raise PaymentError("Quyết định không hợp lệ", 400, "INVALID_DECISION")
    note = _validate_note(note)
    if decision == "REJECTED" and not note:
        raise PaymentError("Phải nhập lý do từ chối", 400, "REVIEW_NOTE_REQUIRED")
    conn = _open()
    cur = conn.cursor()
    try:
        cur.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        if rules._check_actor(cur, admin_id) != "ADMIN":
            raise PaymentError("Chỉ ADMIN được duyệt", 403, "FORBIDDEN")
        # All writers lock Bookings first to avoid lock-order inversion/deadlocks.
        cur.execute("SELECT BookingID FROM dbo.BookingCancellationRequests WHERE RequestID=?", request_id)
        found = cur.fetchone()
        if not found:
            raise PaymentError("Không tìm thấy yêu cầu", 404, "REQUEST_NOT_FOUND")
        booking = rules._get_booking(cur, int(found[0]), lock=True)
        cur.execute("""SELECT RequestID,BookingID,RequestedByUserID,Reason,Status,
                       RequestedAt,ReviewedByUserID,ReviewedAt,ReviewNote
                       FROM dbo.BookingCancellationRequests WITH (UPDLOCK,HOLDLOCK)
                       WHERE RequestID=?""", request_id)
        req = cur.fetchone()
        if not req or req.Status != "PENDING_REVIEW":
            raise PaymentError("Yêu cầu đã được xử lý", 409, "ALREADY_REVIEWED")
        deposit = Decimal("0")
        audit_id = None
        if decision == "APPROVED":
            deposit, final_paid = rules._payment_summary(cur, req.BookingID)
            issue = rules._rule_violation("ADMIN", booking, rules._booking_now(cur),
                                          final_paid=final_paid or rules._paid_invoice_exists(cur, req.BookingID))
            if issue:
                raise PaymentError(issue[1], 409, issue[0])
            cur.execute("""UPDATE dbo.Bookings SET Status='CANCELLED'
                        WHERE BookingID=? AND Status IN ('PENDING','CONFIRMED')""", req.BookingID)
            if cur.rowcount != 1:
                raise PaymentError("Booking đã thay đổi", 409, "BOOKING_CHANGED")
            cur.execute("""UPDATE dbo.Payments SET Status='EXPIRED',UpdatedAt=GETDATE()
                        WHERE BookingID=? AND PaymentType='DEPOSIT' AND Status='PENDING'""", req.BookingID)
            cur.execute("""INSERT INTO dbo.BookingCancellations
                        (BookingID,CanceledByUserID,CanceledByRole,Reason,DepositPaid,RefundStatus)
                        OUTPUT INSERTED.CancellationID
                        VALUES (?,?,'ADMIN',?,?,?)""",
                        req.BookingID, admin_id, req.Reason,
                        deposit, rules._refund_status(deposit))
            audit_id = int(cur.fetchone()[0])
        cur.execute("""UPDATE dbo.BookingCancellationRequests SET Status=?,
                    ReviewedByUserID=?,ReviewedAt=GETDATE(),ReviewNote=?
                    WHERE RequestID=? AND Status='PENDING_REVIEW'""",
                    decision, admin_id, note or None, request_id)
        if cur.rowcount != 1:
            raise PaymentError("Yêu cầu đã đổi trạng thái", 409, "REQUEST_CHANGED")
        conn.commit()
        return {"requestId": request_id, "bookingId": int(req.BookingID),
                "status": decision, "bookingStatus": "CANCELLED" if decision == "APPROVED" else rules._norm(booking.Status),
                "cancellationId": audit_id, "depositPaid": float(deposit),
                "refundStatus": rules._refund_status(deposit) if decision == "APPROVED" else None,
                "message": "Đã duyệt hủy đơn" if decision == "APPROVED" else "Đã từ chối yêu cầu hủy"}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
