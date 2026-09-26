# ============================================================
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


# ============================================================
# FORMAT TIME
# SQL TIME / datetime.time / string -> HH:MM
# ============================================================

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
# Công thức:
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