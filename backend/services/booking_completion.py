"""Read-only completion rules: scheduled end reached and net receipts cover total."""

from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation

from services.business_time import business_now


def is_booking_completed(booking, now=None):
    if str(booking.Status or "").strip().upper() not in {"CONFIRMED", "COMPLETED"}:
        return False
    if getattr(booking, "AttendanceState", None) == "NO_SHOW":
        return False
    try:
        day = booking.BookingDate
        if isinstance(day, datetime):
            day = day.date()
        elif isinstance(day, str):
            day = date.fromisoformat(day[:10])
        end = booking.EndTime
        if isinstance(end, str):
            end = time.fromisoformat(end)
        ends_at = datetime.combine(day, end)
        total = Decimal(str(booking.TotalAmount))
        paid = Decimal(str(booking.TotalPaidAmount))
        refunded = Decimal(str(booking.RefundedAmount or 0))
        if not all(value.is_finite() for value in (total, paid, refunded)):
            return False
        current = now if now is not None else business_now().replace(tzinfo=None)
        return (
            current >= ends_at
            and total >= 0
            and paid >= refunded >= 0
            and paid - refunded >= total
        )
    except (ValueError, TypeError, AttributeError, InvalidOperation):
        return False


def completion_sql(status, total, net_paid, end, attendance):
    """Developer-owned SQL expressions only; never interpolate request values."""
    return f"""(
        UPPER(LTRIM(RTRIM({status}))) IN ('CONFIRMED','COMPLETED')
        AND COALESCE({attendance},'')<>'NO_SHOW'
        AND {total}>=0 AND {net_paid}>={total}
        AND {end}<=DATEADD(HOUR,7,SYSUTCDATETIME())
    )"""


BOOKING_END_SQL = """DATEADD(SECOND,
    DATEDIFF(SECOND,CAST('00:00' AS TIME),B.EndTime),
    CAST(B.BookingDate AS DATETIME2))"""
