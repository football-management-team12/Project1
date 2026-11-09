# ============================================================
import os


# AVAILABILITY SERVICE
# Dùng cho:
# - BE-05: kiểm tra lịch sân trống
# - BE-06: chống booking trùng lịch
# ============================================================


# Các trạng thái booking KHÔNG chiếm sân
CANCELLED_STATUSES = {
    "CANCELLED",
    "CANCELED",
    "HUY",
    "DA HUY",
    "ĐÃ HỦY"
}


def expire_pending_bookings(cursor, booking_id=None):
    """Expire overdue pending deposits and release unpaid reservations atomically.

    The caller owns the transaction and commit. A stored payment Deadline takes
    precedence over the current environment's fallback booking window.
    """
    try:
        deadline_minutes = int(
            os.getenv("DEPOSIT_DEADLINE_MINUTES", "10")
        )
    except (TypeError, ValueError):
        deadline_minutes = 10

    deadline_minutes = max(deadline_minutes, 1)
    scope = " AND B.BookingID = ?" if booking_id is not None else ""
    args = [deadline_minutes]
    if booking_id is not None:
        args.append(booking_id)
    cursor.execute(
        """
        UPDATE B
        SET Status = 'CANCELLED'
        FROM dbo.Bookings B WITH (UPDLOCK, HOLDLOCK)
        WHERE UPPER(LTRIM(RTRIM(B.Status))) = 'PENDING'
          AND (
              EXISTS (SELECT 1 FROM dbo.Payments P WHERE P.BookingID = B.BookingID
                      AND P.PaymentType = 'DEPOSIT' AND P.Status = 'PENDING'
                      AND P.Deadline <= GETDATE())
              OR (B.CreatedAt IS NOT NULL AND DATEADD(MINUTE, ?, B.CreatedAt) <= GETDATE())
          )
          AND NOT EXISTS (
              SELECT 1 FROM dbo.Payments P WHERE P.BookingID = B.BookingID
              AND P.PaymentType = 'DEPOSIT' AND P.Status = 'PENDING'
              AND P.Deadline > GETDATE()
          )
          AND NOT EXISTS (
              SELECT 1 FROM dbo.Payments P WHERE P.BookingID = B.BookingID
              AND P.Status = 'SUCCESS'
          )
          AND NOT EXISTS (
              SELECT 1 FROM dbo.BookingCancellationRequests R
              WHERE R.BookingID = B.BookingID AND R.Status = 'PENDING_REVIEW'
          )
        """ + scope,
        *args,
    )
    cursor.execute(
        """
        UPDATE P
        SET Status = 'EXPIRED', UpdatedAt = GETDATE()
        FROM dbo.Payments P
        JOIN dbo.Bookings B ON B.BookingID = P.BookingID
        WHERE P.PaymentType = 'DEPOSIT' AND P.Status = 'PENDING'
          AND (P.Deadline <= GETDATE()
               OR (P.Deadline IS NULL AND B.CreatedAt IS NOT NULL
                   AND DATEADD(MINUTE, ?, B.CreatedAt) <= GETDATE()))
        """ + scope,
        *args,
    )


# ============================================================
# EXPLICIT DEPOSIT EXPIRY
# ============================================================

def release_booking_for_expired_deposit(cursor, booking_id, payment_id):
    """Sync explicit EXPIRED events inside the caller's authorized transaction.

    A demo event may expire a payment before its deadline. Repeated events repair
    legacy PENDING bookings without changing successful financial records.
    """
    cursor.execute(
        """
        UPDATE B
        SET Status = 'CANCELLED'
        FROM dbo.Bookings B WITH (UPDLOCK, HOLDLOCK)
        WHERE B.BookingID = ? AND B.Status = 'PENDING'
          AND EXISTS (
              SELECT 1 FROM dbo.Payments E
              WHERE E.PaymentID = ? AND E.BookingID = B.BookingID
              AND E.PaymentType = 'DEPOSIT' AND E.Status = 'EXPIRED'
          )
          AND NOT EXISTS (
              SELECT 1 FROM dbo.Payments P
              WHERE P.BookingID = B.BookingID AND P.Status = 'SUCCESS'
          )
          AND NOT EXISTS (
              SELECT 1 FROM dbo.Payments P
              WHERE P.BookingID = B.BookingID AND P.PaymentType = 'DEPOSIT'
              AND P.Status = 'PENDING' AND (P.Deadline IS NULL OR P.Deadline > GETDATE())
          )
          AND NOT EXISTS (
              SELECT 1 FROM dbo.BookingCancellationRequests R
              WHERE R.BookingID = B.BookingID AND R.Status = 'PENDING_REVIEW'
          )
        """,
        booking_id,
        payment_id,
    )


# SQL TIME / datetime.time / string -> HH:MM
def format_time(value):

    if value is None:
        return None

    if hasattr(value, "strftime"):
        return value.strftime("%H:%M")

    value = str(value)

    return value[:5]


# ============================================================
# TIME -> MINUTES
#
# 06:00 -> 360
# 16:30 -> 990
# ============================================================

def time_to_minutes(value):

    value = format_time(value)

    if not value:
        return None

    try:

        hour, minute = value.split(":")

        return (
            int(hour) * 60
            +
            int(minute)
        )

    except (ValueError, TypeError):

        return None


# ============================================================
# CHECK OVERLAP
#
# slot:
# 16:00 -------- 18:00
#
# booking:
#       17:00 -------- 19:00
#
# => overlap
#
# booking_start < slot_end
# AND
# booking_end > slot_start
# ============================================================

def is_time_overlap(
    slot_start,
    slot_end,
    booking_start,
    booking_end
):

    slot_start_minutes = time_to_minutes(
        slot_start
    )

    slot_end_minutes = time_to_minutes(
        slot_end
    )

    booking_start_minutes = time_to_minutes(
        booking_start
    )

    booking_end_minutes = time_to_minutes(
        booking_end
    )


    if None in (
        slot_start_minutes,
        slot_end_minutes,
        booking_start_minutes,
        booking_end_minutes
    ):
        return False


    return (
        booking_start_minutes
        <
        slot_end_minutes
        and
        booking_end_minutes
        >
        slot_start_minutes
    )


# ============================================================
# CHECK BOOKING STATUS
# ============================================================

def booking_is_cancelled(status):

    normalized_status = (
        str(status or "")
        .strip()
        .upper()
    )

    return normalized_status in CANCELLED_STATUSES


# ============================================================
# CHECK ONE SLOT AVAILABLE
# ============================================================

def check_slot_available(
    slot_start,
    slot_end,
    bookings
):

    for booking in bookings:

        # Booking bị hủy không chiếm sân
        if booking_is_cancelled(
            booking.get("Status")
        ):
            continue


        if is_time_overlap(
            slot_start,
            slot_end,
            booking.get("StartTime"),
            booking.get("EndTime")
        ):

            return False

    return True


# ============================================================
# BUILD AVAILABILITY SLOTS
# ============================================================

def build_availability_slots(
    price_slots,
    bookings,
    field_available=True
):

    result = []


    for slot in price_slots:

        start_time = format_time(
            slot.get("StartTime")
        )

        end_time = format_time(
            slot.get("EndTime")
        )


        # Sân đang bảo trì / ngừng hoạt động
        if not field_available:

            available = False

            reason = "FIELD_UNAVAILABLE"

        else:

            available = check_slot_available(
                start_time,
                end_time,
                bookings
            )

            if available:
                reason = None
            else:
                reason = "BOOKED"


        result.append({

            "PriceID":
                slot.get("PriceID"),

            "StartTime":
                start_time,

            "EndTime":
                end_time,

            "Price":
                float(
                    slot.get("Price") or 0
                ),

            "available":
                available,

            "reason":
                reason
        })


    return result
