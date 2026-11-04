
"""UC07 - Cancellation rules shared by CUSTOMER and ADMIN.

Payments that have succeeded are financial records and MUST NOT be deleted or
quietly refunded when a booking is cancelled. Refund policy is a separate
business decision; the audit row flags successful deposits for manual review.

Requires migration 003_booking_cancellations.sql.
"""

from __future__ import annotations

from datetime import date, datetime, time
import base64
import binascii
from decimal import Decimal
from typing import Any

from database import get_connection
from services.payment_service import PaymentError
from werkzeug.utils import secure_filename


CANCELLABLE_STATUSES = frozenset({"PENDING", "CONFIRMED"})
MAX_REASON_LENGTH = 500
REFUND_NOTE = (
    "Hệ thống chưa hỗ trợ hoàn tiền tự động. "
    "Nếu đã đặt cọc thành công, vui lòng liên hệ chủ sân để được xử lý riêng."
)


MAX_EVIDENCE_BYTES = 2 * 1024 * 1024


def _validate_refund_evidence(proof):
    if not isinstance(proof, dict):
        raise PaymentError("Cần mã giao dịch và biên lai chuyển khoản", 400, "REFUND_EVIDENCE_REQUIRED")
    reference = proof.get("transactionReference")
    if (not isinstance(reference, str) or not 3 <= len(reference.strip()) <= 100
            or any(ord(char) < 32 for char in reference)):
        raise PaymentError("Mã giao dịch cần từ 3 đến 100 ký tự", 400, "INVALID_TRANSACTION_REFERENCE")
    encoded = proof.get("evidenceBase64")
    if not isinstance(encoded, str) or not encoded:
        raise PaymentError("Vui lòng đính kèm biên lai", 400, "REFUND_EVIDENCE_REQUIRED")
    if len(encoded) > 4 * ((MAX_EVIDENCE_BYTES + 2) // 3):
        raise PaymentError("Biên lai tối đa 2 MB", 413, "EVIDENCE_TOO_LARGE")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise PaymentError("Dữ liệu biên lai không hợp lệ", 400, "INVALID_EVIDENCE")
    if len(data) > MAX_EVIDENCE_BYTES:
        raise PaymentError("Biên lai tối đa 2 MB", 413, "EVIDENCE_TOO_LARGE")
    mime = proof.get("evidenceMimeType")
    signatures = {"image/png": b"\x89PNG\r\n\x1a\n", "image/jpeg": b"\xff\xd8\xff", "application/pdf": b"%PDF-"}
    if not isinstance(mime, str) or mime not in signatures or not data.startswith(signatures[mime]):
        raise PaymentError("Biên lai phải là ảnh PNG, JPEG hoặc PDF", 400, "INVALID_EVIDENCE")
    name = proof.get("evidenceFileName")
    stem = secure_filename(name if isinstance(name, str) else "").rsplit('.', 1)[0][:140] or "bien-lai"
    filename = stem + {"image/png": ".png", "image/jpeg": ".jpg", "application/pdf": ".pdf"}[mime]
    return reference.strip(), data, mime, filename


def confirm_deposit_refund(user_id, booking_id, proof=None):
    """Record a manual refund, preserving original successful payments."""
    conn = get_connection()
    if conn is None:
        raise PaymentError("Không thể kết nối database", 500, "DB_UNAVAILABLE")
    cursor = conn.cursor()
    try:
        cursor.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        if _check_actor(cursor, user_id) != "ADMIN":
            raise PaymentError("Chỉ ADMIN được xác nhận hoàn cọc", 403, "FORBIDDEN")
        booking = _get_booking(cursor, booking_id, lock=True)
        if _norm(booking.Status) != "CANCELLED":
            raise PaymentError("Chỉ hoàn cọc cho đơn đã hủy", 409, "BOOKING_NOT_CANCELLED")
        cursor.execute("SELECT Amount FROM dbo.BookingDepositRefunds WHERE BookingID = ?", booking_id)
        if cursor.fetchone() is not None:
            raise PaymentError("Đơn đã hoàn cọc", 409, "ALREADY_REFUNDED")
        paid, final_paid = _payment_summary(cursor, booking_id)
        if paid <= 0 or final_paid or _paid_invoice_exists(cursor, booking_id):
            raise PaymentError("Đơn không đủ điều kiện hoàn cọc", 409, "REFUND_NOT_ALLOWED")
        reference, data, mime, filename = _validate_refund_evidence(proof)
        cursor.execute("""INSERT INTO dbo.BookingDepositRefunds
            (BookingID, Amount, ConfirmedByUserID, TransactionReference, EvidenceData, EvidenceMimeType, EvidenceFileName)
            VALUES (?, ?, ?, ?, ?, ?, ?)""", booking_id, paid, user_id, reference, data, mime, filename)
        conn.commit()
        return {"message": "Đã xác nhận hoàn cọc", "refundedAmount": float(paid)}
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


def get_refund_evidence(user_id, booking_id):
    conn = get_connection()
    if conn is None:
        raise PaymentError("Không thể kết nối database", 500, "DB_UNAVAILABLE")
    cursor = conn.cursor()
    try:
        role = _check_actor(cursor, user_id)
        booking = _get_booking(cursor, booking_id, lock=False)
        _check_ownership(role, user_id, booking)
        cursor.execute("SELECT EvidenceData, EvidenceMimeType, EvidenceFileName FROM dbo.BookingDepositRefunds WHERE BookingID=?", booking_id)
        row = cursor.fetchone()
        if row is None or not row.EvidenceData:
            raise PaymentError("Chưa có biên lai hoàn cọc", 404, "EVIDENCE_NOT_FOUND")
        return bytes(row.EvidenceData), row.EvidenceMimeType, row.EvidenceFileName
    finally:
        cursor.close()
        conn.close()


def _norm(value: Any) -> str:
    return str(value or "").strip().upper()


def _datetime_of_booking(day: Any, starts: Any) -> datetime:
    """Combine the date + local SQL TIME, using the DB server's clock."""
    if isinstance(day, datetime):
        day = day.date()
    elif isinstance(day, str):
        day = date.fromisoformat(day[:10])

    if isinstance(starts, datetime):
        starts = starts.time()
    elif isinstance(starts, str):
        starts = time.fromisoformat(starts)

    if not isinstance(day, date) or not isinstance(starts, time):
        raise PaymentError(
            "Ngày/giờ bắt đầu của booking không hợp lệ", 409,
            "INVALID_BOOKING_TIME",
        )
    return datetime.combine(day, starts.replace(tzinfo=None))


def _check_actor(cursor: Any, user_id: int) -> str:
    cursor.execute(
        "SELECT Role, Status FROM Users WHERE UserID = ?", user_id
    )
    actor = cursor.fetchone()
    if actor is None or _norm(actor.Status) != "ACTIVE":
        raise PaymentError("Tài khoản không hoạt động", 403, "ACCOUNT_INACTIVE")

    role = _norm(actor.Role)
    if role not in {"ADMIN", "CUSTOMER"}:
        raise PaymentError("Không đủ quyền hủy booking", 403, "FORBIDDEN")
    return role


def _get_booking(cursor: Any, booking_id: int, *, lock: bool) -> Any:
    hint = "WITH (UPDLOCK, HOLDLOCK)" if lock else ""
    cursor.execute(
        f"""
        SELECT BookingID, UserID, FieldID, BookingDate,
               StartTime, EndTime, TotalAmount, Status
        FROM Bookings {hint}
        WHERE BookingID = ?
        """,
        booking_id,
    )
    row = cursor.fetchone()
    if row is None:
        raise PaymentError("Không tìm thấy booking", 404, "BOOKING_NOT_FOUND")
    return row


def _check_ownership(role: str, user_id: int, booking: Any) -> None:
    if role == "CUSTOMER" and int(booking.UserID) != int(user_id):
        # Return 404 to avoid disclosing another user's booking.
        raise PaymentError("Không tìm thấy booking", 404, "BOOKING_NOT_FOUND")


def _payment_summary(cursor: Any, booking_id: int) -> tuple[Decimal, bool]:
    cursor.execute(
        """
        SELECT
            COALESCE(SUM(CASE
                WHEN PaymentType = 'DEPOSIT' AND Status = 'SUCCESS'
                THEN Amount ELSE 0 END), 0) AS DepositPaid,
            COALESCE(MAX(CASE
                WHEN PaymentType = 'FINAL_PAYMENT' AND Status = 'SUCCESS'
                THEN 1 ELSE 0 END), 0) AS FinalPaid
        FROM Payments
        WHERE BookingID = ?
        """,
        booking_id,
    )
    row = cursor.fetchone()
    return Decimal(str(row[0] or 0)), bool(row[1])


def _paid_invoice_exists(cursor: Any, booking_id: int) -> bool:
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM Invoices
        WHERE BookingID = ? AND UPPER(LTRIM(RTRIM(PaymentStatus))) = 'PAID'
        """,
        booking_id,
    )
    return int(cursor.fetchone()[0] or 0) > 0


def _refund_status(deposit_paid: Decimal) -> str:
    return "MANUAL_REVIEW" if deposit_paid > 0 else "NOT_REQUIRED"


def _rule_violation(
    role: str,
    booking: Any,
    database_now: datetime,
    *,
    final_paid: bool = False,
) -> tuple[str, str] | None:
    status = _norm(booking.Status)

    if status == "CANCELLED":
        return "ALREADY_CANCELLED", "Booking đã bị hủy"

    if status == "COMPLETED":
        return "BOOKING_COMPLETED", "Booking đã hoàn thành, không thể hủy"

    if status not in CANCELLABLE_STATUSES:
        return "INVALID_BOOKING_STATUS", "Trạng thái booking không cho phép hủy"

    if final_paid:
        return (
            "FINAL_PAYMENT_EXISTS",
            "Booking đã có thanh toán cuối hoặc hóa đơn PAID",
        )

    # No minimum-hour cancellation policy has been approved.
    # CUSTOMER may cancel only before the booked start.
    # ADMIN may cancel a still-open booking.
    if role == "CUSTOMER":
        starts_at = _datetime_of_booking(
            booking.BookingDate,
            booking.StartTime,
        )

        if starts_at <= database_now:
            return (
                "BOOKING_ALREADY_STARTED",
                "Đã đến giờ đá, vui lòng liên hệ chủ sân để xử lý",
            )

    return None


def _booking_now(cursor: Any) -> datetime:
    cursor.execute("SELECT GETDATE()")
    return cursor.fetchone()[0]


def _cancellation_audit(
    cursor: Any,
    booking_id: int,
) -> dict[str, Any] | None:
    cursor.execute(
        """
        SELECT C.Reason, C.CanceledAt, C.CanceledByRole, C.RefundStatus,
               C.CanceledByUserID, U.FullName AS CanceledByName
        FROM BookingCancellations C
        INNER JOIN Users U ON U.UserID=C.CanceledByUserID
        WHERE C.BookingID = ?
        """,
        booking_id,
    )

    row = cursor.fetchone()

    if row is None:
        return None

    return {
        "reason": row.Reason,
        "canceledAt": (
            row.CanceledAt.isoformat(timespec="seconds")
            if isinstance(row.CanceledAt, datetime)
            else str(row.CanceledAt)
        ),
        "canceledByRole": row.CanceledByRole,
        "canceledByUserId": row.CanceledByUserID,
        "canceledByName": row.CanceledByName,
        "refundStatus": row.RefundStatus,
    }


def get_cancellation_info(
    user_id: int,
    booking_id: int,
) -> dict[str, Any]:
    """Read-only eligibility for the UI. Authentication happens in the route."""
    conn = get_connection()

    if conn is None:
        raise PaymentError("Không thể kết nối database", 500, "DB_UNAVAILABLE")

    cursor = conn.cursor()

    try:
        role = _check_actor(cursor, user_id)
        booking = _get_booking(cursor, booking_id, lock=False)

        _check_ownership(role, user_id, booking)

        paid, final_paid = _payment_summary(cursor, booking_id)

        finalized = final_paid or _paid_invoice_exists(
            cursor,
            booking_id,
        )

        issue = _rule_violation(
            role,
            booking,
            _booking_now(cursor),
            final_paid=finalized,
        )

        audit = (
            _cancellation_audit(cursor, booking_id)
            if _norm(booking.Status) == "CANCELLED"
            else None
        )

        cursor.execute("SELECT Amount, ConfirmedAt, TransactionReference, EvidenceFileName, CASE WHEN EvidenceData IS NULL THEN 0 ELSE 1 END AS HasEvidence FROM dbo.BookingDepositRefunds WHERE BookingID = ?", booking_id)
        refund = cursor.fetchone()
        return {
            "refundedAmount": float(refund.Amount) if refund else 0,
            "refundedAt": str(refund.ConfirmedAt) if refund else None,
            "refundTransactionReference": refund.TransactionReference if refund else None,
            "hasRefundEvidence": bool(refund.HasEvidence) if refund else False,
            "refundEvidenceFileName": refund.EvidenceFileName if refund else None,
            "bookingId": int(booking.BookingID),
            "bookingStatus": _norm(booking.Status),
            "canCancel": issue is None,
            "code": issue[0] if issue else None,
            "message": (
                issue[1]
                if issue
                else "Có thể hủy booking này"
            ),
            "depositPaid": float(paid),
            "refundStatus": (
                "REFUNDED" if refund else (audit["refundStatus"] if audit else _refund_status(paid))
            ),
            "refundNote": "Chủ sân đã hoàn tiền cọc cho bạn." if refund else REFUND_NOTE,
            "cancellation": audit,
        }

    finally:
        cursor.close()
        conn.close()


def cancel_booking(
    user_id: int,
    booking_id: int,
    reason: Any = None,
) -> dict[str, Any]:
    """Cancel one booking atomically, invalidate pending QR, store an audit row."""
    if reason is None:
        reason = ""

    if not isinstance(reason, str):
        raise PaymentError(
            "Lý do hủy phải là chuỗi ký tự",
            400,
            "INVALID_REASON",
        )

    reason = reason.strip()

    if len(reason) > MAX_REASON_LENGTH:
        raise PaymentError(
            "Lý do hủy tối đa 500 ký tự",
            400,
            "INVALID_REASON",
        )

    conn = get_connection()

    if conn is None:
        raise PaymentError(
            "Không thể kết nối database",
            500,
            "DB_UNAVAILABLE",
        )

    cursor = conn.cursor()

    try:
        cursor.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")

        role = _check_actor(cursor, user_id)

        booking = _get_booking(
            cursor,
            booking_id,
            lock=True,
        )

        _check_ownership(role, user_id, booking)

        # UC07 review workflow: Do not bypass a pending customer's request.
        # This check is under the same transaction / booking lock as the update.
        cursor.execute("""SELECT TOP (1) RequestID
                          FROM dbo.BookingCancellationRequests WITH (UPDLOCK,HOLDLOCK)
                          WHERE BookingID=? AND Status='PENDING_REVIEW'""", booking_id)
        if cursor.fetchone():
            raise PaymentError("Booking có yêu cầu chờ duyệt", 409, "REQUEST_PENDING")

        deposit_paid, final_paid = _payment_summary(
            cursor,
            booking_id,
        )

        finalized = final_paid or _paid_invoice_exists(
            cursor,
            booking_id,
        )

        issue = _rule_violation(
            role,
            booking,
            _booking_now(cursor),
            final_paid=finalized,
        )

        if issue is not None:
            raise PaymentError(issue[1], 409, issue[0])

        old_status = _norm(booking.Status)

        cursor.execute(
            """
            UPDATE Bookings
            SET Status = 'CANCELLED'
            WHERE BookingID = ?
              AND Status IN ('PENDING', 'CONFIRMED')
            """,
            booking_id,
        )

        if cursor.rowcount != 1:
            raise PaymentError(
                "Booking đã thay đổi trạng thái",
                409,
                "BOOKING_STATUS_CHANGED",
            )

        # Stop pending deposit payments.
        # Successful payments must remain unchanged.
        cursor.execute(
            """
            UPDATE Payments
            SET Status = 'EXPIRED',
                UpdatedAt = GETDATE()
            WHERE BookingID = ?
              AND PaymentType = 'DEPOSIT'
              AND Status = 'PENDING'
            """,
            booking_id,
        )

        refund = _refund_status(deposit_paid)

        cursor.execute(
            """
            INSERT INTO BookingCancellations
                (
                    BookingID,
                    CanceledByUserID,
                    CanceledByRole,
                    Reason,
                    DepositPaid,
                    RefundStatus
                )
            OUTPUT
                INSERTED.CancellationID,
                INSERTED.CanceledAt
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            booking_id,
            user_id,
            role,
            reason or None,
            deposit_paid,
            refund,
        )

        saved = cursor.fetchone()

        conn.commit()

        return {
            "message": "Hủy booking thành công",
            "bookingId": int(booking.BookingID),
            "oldStatus": old_status,
            "status": "CANCELLED",
            "cancelledByRole": role,
            "cancellationId": int(saved[0]),
            "cancelledAt": (
                saved[1].isoformat(timespec="seconds")
                if isinstance(saved[1], datetime)
                else str(saved[1])
            ),
            "reason": reason or None,
            "releasedSlot": True,
            "depositPaid": float(deposit_paid),
            "refundStatus": refund,
            "refundNote": REFUND_NOTE,
        }

    except Exception:
        conn.rollback()
        raise

    finally:
        cursor.close()
        conn.close()
