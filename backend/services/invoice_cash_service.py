"""UC09: Admin ghi nhận tiền khách đã thanh toán trực tiếp tại sân.

Không tạo mã QR, không tự thu tiền. Chỉ lưu xác nhận sau khi ADMIN
đã kiểm tra và thực tế nhận đủ khoản tiền còn lại.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from database import get_connection
from services.payment_service import PaymentError
from services.business_time import business_now
from services.cancellation_service import _datetime_of_booking


def _money(value: Any) -> Decimal:
    """Chuẩn hóa số tiền bằng Decimal thay vì float."""
    return Decimal(
        str(value if value is not None else 0)
    ).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP
    )


def _connection() -> Any:
    conn = get_connection()

    if conn is None:
        raise PaymentError(
            "Không thể kết nối database",
            500,
            "DB_UNAVAILABLE"
        )

    return conn


def _current_role(cursor: Any, user_id: int) -> str:
    """Kiểm tra lại Role và Status từ SQL Server."""
    cursor.execute(
        "SELECT Role, Status FROM Users WHERE UserID = ?",
        user_id
    )

    row = cursor.fetchone()

    if row is None or str(
        row.Status or ""
    ).strip().upper() != "ACTIVE":
        raise PaymentError(
            "Tài khoản không hoạt động",
            403,
            "ACCOUNT_INACTIVE"
        )

    return str(row.Role or "").strip().upper()


def _booking(
    cursor: Any,
    booking_id: int,
    lock: bool = False
) -> Any:
    lock_hint = (
        "WITH (UPDLOCK, HOLDLOCK)"
        if lock else ""
    )

    cursor.execute(
        f"""
        SELECT
            B.BookingID,
            B.UserID,
            B.TotalAmount,
            B.Status,
            B.BookingDate,
            B.StartTime,
            COALESCE(R.Amount,0) AS RefundedAmount,
            Attendance.EventType AS AttendanceState,

            I.InvoiceID,
            I.Amount AS InvoiceAmount,
            I.PaidAmount AS InvoicePaidAmount,
            I.PaymentStatus AS InvoicePaymentStatus

        FROM Bookings B {lock_hint}

        LEFT JOIN Invoices I
            ON I.BookingID = B.BookingID
        LEFT JOIN dbo.BookingDepositRefunds R ON R.BookingID=B.BookingID
        OUTER APPLY (SELECT TOP(1) EventType FROM dbo.BookingOperationEvents
                     WHERE BookingID=B.BookingID AND EventType IN ('CHECKED_IN','NO_SHOW','CANCELLATION_RESTORED') ORDER BY EventID DESC) Attendance

        WHERE B.BookingID = ?
        """,
        booking_id
    )

    row = cursor.fetchone()

    if row is None:
        raise PaymentError(
            "Không tìm thấy đơn đặt sân",
            404,
            "BOOKING_NOT_FOUND"
        )

    return row


def _successful_payments(
    cursor: Any,
    booking_id: int
) -> tuple[Decimal, Decimal, Decimal]:
    """Successful booking receipts: deposit, final cash and previously paid EXTRA."""

    cursor.execute(
        """
        SELECT
            COALESCE(
                SUM(
                    CASE
                        WHEN PaymentType = 'DEPOSIT'
                        THEN Amount
                        ELSE 0
                    END
                ),
                0
            ),

            COALESCE(
                SUM(
                    CASE
                        WHEN PaymentType = 'FINAL_PAYMENT'
                        THEN Amount
                        ELSE 0
                    END
                ),
                0
            ),
            COALESCE(SUM(CASE WHEN PaymentType = 'EXTRA' THEN Amount ELSE 0 END), 0)

        FROM Payments

        WHERE BookingID = ?
          AND Status = 'SUCCESS'
          AND PaymentType IN (
              'DEPOSIT',
              'FINAL_PAYMENT', 'EXTRA'
          )
        """,
        booking_id
    )

    deposit, final_payment, extra = cursor.fetchone()

    return _money(deposit), _money(final_payment), _money(extra)


def _summary(cursor: Any, row: Any) -> dict[str, Any]:
    total = _money(row.TotalAmount)

    deposit, final_payment, extra = _successful_payments(
        cursor,
        row.BookingID
    )

    paid = deposit + final_payment + extra

    if (
        row.TotalAmount is None
        or total < 0
        or deposit < 0
        or final_payment < 0
        or extra < 0
        or paid > total
    ):
        raise PaymentError(
            "Dữ liệu tiền thanh toán không hợp lệ",
            409,
            "PAYMENT_MISMATCH"
        )

    if row.InvoiceID is not None:
        if _money(row.InvoiceAmount) != total:
            raise PaymentError(
                "Tổng tiền hóa đơn không khớp booking",
                409,
                "INVOICE_MISMATCH"
            )

        if _money(row.InvoicePaidAmount) > paid:
            raise PaymentError(
                "Hóa đơn có số tiền đã thu chưa khớp",
                409,
                "INVOICE_MISMATCH"
            )

    gross_paid = paid
    refunded = _money(getattr(row, "RefundedAmount", 0))
    if refunded < 0 or refunded > paid:
        raise PaymentError("Số tiền hoàn không hợp lệ", 409, "PAYMENT_MISMATCH")
    paid -= refunded
    cancelled = str(row.Status or "").upper() == "CANCELLED"
    remaining = Decimal("0") if cancelled else total - paid

    if getattr(row, "AttendanceState", None) == "NO_SHOW" and paid <= deposit:
        status = "RETAINED_DEPOSIT"
    elif cancelled and refunded > 0 and paid == 0:
        status = "REFUNDED"
    elif cancelled and paid > 0:
        status = "REFUND_PENDING"
    elif cancelled and paid == 0 and total > 0:
        status = "UNPAID"
    elif remaining == 0:
        status = "PAID"
    elif paid > 0:
        status = "PARTIALLY_PAID"
    else:
        status = "UNPAID"

    return {
        "bookingId": int(row.BookingID),
        "invoiceId": (
            int(row.InvoiceID)
            if row.InvoiceID is not None
            else None
        ),
        "bookingStatus": str(
            row.Status or ""
        ).upper(),
        "totalAmount": float(total),
        "depositAmount": float(deposit),
        "extraAmount": float(extra),
        "finalPaymentAmount": float(final_payment),
        "paidAmount": float(paid),
        "grossPaidAmount": float(gross_paid),
        "refundedAmount": float(refunded),
        "remainingAmount": float(remaining),
        "status": status,
        "paymentMethod": (
            "CASH"
            if final_payment > 0
            else "NOT_RECORDED"
        ),
        "canConfirm": False
    }


def get_settlement(
    user_id: int,
    booking_id: int
) -> dict[str, Any]:
    """Customer xem booking của mình, Admin xem mọi booking."""

    conn = _connection()
    cursor = conn.cursor()

    try:
        role = _current_role(cursor, user_id)

        if role not in {"CUSTOMER", "ADMIN"}:
            raise PaymentError(
                "Không đủ quyền",
                403,
                "FORBIDDEN"
            )

        row = _booking(cursor, booking_id)

        if (
            role == "CUSTOMER"
            and int(row.UserID) != int(user_id)
        ):
            raise PaymentError(
                "Không tìm thấy đơn đặt sân",
                404,
                "BOOKING_NOT_FOUND"
            )

        info = _summary(cursor, row)

        started = business_now().replace(tzinfo=None) >= _datetime_of_booking(row.BookingDate, row.StartTime)
        info["confirmAvailableAt"] = _datetime_of_booking(row.BookingDate, row.StartTime).isoformat() + "+07:00"
        info["canConfirm"] = (
            role == "ADMIN"
            and started
            and info["bookingStatus"] in {"CONFIRMED", "COMPLETED"}
            and info["remainingAmount"] > 0
            and info["finalPaymentAmount"] == 0
            and str(
                row.InvoicePaymentStatus or ""
            ).upper() != "PAID"
        )

        return info

    finally:
        cursor.close()
        conn.close()


def confirm_final_cash_payment(
    admin_id: int,
    booking_id: int
) -> dict[str, Any]:
    """Ghi Payment SUCCESS và Invoice PAID trong một transaction."""

    conn = _connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"
        )

        if _current_role(cursor, admin_id) != "ADMIN":
            raise PaymentError(
                "Chỉ ADMIN được xác nhận thanh toán",
                403,
                "FORBIDDEN"
            )

        row = _booking(
            cursor,
            booking_id,
            lock=True
        )

        if str(row.Status or "").upper() not in {"CONFIRMED", "COMPLETED"}:
            raise PaymentError(
                "Chỉ thu tiền cho đơn đã xác nhận hoặc đã kết thúc",
                409,
                "BOOKING_NOT_COMPLETED"
            )

        if business_now().replace(tzinfo=None) < _datetime_of_booking(row.BookingDate, row.StartTime):
            raise PaymentError("Chỉ xác nhận thu đủ từ giờ bắt đầu đá",409,"BOOKING_NOT_STARTED")

        info = _summary(cursor, row)

        if (
            info["remainingAmount"] <= 0
            or str(
                row.InvoicePaymentStatus or ""
            ).upper() == "PAID"
        ):
            raise PaymentError(
                "Hóa đơn đã thanh toán đủ",
                409,
                "ALREADY_PAID"
            )

        if info["finalPaymentAmount"] > 0:
            raise PaymentError(
                "Đã có thanh toán cuối",
                409,
                "FINAL_PAYMENT_EXISTS"
            )

        total = _money(info["totalAmount"])
        remaining = _money(info["remainingAmount"])

        if row.InvoiceID is None:
            cursor.execute(
                """
                INSERT INTO Invoices (
                    BookingID,
                    Amount,
                    PaidAmount,
                    PaymentStatus,
                    CreatedDate
                )
                OUTPUT INSERTED.InvoiceID
                VALUES (
                    ?, ?, ?,
                    'PARTIALLY_PAID',
                    GETDATE()
                )
                """,
                booking_id,
                total,
                _money(info["paidAmount"])
            )

            invoice_id = int(cursor.fetchone()[0])

        else:
            invoice_id = int(row.InvoiceID)

        cursor.execute(
            """
            INSERT INTO Payments (
                InvoiceID,
                BookingID,
                PaymentType,
                PaymentMethod,
                Method,
                Amount,
                Status,
                Reference,
                TransactionCode,
                PaymentDate,
                CreatedAt,
                UpdatedAt
            )
            OUTPUT INSERTED.PaymentID
            VALUES (
                ?, ?,
                'FINAL_PAYMENT',
                'CASH',
                'CASH',
                ?,
                'SUCCESS',
                ?, ?,
                GETDATE(),
                GETDATE(),
                GETDATE()
            )
            """,
            invoice_id,
            booking_id,
            remaining,
            f"BOOKING-{booking_id}-FINAL-CASH",
            f"UC09-ADMIN-{admin_id}-BOOKING-{booking_id}"
        )

        payment_id = int(cursor.fetchone()[0])

        # A full venue payment must not leave an old unpaid deposit QR active.
        cursor.execute("""UPDATE Payments SET Status='EXPIRED',UpdatedAt=GETDATE()
                          WHERE BookingID=? AND PaymentType='DEPOSIT' AND Status='PENDING'""", booking_id)

        cursor.execute(
            """
            UPDATE Invoices
            SET
                PaidAmount = ?,
                PaymentStatus = 'PAID'
            WHERE InvoiceID = ?
            """,
            total,
            invoice_id
        )

        cursor.execute(
            """
            UPDATE Payments
            SET InvoiceID = ?
            WHERE BookingID = ?
              AND PaymentType = 'DEPOSIT'
              AND Status = 'SUCCESS'
              AND InvoiceID IS NULL
            """,
            invoice_id,
            booking_id
        )

        conn.commit()

        return {
            "message": "Đã xác nhận thu đủ tiền tại sân",
            "bookingId": booking_id,
            "invoiceId": invoice_id,
            "paymentId": payment_id,
            "amount": float(remaining),
            "status": "PAID",
            "remainingAmount": 0
        }

    except Exception:
        conn.rollback()
        raise

    finally:
        cursor.close()
        conn.close()
