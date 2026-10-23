import os
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_DOWN
from urllib.parse import quote

from database import get_connection


# ============================================================
# UC06 - DEPOSIT BUSINESS RULE
#
# Tien coc = 1/3 tong tien san
# Lam tron XUONG theo bac 100.000 VND
#
# 350.000  -> 100.000
# 500.000  -> 100.000
# 600.000  -> 200.000
# 900.000  -> 300.000
# 1.200.000 -> 400.000
#
# Toi thieu 100.000 VND.
# Khong bao gio vuot qua tong tien booking.
# ============================================================

DEPOSIT_DIVISOR = Decimal("3")

DEPOSIT_ROUND_STEP = Decimal(
    "100000"
)

DEPOSIT_MIN_AMOUNT = Decimal(
    "100000"
)

DEFAULT_DEPOSIT_DEADLINE_MINUTES = 10


ALLOWED_DEMO_STATUSES = {
    "SUCCESS",
    "FAILED",
    "EXPIRED",
}


# ============================================================
# ERROR
# ============================================================

class PaymentError(Exception):

    def __init__(
        self,
        message,
        status_code=400,
        code=None,
    ):

        super().__init__(
            message
        )

        self.message = (
            message
        )

        self.status_code = (
            status_code
        )

        self.code = (
            code
        )


# ============================================================
# CONFIG
# ============================================================

def _deadline_minutes():

    try:

        value = int(
            os.getenv(
                "DEPOSIT_DEADLINE_MINUTES",
                str(
                    DEFAULT_DEPOSIT_DEADLINE_MINUTES
                ),
            )
        )

    except (
        TypeError,
        ValueError,
    ):

        value = (
            DEFAULT_DEPOSIT_DEADLINE_MINUTES
        )

    return max(
        value,
        1,
    )


def payment_demo_mode():

    return (
        os.getenv(
            "PAYMENT_DEMO_MODE",
            "true",
        )
        .strip()
        .lower()
        in {
            "1",
            "true",
            "yes",
            "on",
        }
    )


# ============================================================
# MONEY
# ============================================================

def _money(
    value
):

    return Decimal(
        str(
            value or 0
        )
    ).quantize(
        Decimal("1"),
        rounding=ROUND_DOWN,
    )


def _deposit_amount(
    total_amount
):

    total = (
        _money(
            total_amount
        )
    )


    if total <= 0:

        raise PaymentError(
            "Tổng tiền booking không hợp lệ để tính tiền cọc",
            409,
            "INVALID_BOOKING_AMOUNT",
        )


    # ========================================================
    # 1/3 TONG TIEN
    # ========================================================

    raw_deposit = (
        total
        /
        DEPOSIT_DIVISOR
    )


    # ========================================================
    # LAM TRON XUONG 100.000
    #
    # 116.666 -> 100.000
    # 166.666 -> 100.000
    # 200.000 -> 200.000
    # ========================================================

    rounded_deposit = (
        raw_deposit
        //
        DEPOSIT_ROUND_STEP
    ) * DEPOSIT_ROUND_STEP


    # ========================================================
    # TOI THIEU 100.000
    # ========================================================

    deposit = max(
        DEPOSIT_MIN_AMOUNT,
        rounded_deposit,
    )


    # ========================================================
    # KHONG VUOT TONG TIEN SAN
    # ========================================================

    deposit = min(
        deposit,
        total,
    )


    return deposit.quantize(
        Decimal("1"),
        rounding=ROUND_DOWN,
    )


# ============================================================
# TIME
# ============================================================

def _database_now(cursor):
    """Use SQL Server's clock so it matches DATETIME values stored in the database."""
    cursor.execute("SELECT GETDATE()")
    return cursor.fetchone()[0]


def _iso(
    value
):

    if value is None:

        return None


    if isinstance(
        value,
        datetime,
    ):

        # SQL Server values are stored as UTC-naive timestamps in this app.
        return value.isoformat(timespec="seconds") + (
            "Z" if value.utcoffset() is None else ""
        )


    return str(
        value
    )


def _deadline(
    booking
):

    if not isinstance(
        booking.CreatedAt,
        datetime,
    ):

        raise PaymentError(
            "Booking không có thời điểm tạo hợp lệ",
            409,
            "INVALID_BOOKING_CREATED_AT",
        )


    return (
        booking.CreatedAt
        +
        timedelta(
            minutes=
                _deadline_minutes()
        )
    )


# ============================================================
# CUSTOMER
# ============================================================

def _check_customer(
    cursor,
    user_id,
):

    cursor.execute(
        """
        SELECT
            UserID,
            Role,
            Status

        FROM Users

        WHERE UserID = ?
        """,
        user_id,
    )


    user = (
        cursor.fetchone()
    )


    if user is None:

        raise PaymentError(
            "Không tìm thấy người dùng",
            404,
            "USER_NOT_FOUND",
        )


    role = str(
        user.Role or ""
    ).strip().upper()


    status = str(
        user.Status or ""
    ).strip().upper()


    if role != "CUSTOMER":

        raise PaymentError(
            "Chỉ CUSTOMER được đặt cọc",
            403,
            "CUSTOMER_REQUIRED",
        )


    if status != "ACTIVE":

        raise PaymentError(
            "Tài khoản hiện không hoạt động",
            403,
            "ACCOUNT_INACTIVE",
        )


# ============================================================
# BOOKING
# ============================================================

def _get_booking(
    cursor,
    booking_id,
    user_id,
    lock=False,
):

    hint = (
        "WITH (UPDLOCK, HOLDLOCK)"
        if lock
        else ""
    )


    cursor.execute(
        f"""
        SELECT
            BookingID,
            UserID,
            FieldID,
            BookingDate,
            StartTime,
            EndTime,
            TotalAmount,
            Status,
            CreatedAt

        FROM Bookings
        {hint}

        WHERE BookingID = ?
          AND UserID = ?
        """,
        booking_id,
        user_id,
    )


    booking = (
        cursor.fetchone()
    )


    if booking is None:

        raise PaymentError(
            (
                "Không tìm thấy booking "
                "hoặc bạn không có quyền "
                "thao tác booking này"
            ),
            404,
            "BOOKING_NOT_FOUND",
        )


    return booking


# ============================================================
# GET LATEST DEPOSIT
# ============================================================

def _latest_deposit(
    cursor,
    booking_id,
    lock=False,
):

    hint = (
        "WITH (UPDLOCK, HOLDLOCK)"
        if lock
        else ""
    )


    cursor.execute(
        f"""
        SELECT TOP 1

            PaymentID,
            BookingID,
            PaymentType,
            PaymentMethod,
            Amount,
            Status,
            Reference,
            Deadline,
            CreatedAt,
            UpdatedAt

        FROM Payments
        {hint}

        WHERE BookingID = ?
          AND PaymentType = 'DEPOSIT'

        ORDER BY
            PaymentID DESC
        """,
        booking_id,
    )


    return (
        cursor.fetchone()
    )


# ============================================================
# CHECK SUCCESS
# ============================================================

def _has_success_deposit(
    cursor,
    booking_id,
    exclude_payment_id=None,
):

    sql = """
        SELECT TOP 1
            PaymentID

        FROM Payments
        WITH (
            UPDLOCK,
            HOLDLOCK
        )

        WHERE BookingID = ?

          AND PaymentType =
              'DEPOSIT'

          AND Status =
              'SUCCESS'
    """


    params = [
        booking_id
    ]


    if (
        exclude_payment_id
        is not None
    ):

        sql += """
            AND PaymentID <> ?
        """

        params.append(
            exclude_payment_id
        )


    cursor.execute(
        sql,
        *params,
    )


    return (
        cursor.fetchone()
        is not None
    )


# ============================================================
# PAYMENT RESPONSE
# ============================================================

def _payment_dict(
    row
):

    if row is None:

        return None


    return {

        "paymentId":
            row.PaymentID,

        "bookingId":
            row.BookingID,

        "paymentType":
            str(
                row.PaymentType or ""
            )
            .strip()
            .upper(),

        "paymentMethod":
            str(
                row.PaymentMethod or ""
            )
            .strip()
            .upper(),

        "amount":
            float(
                row.Amount or 0
            ),

        "status":
            str(
                row.Status or ""
            )
            .strip()
            .upper(),

        "reference":
            row.Reference,

        "deadline":
            _iso(
                row.Deadline
            ),

        "createdAt":
            _iso(
                row.CreatedAt
            ),

        "updatedAt":
            _iso(
                row.UpdatedAt
            ),

    }


def _booking_dict(
    row
):

    return {

        "bookingId":
            row.BookingID,

        "fieldId":
            row.FieldID,

        "bookingDate":
            str(
                row.BookingDate
            ),

        "startTime":
            str(
                row.StartTime
            )[:5],

        "endTime":
            str(
                row.EndTime
            )[:5],

        "totalAmount":
            float(
                row.TotalAmount or 0
            ),

        "status":
            str(
                row.Status or ""
            )
            .strip()
            .upper(),

        "createdAt":
            _iso(
                row.CreatedAt
            ),

    }


# ============================================================
# VIETQR
#
# QR tu dong co:
#
# - ngan hang
# - so tai khoan
# - so tien coc
# - noi dung chuyen khoan
#
# ============================================================

def _vietqr(
    amount,
    reference,
):

    bank_id = (
        os.getenv(
            "VIETQR_BANK_ID",
            "",
        )
        .strip()
    )


    account_no = (
        os.getenv(
            "VIETQR_ACCOUNT_NO",
            "",
        )
        .strip()
    )


    account_name = (
        os.getenv(
            "VIETQR_ACCOUNT_NAME",
            "TEAM 12",
        )
        .strip()
    )


    image_url = (
        None
    )


    if (
        bank_id
        and
        account_no
    ):

        image_url = (
            f"https://img.vietqr.io/image/"
            f"{quote(bank_id)}-"
            f"{quote(account_no)}-"
            f"compact2.png"
            f"?amount="
            f"{int(Decimal(str(amount)))}"
            f"&addInfo="
            f"{quote(reference)}"
            f"&accountName="
            f"{quote(account_name)}"
        )


    return {

        "bankId":
            bank_id
            or None,

        "accountNo":
            account_no
            or None,

        "accountName":
            account_name,

        "amount":
            float(
                amount
            ),

        "content":
            reference,

        "imageUrl":
            image_url,

    }


# ============================================================
# GET DEPOSIT INFO
#
# GET /api/bookings/<booking_id>/deposit
# ============================================================

def get_deposit_info(
    user_id,
    booking_id,
):

    conn = (
        get_connection()
    )


    if conn is None:

        raise PaymentError(
            "Không thể kết nối database",
            500,
            "DATABASE_UNAVAILABLE",
        )


    cursor = (
        conn.cursor()
    )


    try:

        _check_customer(
            cursor,
            user_id,
        )


        booking = (
            _get_booking(
                cursor,
                booking_id,
                user_id,
            )
        )


        deadline = (
            _deadline(
                booking
            )
        )


        payment_row = (
            _latest_deposit(
                cursor,
                booking_id,
            )
        )


        payment = (
            _payment_dict(
                payment_row
            )
        )


        expired = (
            _database_now(cursor)
            >=
            deadline
        )

        if expired:
            cursor.execute(
                """
                UPDATE Bookings
                SET Status = 'CANCELLED'
                WHERE BookingID = ?
                  AND UPPER(LTRIM(RTRIM(Status))) = 'PENDING'
                """,
                booking_id,
            )
            cursor.execute(
                """
                UPDATE Payments
                SET Status = 'EXPIRED', UpdatedAt = GETDATE()
                WHERE BookingID = ?
                  AND PaymentType = 'DEPOSIT'
                  AND UPPER(LTRIM(RTRIM(Status))) = 'PENDING'
                """,
                booking_id,
            )
            conn.commit()
            booking = _get_booking(cursor, booking_id, user_id)
            payment_row = _latest_deposit(cursor, booking_id)
            payment = _payment_dict(payment_row)


        if payment:

            status = (
                payment[
                    "status"
                ]
            )

        elif expired:

            status = (
                "EXPIRED"
            )

        else:

            status = (
                "NOT_CREATED"
            )


        if (
            payment
            and
            status == "PENDING"
            and
            expired
        ):

            status = (
                "EXPIRED"
            )


        amount = (
            _deposit_amount(
                booking.TotalAmount
            )
        )


        reference = (

            payment[
                "reference"
            ]

            if payment

            else

            (
                f"BOOKING-"
                f"{booking_id}"
                f"-DEPOSIT"
            )
        )


        return {

            "booking":
                _booking_dict(
                    booking
                ),

            "depositAmount":
                float(
                    amount
                ),

            "depositRate":
                float(
                    Decimal("1")
                    /
                    DEPOSIT_DIVISOR
                ),

            "depositRatio":
                "1/3",

            "depositRoundStep":
                int(
                    DEPOSIT_ROUND_STEP
                ),

            "depositMinAmount":
                int(
                    DEPOSIT_MIN_AMOUNT
                ),

            "deadline":
                _iso(
                    deadline
                ),

            "isExpired":
                expired,

            "currentPaymentStatus":
                status,

            "payment":
                payment,

            "vietQr":
                _vietqr(
                    amount,
                    reference,
                ),

            "demoMode":
                payment_demo_mode(),

        }


    finally:

        cursor.close()

        conn.close()


# ============================================================
# CREATE DEPOSIT
#
# POST /api/bookings/<booking_id>/deposit
# ============================================================

def create_deposit(
    user_id,
    booking_id,
):

    conn = (
        get_connection()
    )


    if conn is None:

        raise PaymentError(
            "Không thể kết nối database",
            500,
            "DATABASE_UNAVAILABLE",
        )


    cursor = (
        conn.cursor()
    )


    try:

        cursor.execute(
            """
            SET TRANSACTION
            ISOLATION LEVEL
            SERIALIZABLE
            """
        )


        _check_customer(
            cursor,
            user_id,
        )


        booking = (
            _get_booking(
                cursor,
                booking_id,
                user_id,
                lock=True,
            )
        )


        booking_status = (
            str(
                booking.Status
                or ""
            )
            .strip()
            .upper()
        )


        if (
            booking_status
            in {
                "CANCELLED",
                "COMPLETED",
            }
        ):

            raise PaymentError(
                "Booking hiện không thể đặt cọc",
                409,
                "BOOKING_NOT_PAYABLE",
            )


        if (
            _has_success_deposit(
                cursor,
                booking_id,
            )
        ):

            raise PaymentError(
                "Booking đã đặt cọc thành công",
                409,
                "DEPOSIT_ALREADY_SUCCESS",
            )


        deadline = (
            _deadline(
                booking
            )
        )


        if (
            _database_now(cursor)
            >=
            deadline
        ):

            raise PaymentError(
                "Booking đã quá thời hạn đặt cọc",
                410,
                "DEPOSIT_DEADLINE_EXPIRED",
            )


        latest = (
            _latest_deposit(
                cursor,
                booking_id,
                lock=True,
            )
        )


        if (
            latest
            and
            str(
                latest.Status or ""
            )
            .strip()
            .upper()
            ==
            "PENDING"
        ):

            raise PaymentError(
                "Booking đang có giao dịch đặt cọc PENDING",
                409,
                "DEPOSIT_PENDING_EXISTS",
            )


        # ====================================================
        # BACKEND TU TINH TIEN COC
        # FRONTEND KHONG GUI AMOUNT
        # ====================================================

        amount = (
            _deposit_amount(
                booking.TotalAmount
            )
        )


        # ====================================================
        # DEM SO LAN THANH TOAN
        # ====================================================

        cursor.execute(
            """
            SELECT
                COUNT(*)

            FROM Payments

            WHERE BookingID = ?
              AND PaymentType =
                  'DEPOSIT'
            """,
            booking_id,
        )


        attempt = (
            int(
                cursor.fetchone()[0]
                or 0
            )
            +
            1
        )


        if attempt == 1:

            reference = (
                f"BOOKING-"
                f"{booking_id}"
                f"-DEPOSIT"
            )

        else:

            reference = (
                f"BOOKING-"
                f"{booking_id}"
                f"-DEPOSIT-"
                f"{attempt}"
            )


        # ====================================================
        # INSERT PAYMENT
        # ====================================================

        cursor.execute(
            """
            INSERT INTO Payments
            (
                BookingID,
                PaymentType,
                PaymentMethod,
                Amount,
                Status,
                Reference,
                Deadline,
                CreatedAt,
                UpdatedAt
            )

            OUTPUT

                INSERTED.PaymentID,
                INSERTED.BookingID,
                INSERTED.PaymentType,
                INSERTED.PaymentMethod,
                INSERTED.Amount,
                INSERTED.Status,
                INSERTED.Reference,
                INSERTED.Deadline,
                INSERTED.CreatedAt,
                INSERTED.UpdatedAt

            VALUES
            (
                ?,
                'DEPOSIT',
                'VIETQR',
                ?,
                'PENDING',
                ?,
                ?,
                GETDATE(),
                GETDATE()
            )
            """,
            booking_id,
            amount,
            reference,
            deadline,
        )


        row = (
            cursor.fetchone()
        )


        conn.commit()


        payment = (
            _payment_dict(
                row
            )
        )


        return {

            **payment,

            "depositRatio":
                "1/3",

            "vietQr":
                _vietqr(
                    amount,
                    reference,
                ),

            "demoMode":
                payment_demo_mode(),

        }


    except Exception:

        conn.rollback()

        raise


    finally:

        cursor.close()

        conn.close()


# ============================================================
# UPDATE DEMO STATUS
#
# PATCH /api/payments/<payment_id>/demo-status
# ============================================================

def update_deposit_demo_status(
    user_id,
    payment_id,
    new_status,
):

    new_status = (
        str(
            new_status
            or ""
        )
        .strip()
        .upper()
    )


    if not payment_demo_mode():

        raise PaymentError(
            "Demo payment status đang bị tắt",
            403,
            "PAYMENT_DEMO_DISABLED",
        )


    if (
        new_status
        not in
        ALLOWED_DEMO_STATUSES
    ):

        raise PaymentError(
            "Status demo không hợp lệ",
            400,
            "INVALID_PAYMENT_STATUS",
        )


    conn = (
        get_connection()
    )


    if conn is None:

        raise PaymentError(
            "Không thể kết nối database",
            500,
            "DATABASE_UNAVAILABLE",
        )


    cursor = (
        conn.cursor()
    )


    try:

        cursor.execute(
            """
            SET TRANSACTION
            ISOLATION LEVEL
            SERIALIZABLE
            """
        )


        _check_customer(
            cursor,
            user_id,
        )


        cursor.execute(
            """
            SELECT

                P.PaymentID,
                P.BookingID,
                P.PaymentType,
                P.PaymentMethod,
                P.Amount,
                P.Status,
                P.Reference,
                P.Deadline,
                P.CreatedAt,
                P.UpdatedAt,

                B.Status
                    AS BookingStatus

            FROM Payments P

            WITH (
                UPDLOCK,
                HOLDLOCK
            )

            INNER JOIN Bookings B

            WITH (
                UPDLOCK,
                HOLDLOCK
            )

                ON B.BookingID =
                   P.BookingID

            WHERE P.PaymentID = ?

              AND B.UserID = ?
            """,
            payment_id,
            user_id,
        )


        row = (
            cursor.fetchone()
        )


        if row is None:

            raise PaymentError(
                (
                    "Không tìm thấy payment "
                    "hoặc bạn không có quyền "
                    "thao tác payment này"
                ),
                404,
                "PAYMENT_NOT_FOUND",
            )


        if (
            str(
                row.PaymentType
                or ""
            )
            .strip()
            .upper()
            !=
            "DEPOSIT"
        ):

            raise PaymentError(
                "Payment này không phải giao dịch đặt cọc",
                409,
                "NOT_DEPOSIT_PAYMENT",
            )


        current = (
            str(
                row.Status
                or ""
            )
            .strip()
            .upper()
        )


        if (
            current
            ==
            new_status
        ):

            conn.commit()

            return (
                _payment_dict(
                    row
                )
            )


        if current != "PENDING":

            raise PaymentError(
                (
                    f"Payment {current} "
                    "không thể đổi trạng thái"
                ),
                409,
                "PAYMENT_ALREADY_FINAL",
            )


        if (
            new_status
            ==
            "SUCCESS"
            and
            _database_now(cursor)
            >=
            row.Deadline
        ):

            raise PaymentError(
                "Giao dịch đã quá thời hạn đặt cọc",
                409,
                "DEPOSIT_DEADLINE_EXPIRED",
            )


        booking_status = (
            str(
                row.BookingStatus
                or ""
            )
            .strip()
            .upper()
        )


        if new_status == "SUCCESS":

            if (
                booking_status
                in {
                    "CANCELLED",
                    "COMPLETED",
                }
            ):

                raise PaymentError(
                    "Booking hiện không thể ghi nhận đặt cọc",
                    409,
                    "BOOKING_NOT_PAYABLE",
                )


            if (
                _has_success_deposit(
                    cursor,
                    row.BookingID,
                    exclude_payment_id=
                        payment_id,
                )
            ):

                raise PaymentError(
                    "Booking đã có giao dịch đặt cọc thành công",
                    409,
                    "DEPOSIT_ALREADY_SUCCESS",
                )


        # ====================================================
        # UPDATE PAYMENT
        # ====================================================

        cursor.execute(
            """
            UPDATE Payments

            SET
                Status = ?,
                UpdatedAt =
                    GETDATE()

            WHERE PaymentID = ?
            """,
            new_status,
            payment_id,
        )


        # ====================================================
        # SUCCESS -> CONFIRMED
        # ====================================================

        if new_status == "SUCCESS":

            cursor.execute(
                """
                UPDATE Bookings

                SET Status =
                    'CONFIRMED'

                WHERE BookingID = ?

                  AND Status =
                    'PENDING'
                """,
                row.BookingID,
            )


        cursor.execute(
            """
            SELECT

                PaymentID,
                BookingID,
                PaymentType,
                PaymentMethod,
                Amount,
                Status,
                Reference,
                Deadline,
                CreatedAt,
                UpdatedAt

            FROM Payments

            WHERE PaymentID = ?
            """,
            payment_id,
        )


        updated = (
            cursor.fetchone()
        )


        conn.commit()


        return (
            _payment_dict(
                updated
            )
        )


    except Exception:

        conn.rollback()

        raise


    finally:

        cursor.close()

        conn.close()
