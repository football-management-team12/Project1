"""Owner-only, transactional attendance and cancellation recovery with permanent audit."""

import json
from datetime import timedelta
from database import get_connection
from services.payment_service import PaymentError
from services import cancellation_service as rules
from services.business_time import database_iso


def record_event(cur, booking_id, actor, kind, details):
    cur.execute(
        """
        INSERT
        dbo.BookingOperationEvents(BookingID,ActorUserID,EventType,Details)
        VALUES (?,?,?,?)
        """,
        booking_id,
        actor,
        kind,
        json.dumps(details, default=str, ensure_ascii=False),
    )


def require_arrival_before_finish(cur, booking_id):
    cur.execute(
        """
        SELECT B.BookingDate,B.StartTime, (SELECT TOP(1) EventType FROM
        dbo.BookingOperationEvents WHERE BookingID=B.BookingID AND EventType IN
        ( 'CHECKED_IN' , 'NO_SHOW' , 'CANCELLATION_RESTORED' ) ORDER BY EventID
        DESC) AS AttendanceState FROM dbo.Bookings B WHERE B.BookingID=?
        """,
        booking_id,
    )
    row = cur.fetchone()
    if not row:
        raise PaymentError(
            "Không tìm thấy đơn đặt sân", 404, "BOOKING_NOT_FOUND"
        )
    if rules._booking_now(cur) < rules._datetime_of_booking(
        row.BookingDate, row.StartTime
    ):
        raise PaymentError(
            "Chưa đến giờ bắt đầu, không thể xác nhận đã đá xong",
            409,
            "BOOKING_NOT_STARTED",
        )


def store_cancellation(
    cur,
    booking_id,
    actor,
    role,
    reason,
    amount,
    refund_status,
    deposit_paid=None,
):
    """Keep the old unique-per-booking audit in immutable event history before reuse."""
    deposit_paid = amount if deposit_paid is None else deposit_paid
    cur.execute(
        """
        SELECT * FROM dbo.BookingCancellations WITH (UPDLOCK,HOLDLOCK) WHERE
        BookingID=?
        """,
        booking_id,
    )
    previous = cur.fetchone()
    if previous:
        snapshot = dict(
            zip([column[0] for column in cur.description], previous)
        )
        record_event(
            cur, booking_id, actor, "CANCELLATION_AUDIT_REUSED", snapshot
        )
        cur.execute(
            """
            UPDATE dbo.BookingCancellations SET
            CanceledByUserID=?,CanceledByRole=?,Reason=?,
            DepositPaid=?,RefundStatus=?,CanceledAt=GETDATE() OUTPUT
            INSERTED.CancellationID,INSERTED.CanceledAt WHERE BookingID=?
            """,
            actor,
            role,
            reason,
            deposit_paid,
            refund_status,
            booking_id,
        )
    else:
        cur.execute(
            """
            INSERT
            dbo.BookingCancellations(BookingID,CanceledByUserID,CanceledByRole,Reason,DepositPaid,RefundStatus,CanceledAt)
            OUTPUT INSERTED.CancellationID,INSERTED.CanceledAt VALUES
            (?,?,?,?,?,?,GETDATE())
            """,
            booking_id,
            actor,
            role,
            reason,
            deposit_paid,
            refund_status,
        )
    saved = cur.fetchone()
    record_event(
        cur,
        booking_id,
        actor,
        "CANCELLATION_RECORDED",
        {
            "reason": reason,
            "depositPaid": str(deposit_paid),
            "refundableAmount": str(amount),
            "refundStatus": refund_status,
        },
    )
    return saved


def operate(actor, booking_id, action, reason=""):
    if action not in {
        "check-in",
        "no-show",
        "restore-cancellation",
        "approve-rejected-cancellation",
    }:
        raise PaymentError("Thao tác không hợp lệ", 400, "INVALID_ACTION")
    if not isinstance(reason, str) or len(reason.strip()) > 500:
        raise PaymentError("Lý do tối đa 500 ký tự", 400, "INVALID_REASON")
    reason = reason.strip()
    if (
        action
        in {"no-show", "restore-cancellation", "approve-rejected-cancellation"}
        and not reason
    ):
        raise PaymentError("Vui lòng nhập lý do", 400, "REASON_REQUIRED")
    conn = get_connection()
    if conn is None:
        raise PaymentError("Không kết nối được dữ liệu", 503, "DB_UNAVAILABLE")
    cur = conn.cursor()
    try:
        cur.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        if rules._check_actor(cur, actor) != "ADMIN":
            raise PaymentError("Chỉ chủ sân được thực hiện", 403, "FORBIDDEN")
        booking = rules._get_booking(cur, booking_id, lock=True)
        now = rules._booking_now(cur)
        start = rules._datetime_of_booking(
            booking.BookingDate, booking.StartTime
        )
        cur.execute(
            """
            SELECT TOP(1) EventType FROM dbo.BookingOperationEvents WITH
            (UPDLOCK,HOLDLOCK) WHERE BookingID=? AND EventType IN (
            'CHECKED_IN' , 'NO_SHOW' , 'CANCELLATION_RESTORED' ) ORDER BY
            EventID DESC
            """,
            booking_id,
        )
        previous = cur.fetchone()
        checked_in = previous and previous.EventType == "CHECKED_IN"
        if action == "approve-rejected-cancellation":
            if booking.Status != "CONFIRMED" or now >= start:
                raise PaymentError(
                    "Chỉ đính chính cho đơn còn giữ sân và chưa đến giờ đá",
                    409,
                    "CORRECTION_NOT_ALLOWED",
                )
            cur.execute(
                """
                SELECT BookingID FROM dbo.BookingDepositRefunds WITH
                (UPDLOCK,HOLDLOCK) WHERE BookingID=?
                """,
                booking_id,
            )
            if cur.fetchone():
                raise PaymentError(
                    "Đã có khoản hoàn tiền; cần đối soát trước khi đổi quyết định",
                    409,
                    "REFUND_EXISTS",
                )
            cur.execute(
                """
                SELECT TOP(1) * FROM dbo.BookingCancellationRequests WITH
                (UPDLOCK,HOLDLOCK) WHERE BookingID=? ORDER BY RequestID DESC
                """,
                booking_id,
            )
            req = cur.fetchone()
            if not req or req.Status != "REJECTED":
                raise PaymentError(
                    "Không có yêu cầu bị từ chối để đính chính",
                    409,
                    "CORRECTION_NOT_ALLOWED",
                )
            snapshot = dict(
                zip([column[0] for column in cur.description], req)
            )
            summary = rules._payment_summary(cur, booking_id)
            refundable = getattr(summary, "total_paid", summary[0])
            record_event(
                cur,
                booking_id,
                actor,
                "CANCELLATION_DECISION_CORRECTED",
                {
                    "reason": reason,
                    "previousRequest": snapshot,
                    "newDecision": "APPROVED",
                },
            )
            store_cancellation(
                cur,
                booking_id,
                actor,
                "ADMIN",
                reason,
                refundable,
                rules._refund_status(refundable),
                summary[0],
            )
            cur.execute(
                """
                UPDATE dbo.BookingCancellationRequests SET Status= 'APPROVED'
                ,ReviewedByUserID=?,ReviewedAt=GETDATE(),ReviewNote=? WHERE
                RequestID=?
                """,
                actor,
                reason,
                req.RequestID,
            )
            cur.execute(
                "UPDATE dbo.Bookings SET Status='CANCELLED' WHERE BookingID=?",
                booking_id,
            )
            cur.execute(
                """
                UPDATE dbo.Payments SET Status= 'EXPIRED' ,UpdatedAt=GETDATE()
                WHERE BookingID=? AND Status= 'PENDING'
                """,
                booking_id,
            )
        elif action == "restore-cancellation":
            restore_limit = rules._datetime_of_booking(
                booking.BookingDate, booking.EndTime
            )
            if booking.Status != "CANCELLED" or now >= restore_limit:
                raise PaymentError(
                    "Chỉ khôi phục đơn đã hủy và chưa hết khung giờ đặt",
                    409,
                    "RESTORE_NOT_ALLOWED",
                )
            cur.execute(
                """
                SELECT BookingID FROM dbo.BookingDepositRefunds WITH
                (UPDLOCK,HOLDLOCK) WHERE BookingID=?
                """,
                booking_id,
            )
            if cur.fetchone():
                raise PaymentError(
                    "Đơn đã hoàn tiền, không thể tự khôi phục",
                    409,
                    "REFUND_EXISTS",
                )
            cur.execute(
                """
                SELECT BookingID FROM dbo.Bookings WITH (UPDLOCK,HOLDLOCK)
                WHERE FieldID=? AND BookingDate=? AND BookingID<>? AND Status
                IN ( 'PENDING' , 'CONFIRMED' , 'COMPLETED' ) AND StartTime<?
                AND EndTime>?
                """,
                booking.FieldID,
                booking.BookingDate,
                booking_id,
                booking.EndTime,
                booking.StartTime,
            )
            if cur.fetchone():
                raise PaymentError(
                    "Khung giờ đã có đơn khác, không thể khôi phục",
                    409,
                    "BOOKING_CONFLICT",
                )
            cur.execute(
                """
                SELECT * FROM dbo.BookingCancellationRequests WITH
                (UPDLOCK,HOLDLOCK) WHERE BookingID=? ORDER BY RequestID DESC
                """,
                booking_id,
            )
            requests = [
                dict(zip([column[0] for column in cur.description], row))
                for row in cur.fetchall()
            ]
            cur.execute(
                "SELECT * FROM dbo.BookingCancellations WHERE BookingID=?",
                booking_id,
            )
            audit = [
                dict(zip([column[0] for column in cur.description], row))
                for row in cur.fetchall()
            ]
            deposit, _ = rules._payment_summary(cur, booking_id)
            state = "CONFIRMED"
            record_event(
                cur,
                booking_id,
                actor,
                "CANCELLATION_RESTORED",
                {
                    "reason": reason,
                    "previousBookingStatus": booking.Status,
                    "newBookingStatus": state,
                    "requests": requests,
                    "cancellationAudit": audit,
                },
            )
            if checked_in:
                record_event(
                    cur,
                    booking_id,
                    actor,
                    "CHECKED_IN",
                    {
                        "reason": "Preserved previous check-in after cancellation correction"
                    },
                )
            cur.execute(
                """
                UPDATE dbo.BookingCancellationRequests SET Status= 'REJECTED'
                ,ReviewedByUserID=?,ReviewedAt=GETDATE(),ReviewNote=? WHERE
                BookingID=? AND Status= 'APPROVED'
                """,
                actor,
                reason,
                booking_id,
            )
            cur.execute(
                "UPDATE dbo.Bookings SET Status=? WHERE BookingID=?",
                state,
                booking_id,
            )
        else:
            if booking.Status != "CONFIRMED":
                raise PaymentError(
                    "Chỉ cập nhật khách đến cho đơn đã xác nhận",
                    409,
                    "INVALID_BOOKING_STATUS",
                )
            end = rules._datetime_of_booking(
                booking.BookingDate, booking.EndTime
            )
            if action == "check-in":
                if checked_in:
                    raise PaymentError(
                        "Đã xác nhận khách đến", 409, "ALREADY_CHECKED_IN"
                    )
                if now < start - timedelta(minutes=30):
                    raise PaymentError(
                        "Chỉ check-in từ 30 phút trước giờ bắt đầu",
                        409,
                        "CHECKIN_TIME_INVALID",
                    )
                cur.execute(
                    """
                    SELECT RequestID FROM dbo.BookingCancellationRequests WHERE
                    BookingID=? AND Status= 'PENDING_REVIEW'
                    """,
                    booking_id,
                )
                if cur.fetchone():
                    raise PaymentError(
                        "Cần xử lý yêu cầu hủy đang chờ trước khi xác nhận khách đã đến",
                        409,
                        "CANCELLATION_PENDING",
                    )
                record_event(
                    cur,
                    booking_id,
                    actor,
                    "CHECKED_IN",
                    {"reason": reason, "lateEntry": now >= end},
                )
            else:
                if checked_in or now < end:
                    raise PaymentError(
                        "Chỉ đánh dấu khách không đến khi đã hết giờ đá",
                        409,
                        "NO_SHOW_NOT_ALLOWED",
                    )
                cur.execute(
                    """
                    SELECT COALESCE(SUM(Amount),0) FROM dbo.Payments WHERE
                    BookingID=? AND Status= 'SUCCESS' AND PaymentType IN (
                    'DEPOSIT' , 'FINAL_PAYMENT' , 'EXTRA' )
                    """,
                    booking_id,
                )
                received = cur.fetchone()[0] or 0
                deposit, _ = rules._payment_summary(cur, booking_id)
                refundable = max(received - deposit, 0)
                cur.execute(
                    """
                    SELECT * FROM dbo.BookingCancellationRequests WHERE
                    BookingID=? AND Status= 'PENDING_REVIEW'
                    """,
                    booking_id,
                )
                requests = [
                    dict(zip([column[0] for column in cur.description], row))
                    for row in cur.fetchall()
                ]
                if requests:
                    raise PaymentError(
                        "Cần xét yêu cầu hủy đã gửi trước khi đánh dấu khách không đến",
                        409,
                        "CANCELLATION_PENDING",
                    )
                record_event(
                    cur,
                    booking_id,
                    actor,
                    "NO_SHOW",
                    {
                        "reason": reason,
                        "retainedDeposit": str(deposit),
                        "refundableAmount": str(refundable),
                        "additionalCharge": 0,
                        "requests": requests,
                    },
                )
                store_cancellation(
                    cur,
                    booking_id,
                    actor,
                    "ADMIN",
                    reason,
                    refundable,
                    rules._refund_status(refundable),
                    deposit,
                )
                cur.execute(
                    """
                    UPDATE dbo.Bookings SET Status= 'CANCELLED' WHERE
                    BookingID=?
                    """,
                    booking_id,
                )
                cur.execute(
                    """
                    UPDATE dbo.Payments SET Status= 'EXPIRED'
                    ,UpdatedAt=SYSUTCDATETIME() WHERE BookingID=? AND Status=
                    'PENDING'
                    """,
                    booking_id,
                )
        conn.commit()
        return {
            "bookingId": booking_id,
            "action": action,
            "message": "Đã cập nhật và lưu lịch sử thao tác",
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def history(actor, booking_id):
    conn = get_connection()
    if conn is None:
        raise PaymentError("Không kết nối được dữ liệu", 503, "DB_UNAVAILABLE")
    cur = conn.cursor()
    try:
        role = rules._check_actor(cur, actor)
        booking = rules._get_booking(cur, booking_id, lock=False)
        rules._check_ownership(role, actor, booking)
        cur.execute(
            """
            SELECT
            E.EventID,E.EventType,E.ActorUserID,E.OccurredAt,E.Details,U.FullName
            FROM dbo.BookingOperationEvents E JOIN dbo.Users U ON
            U.UserID=E.ActorUserID WHERE E.BookingID=? ORDER BY E.EventID DESC
            """,
            booking_id,
        )
        events = []
        for row in cur.fetchall():
            details = json.loads(row.Details)
            # Full snapshots can contain the customer's refund account; owner-only.
            events.append(
                {
                    "eventId": row.EventID,
                    "type": row.EventType,
                    "actor": row.FullName,
                    "actorUserId": row.ActorUserID,
                    "at": database_iso(row.OccurredAt, utc=True),
                    "reason": details.get("reason", ""),
                    "lateEntry": bool(details.get("lateEntry")),
                    "details": details if role == "ADMIN" else None,
                }
            )
        return {"events": events}
    finally:
        cur.close()
        conn.close()
