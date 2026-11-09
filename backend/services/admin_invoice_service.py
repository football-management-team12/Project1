"""UC12 administration; all financial writes remain exclusively in UC06/07/09."""
from datetime import date, timedelta

from services.invoice_cash_service import _booking, _connection, _current_role, _summary
from services.payment_service import PaymentError


def _admin(cursor, user_id):
    if _current_role(cursor, user_id) != "ADMIN":
        raise PaymentError("Chỉ ADMIN được quản lý hóa đơn", 403, "FORBIDDEN")


def _iso(value):
    return value.isoformat() if value is not None else None


def _filters(params):
    allowed = {"status", "customer", "from", "to", "page", "pageSize"}
    if set(params) - allowed or any(len(params.getlist(k)) != 1 for k in params):
        raise PaymentError("Tham số lọc không hợp lệ", 400, "INVALID_FILTER")
    status = params.get("status", "").strip().upper()
    if status not in {"", "ACTIVE", "CANCELLED", "UNPAID", "PARTIALLY_PAID", "PAID"}:
        raise PaymentError("Trạng thái không hợp lệ", 400, "INVALID_FILTER")
    customer = params.get("customer", "").strip()
    if len(customer) > 100:
        raise PaymentError("Từ khóa khách hàng quá dài", 400, "INVALID_FILTER")
    dates = {}
    try:
        for key in ("from", "to"):
            raw = params.get(key, "")
            if raw:
                dates[key] = date.fromisoformat(raw)
                if dates[key].isoformat() != raw:
                    raise ValueError()
        if dates.get("from", date.min) > dates.get("to", date.max):
            raise ValueError()
        # The inclusive end date is implemented using an exclusive next day.
        if dates.get("to") == date.max:
            raise ValueError()
        page = int(params.get("page", "1"))
        size = int(params.get("pageSize", "20"))
        if page < 1 or page > 100000 or not 1 <= size <= 100:
            raise ValueError()
    except (ValueError, TypeError):
        raise PaymentError("Ngày hoặc phân trang không hợp lệ", 400, "INVALID_FILTER")
    return status, customer, dates, page, size


_SELECT = """
    SELECT B.BookingID, B.UserID, B.TotalAmount, B.Status,
           B.BookingDate, B.StartTime, B.EndTime,
           I.InvoiceID, I.Amount AS InvoiceAmount, I.PaidAmount AS InvoicePaidAmount,
           I.PaymentStatus AS InvoicePaymentStatus, I.CreatedDate,
           U.FullName, U.Email, F.FieldName, F.Location,
           C.CancelledBy, C.CancelledAt, C.Reason
    FROM dbo.Invoices I
    JOIN dbo.Bookings B ON B.BookingID = I.BookingID
    JOIN dbo.Users U ON U.UserID = B.UserID
    LEFT JOIN dbo.FootballFields F ON F.FieldID = B.FieldID
    LEFT JOIN dbo.InvoiceAdminCancellations C ON C.InvoiceID = I.InvoiceID
"""


def _serialize(cursor, row):
    info = _summary(cursor, row)
    cancelled = row.CancelledAt is not None
    info.update({
        "paymentStatus": info["status"],
        "status": "CANCELLED" if cancelled else info["status"],
        "invoiceStatus": "CANCELLED" if cancelled else "ACTIVE",
        "customer": {"userId": row.UserID, "name": row.FullName, "email": row.Email},
        "field": {"name": row.FieldName, "location": row.Location},
        "createdDate": _iso(row.CreatedDate),
        "bookingDate": _iso(row.BookingDate),
        "startTime": str(row.StartTime)[:5], "endTime": str(row.EndTime)[:5],
        "canCancel": (not cancelled and info["bookingStatus"] == "CANCELLED" and info["paidAmount"] == 0
                      and str(row.InvoicePaymentStatus or "").strip().upper() != "PAID"),
        "cancellation": ({"by": row.CancelledBy, "at": _iso(row.CancelledAt), "reason": row.Reason}
                         if cancelled else None),
    })
    info["allowedTransitions"] = ["CANCELLED"] if info["canCancel"] else []
    return info


def list_invoices(user_id, params):
    status, customer, dates, page, size = _filters(params)
    conn = _connection()
    cur = conn.cursor()
    try:
        _admin(cur, user_id)
        where, args = ["1=1"], []
        if status == "CANCELLED":
            where.append("C.InvoiceID IS NOT NULL")
        elif status:
            where.append("C.InvoiceID IS NULL")
            if status != "ACTIVE":
                # Same SUCCESS DEPOSIT/FINAL_PAYMENT/EXTRA receipts as UC09.
                paid = """(SELECT COALESCE(SUM(P.Amount),0) FROM dbo.Payments P
                           WHERE P.BookingID=B.BookingID AND P.Status='SUCCESS'
                           AND P.PaymentType IN ('DEPOSIT','FINAL_PAYMENT','EXTRA'))"""
                where.append({"UNPAID": f"{paid}=0", "PAID": f"{paid}=B.TotalAmount",
                              "PARTIALLY_PAID": f"{paid}>0 AND {paid}<B.TotalAmount"}[status])
        if customer:
            escaped = customer.replace("~", "~~").replace("%", "~%").replace("_", "~_").replace("[", "~[")
            where.append("(U.FullName LIKE ? ESCAPE '~' OR U.Email LIKE ? ESCAPE '~')")
            args.extend([f"%{escaped}%"] * 2)
        if "from" in dates:
            where.append("I.CreatedDate >= ?")
            args.append(dates["from"])
        if "to" in dates:
            where.append("I.CreatedDate < ?")
            args.append(dates["to"] + timedelta(days=1))
        query = _SELECT + " WHERE " + " AND ".join(where)
        # Fetch one extra row to avoid a separate, potentially inconsistent count query.
        cur.execute(query + " ORDER BY I.CreatedDate DESC, I.InvoiceID DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
                    *args, (page - 1) * size, size + 1)
        rows = cur.fetchall()
        return {"items": [_serialize(cur, row) for row in rows[:size]],
                "page": page, "pageSize": size, "hasNext": len(rows) > size}
    finally:
        cur.close()
        conn.close()


def invoice_detail(user_id, invoice_id):
    conn = _connection()
    cur = conn.cursor()
    try:
        _admin(cur, user_id)
        cur.execute(_SELECT + " WHERE I.InvoiceID = ?", invoice_id)
        row = cur.fetchone()
        if row is None:
            raise PaymentError("Không tìm thấy hóa đơn", 404, "INVOICE_NOT_FOUND")
        info = _serialize(cur, row)
        # Deposits may not have an InvoiceID until UC09 links them; include by booking.
        cur.execute("""SELECT PaymentID, PaymentType, Amount, Status,
                              COALESCE(PaymentMethod, Method) AS Method,
                              Reference, COALESCE(PaymentDate, CreatedAt) AS RecordedAt
                       FROM dbo.Payments WHERE BookingID = ? OR InvoiceID = ?
                       ORDER BY PaymentID DESC""", row.BookingID, invoice_id)
        info["payments"] = [{"paymentId": p.PaymentID, "type": p.PaymentType,
                             "amount": float(p.Amount or 0), "status": p.Status,
                             "method": p.Method, "reference": p.Reference,
                             "recordedAt": _iso(p.RecordedAt)} for p in cur.fetchall()]
        cur.execute("SELECT Amount, ConfirmedAt FROM dbo.BookingDepositRefunds WHERE BookingID = ?", row.BookingID)
        refund = cur.fetchone()
        info["refund"] = {"amount": float(refund.Amount), "at": _iso(refund.ConfirmedAt)} if refund else None
        return info
    finally:
        cur.close()
        conn.close()


def cancel_invoice(user_id, invoice_id, payload):
    if (not isinstance(payload, dict) or set(payload) - {"status", "reason"}
            or payload.get("status") != "CANCELLED"):
        raise PaymentError("Chỉ hỗ trợ chuyển sang CANCELLED; không được sửa số tiền", 400, "INVALID_TRANSITION")
    reason = payload.get("reason", "")
    if not isinstance(reason, str) or not 1 <= len(reason.strip()) <= 500:
        raise PaymentError("Nhập lý do hủy từ 1 đến 500 ký tự", 400, "REASON_REQUIRED")
    conn = _connection()
    cur = conn.cursor()
    try:
        _admin(cur, user_id)
        cur.execute("SELECT BookingID FROM dbo.Invoices WHERE InvoiceID = ?", invoice_id)
        lookup = cur.fetchone()
        if lookup is None:
            raise PaymentError("Không tìm thấy hóa đơn", 404, "INVOICE_NOT_FOUND")
        cur.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        # Same booking lock as UC09. No new financial/status writes to legacy tables.
        row = _booking(cur, lookup.BookingID, lock=True)
        if row.InvoiceID != invoice_id:
            raise PaymentError("Dữ liệu hóa đơn không khớp", 409, "INVOICE_MISMATCH")
        info = _summary(cur, row)
        if (info["bookingStatus"] != "CANCELLED" or info["paidAmount"] != 0
                or str(row.InvoicePaymentStatus or "").strip().upper() == "PAID"):
            raise PaymentError("Chỉ hủy hóa đơn của booking đã hủy và chưa thu tiền", 409, "CANCELLATION_NOT_ALLOWED")
        cur.execute("SELECT InvoiceID FROM dbo.InvoiceAdminCancellations WITH (UPDLOCK,HOLDLOCK) WHERE InvoiceID = ?", invoice_id)
        if cur.fetchone() is not None:
            raise PaymentError("Hóa đơn đã hủy", 409, "ALREADY_CANCELLED")
        cur.execute("""INSERT INTO dbo.InvoiceAdminCancellations (InvoiceID, CancelledBy, Reason)
                       VALUES (?, ?, ?)""", invoice_id, user_id, reason.strip())
        conn.commit()
        return {"invoiceId": invoice_id, "invoiceStatus": "CANCELLED", "status": "CANCELLED",
                "message": "Đã hủy hóa đơn; lịch sử thanh toán được giữ nguyên"}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
