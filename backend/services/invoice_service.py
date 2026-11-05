"""UC08 read-only invoice view; payment arithmetic is shared with UC09."""
from services.invoice_cash_service import _connection, _current_role, _summary
from services.payment_service import PaymentError


def get_invoice(user_id, *, invoice_id=None, booking_id=None):
    conn = _connection()
    cursor = conn.cursor()
    try:
        role = _current_role(cursor, user_id)
        if role not in {"ADMIN", "CUSTOMER"}:
            raise PaymentError("Không đủ quyền", 403, "FORBIDDEN")
        # No active/archive filter: historical bookings retain their field.
        condition = "I.InvoiceID = ?" if invoice_id is not None else "B.BookingID = ?"
        cursor.execute(f"""
            SELECT B.BookingID, B.UserID, B.TotalAmount, B.Status,
                   B.BookingDate, B.StartTime, B.EndTime, B.FieldID,
                   F.FieldName, F.FieldType, F.Location,
                   I.InvoiceID, I.Amount AS InvoiceAmount,
                   I.PaidAmount AS InvoicePaidAmount,
                   I.PaymentStatus AS InvoicePaymentStatus, I.CreatedDate
            FROM Bookings B
            LEFT JOIN Invoices I ON I.BookingID = B.BookingID
            LEFT JOIN FootballFields F ON F.FieldID = B.FieldID
            WHERE {condition}
        """, invoice_id if invoice_id is not None else booking_id)
        row = cursor.fetchone()
        if row is None:
            raise PaymentError("Không tìm thấy hóa đơn hoặc booking", 404, "INVOICE_NOT_FOUND")
        if role == "CUSTOMER" and int(row.UserID) != int(user_id):
            raise PaymentError("Bạn không có quyền xem hóa đơn này", 403, "FORBIDDEN")
        info = _summary(cursor, row)
        provisional = row.InvoiceID is None
        if provisional and (invoice_id is not None or info["depositAmount"] <= 0):
            raise PaymentError("Booking chưa có hóa đơn; cần đặt cọc thành công", 404, "INVOICE_NOT_FOUND")
        info["isProvisional"] = provisional
        # Jira UC08 contract. Preserve UC09-compatible aliases for existing clients.
        info["paymentStatus"] = info["status"]
        info["field"] = {
            "fieldId": row.FieldID,
            "fieldName": row.FieldName,
            "fieldType": row.FieldType,
            "location": row.Location,
        }
        cursor.execute("SELECT Amount FROM dbo.BookingDepositRefunds WHERE BookingID = ?", row.BookingID)
        refund = cursor.fetchone()
        info.update({
            "fieldId": row.FieldID, "fieldName": row.FieldName,
            "fieldType": row.FieldType, "location": row.Location,
            "bookingDate": str(row.BookingDate),
            "startTime": str(row.StartTime)[:5], "endTime": str(row.EndTime)[:5],
            "createdDate": str(row.CreatedDate) if row.CreatedDate else None,
            "refundedAmount": float(refund.Amount) if refund else 0,
        })
        return info
    finally:
        cursor.close()
        conn.close()
