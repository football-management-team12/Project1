"""Actual receipts/refunds allocated to BookingDate. Read-only, bounded queries."""
from datetime import date, timedelta
from decimal import Decimal
import re

import pyodbc

from database import get_connection
from services.payment_service import PaymentError
from services.booking_completion import completion_sql


MAX_DAYS = 366


def validate_range(start, end):
    values = []
    for value in (start, end):
        if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
            raise PaymentError("Cần nhập từ ngày và đến ngày theo YYYY-MM-DD", 400, "INVALID_DATE_RANGE")
        try:
            parsed = date.fromisoformat(value)
        except ValueError as error:
            raise PaymentError("Ngày không hợp lệ", 400, "INVALID_DATE_RANGE") from error
        if not 1900 <= parsed.year <= 9998:
            raise PaymentError("Năm phải từ 1900 đến 9998", 400, "INVALID_DATE_RANGE")
        values.append(parsed)
    if values[0] > values[1] or (values[1] - values[0]).days >= MAX_DAYS:
        raise PaymentError("Khoảng báo cáo phải từ 1 đến 366 ngày", 400, "INVALID_DATE_RANGE")
    return values[0], values[1]


# Merge overlapping confirmed/completed intervals per field/day before adding time.
# No opening-hours history exists: denominator is explicitly 24 hours/day, NOT
# operating-hours occupancy. Include archived fields' historical bookings.
UTILIZATION_SQL = """WITH Slots AS (
    SELECT FieldID,BookingDate,BookingID,
        DATEDIFF(SECOND,CAST('00:00' AS TIME),StartTime) AS S,
        DATEDIFF(SECOND,CAST('00:00' AS TIME),EndTime) AS E
    FROM dbo.Bookings
    WHERE BookingDate>=? AND BookingDate<?
      AND UPPER(LTRIM(RTRIM(Status))) IN ('CONFIRMED','COMPLETED')
      AND EndTime>StartTime
), Previous AS (
    SELECT *,MAX(E) OVER (PARTITION BY FieldID,BookingDate ORDER BY S,E,BookingID
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS PreviousEnd
    FROM Slots
), Marked AS (
    SELECT *,CASE WHEN PreviousEnd IS NULL OR S>PreviousEnd THEN 1 ELSE 0 END AS NewIsland
    FROM Previous
), Grouped AS (
    SELECT *,SUM(NewIsland) OVER (PARTITION BY FieldID,BookingDate ORDER BY S,E,BookingID
        ROWS UNBOUNDED PRECEDING) AS Island
    FROM Marked
), Intervals AS (
    SELECT FieldID,BookingDate,Island,MAX(E)-MIN(S) AS Seconds
    FROM Grouped GROUP BY FieldID,BookingDate,Island
), Totals AS (
    SELECT FieldID,SUM(CAST(Seconds AS BIGINT)) AS BookedSeconds FROM Intervals GROUP BY FieldID
)
SELECT T.FieldID,F.FieldName,F.IsArchived,T.BookedSeconds
FROM Totals T LEFT JOIN dbo.FootballFields F ON F.FieldID=T.FieldID
ORDER BY T.BookedSeconds DESC,T.FieldID
"""


def _money(value):
    return float(Decimal(value or 0).quantize(Decimal("0.01")))


def get_summary(admin_id, start, end):
    # Defense in depth for direct callers, before opening any DB connection.
    start, end = validate_range(str(start), str(end))
    stop = end + timedelta(days=1)
    days = (end - start).days + 1
    conn = get_connection()
    if conn is None:
        raise PaymentError("Không thể kết nối database", 503, "DB_UNAVAILABLE")
    cursor = None
    try:
        conn.timeout = 30
        cursor = conn.cursor()
        # Repeatable ranges across all aggregate queries, without changing rows
        # or requiring database-wide snapshot isolation to be enabled.
        cursor.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        cursor.execute("SELECT Role,Status FROM dbo.Users WHERE UserID=?", admin_id)
        actor = cursor.fetchone()
        if actor is None or str(actor.Role).strip().upper() != "ADMIN" or str(actor.Status).strip().upper() != "ACTIVE":
            raise PaymentError("Chỉ quản trị viên đang hoạt động được xem báo cáo", 403, "FORBIDDEN")

        cursor.execute("""SELECT B.BookingDate AS Day,SUM(P.Amount) AS Amount,
            SUM(CASE WHEN UPPER(LTRIM(RTRIM(P.PaymentType)))='DEPOSIT'
                THEN P.Amount ELSE 0 END) AS DepositAmount
            FROM dbo.Payments P
            INNER JOIN dbo.Bookings B ON B.BookingID=P.BookingID
            WHERE B.BookingDate>=? AND B.BookingDate<? AND P.Amount>0
              AND UPPER(LTRIM(RTRIM(P.Status)))='SUCCESS'
              AND UPPER(LTRIM(RTRIM(P.PaymentType))) IN ('DEPOSIT','FINAL_PAYMENT','EXTRA')
            GROUP BY B.BookingDate""", start, stop)
        collected = cursor.fetchall()
        receipts = {str(row.Day): Decimal(row.Amount) for row in collected}
        deposits = {str(row.Day): Decimal(row.DepositAmount) for row in collected}
        cursor.execute("""SELECT B.BookingDate AS Day,SUM(R.Amount) AS Amount
            FROM dbo.BookingDepositRefunds R
            INNER JOIN dbo.Bookings B ON B.BookingID=R.BookingID
            WHERE B.BookingDate>=? AND B.BookingDate<? AND R.Amount>0
            GROUP BY B.BookingDate""", start, stop)
        refunds = {str(row.Day): Decimal(row.Amount) for row in cursor.fetchall()}

        completed_rule = completion_sql("Status", "TotalAmount", "NetPaid", "EndsAt", "AttendanceState")
        cursor.execute(f"""WITH Balances AS (
            SELECT B.Status,B.TotalAmount,COALESCE(P.Paid,0)-COALESCE(R.Refunded,0) AS NetPaid,
                COALESCE(P.Deposit,0)-COALESCE(R.Refunded,0) AS NetDeposit,COALESCE(R.Refunded,0) AS Refunded,
                Attendance.EventType AS AttendanceState,
                DATEADD(SECOND,DATEDIFF(SECOND,CAST('00:00' AS TIME),B.StartTime),CAST(B.BookingDate AS DATETIME2)) AS StartsAt,
                DATEADD(SECOND,DATEDIFF(SECOND,CAST('00:00' AS TIME),B.EndTime),CAST(B.BookingDate AS DATETIME2)) AS EndsAt
            FROM dbo.Bookings B
            OUTER APPLY (SELECT SUM(P.Amount) AS Paid,
                SUM(CASE WHEN UPPER(LTRIM(RTRIM(P.PaymentType)))='DEPOSIT' THEN P.Amount ELSE 0 END) AS Deposit
                FROM dbo.Payments P WHERE P.BookingID=B.BookingID AND P.Amount>0
                  AND UPPER(LTRIM(RTRIM(P.Status)))='SUCCESS'
                  AND UPPER(LTRIM(RTRIM(P.PaymentType))) IN ('DEPOSIT','FINAL_PAYMENT','EXTRA')) P
            OUTER APPLY (SELECT SUM(R.Amount) AS Refunded FROM dbo.BookingDepositRefunds R
                WHERE R.BookingID=B.BookingID AND R.Amount>0) R
            OUTER APPLY (SELECT TOP(1) EventType FROM dbo.BookingOperationEvents
                WHERE BookingID=B.BookingID AND EventType IN ('CHECKED_IN','NO_SHOW','CANCELLATION_RESTORED')
                ORDER BY EventID DESC) Attendance
            WHERE B.BookingDate>=? AND B.BookingDate<?
        ), Classified AS (SELECT CASE
            WHEN UPPER(LTRIM(RTRIM(Status))) IN ('CANCELLED','CANCELED') THEN 'CANCELLED'
            WHEN TotalAmount IS NULL OR TotalAmount<0 THEN 'INVALID_AMOUNT'
            WHEN Status IS NULL OR UPPER(LTRIM(RTRIM(Status))) NOT IN ('PENDING','CONFIRMED','COMPLETED') THEN 'INVALID_STATUS'
            WHEN NetPaid<0 THEN 'INVALID_BALANCE'
            WHEN {completed_rule} THEN 'COMPLETED_PAID'
            WHEN UPPER(LTRIM(RTRIM(Status))) IN ('PENDING','CONFIRMED','COMPLETED')
                AND TotalAmount>0 AND NetDeposit>0 AND NetPaid>0 AND NetPaid<TotalAmount THEN 'DEPOSITED'
            WHEN NetPaid>=TotalAmount THEN 'PAID_AWAITING_COMPLETION'
            WHEN NetPaid<=0 AND Refunded>0 THEN 'REFUNDED'
            WHEN NetPaid<=0 THEN 'UNPAID'
            ELSE 'PARTIALLY_PAID' END AS FinancialCategory,
            CASE
                WHEN AttendanceState='NO_SHOW' THEN 'NO_SHOW'
                WHEN UPPER(LTRIM(RTRIM(Status))) IN ('CANCELLED','PENDING') THEN UPPER(LTRIM(RTRIM(Status)))
                WHEN UPPER(LTRIM(RTRIM(Status))) IN ('CONFIRMED','COMPLETED') THEN
                    CASE WHEN {completed_rule} THEN 'COMPLETED'
                         WHEN EndsAt<=DATEADD(HOUR,7,SYSUTCDATETIME()) THEN 'ENDED'
                         WHEN StartsAt<=DATEADD(HOUR,7,SYSUTCDATETIME()) THEN 'IN_PROGRESS'
                         ELSE 'CONFIRMED' END
                ELSE 'UNKNOWN' END AS LifecycleCategory FROM Balances)
            SELECT Category,COUNT_BIG(*) AS Count FROM Classified
            CROSS APPLY (VALUES (FinancialCategory),('LIFECYCLE_'+LifecycleCategory)) C(Category)
            GROUP BY Category""", start, stop)
        counted = {row.Category: int(row.Count) for row in cursor.fetchall()}
        categories = {key: value for key, value in counted.items() if not key.startswith("LIFECYCLE_")}
        lifecycle = {key: counted.get("LIFECYCLE_" + key.upper(), 0) for key in
                     ("pending", "confirmed", "in_progress", "ended", "no_show", "cancelled", "completed", "unknown")}
        lifecycle["total"] = sum(lifecycle.values())
        completed = categories.get("COMPLETED_PAID", 0)
        breakdown = {key: categories.get(category, 0) for key,category in (
            ("completedPaid","COMPLETED_PAID"), ("deposited","DEPOSITED"), ("cancelled","CANCELLED"),
            ("unpaid","UNPAID"), ("paidAwaitingCompletion","PAID_AWAITING_COMPLETION"),
            ("partiallyPaid","PARTIALLY_PAID"), ("refunded","REFUNDED"),
            ("invalidAmount","INVALID_AMOUNT"), ("invalidStatus","INVALID_STATUS"), ("invalidBalance","INVALID_BALANCE"))}
        breakdown["total"] = sum(categories.values())
        bookings = {"COMPLETED": completed} if completed else {}

        cursor.execute("""SELECT UPPER(LTRIM(RTRIM(PaymentStatus))) AS Status,COUNT_BIG(*) AS Count
            FROM dbo.Invoices WHERE CreatedDate>=? AND CreatedDate<?
            GROUP BY UPPER(LTRIM(RTRIM(PaymentStatus)))""", start, stop)
        invoices = {row.Status or "UNKNOWN": int(row.Count) for row in cursor.fetchall()}
        cursor.execute(UTILIZATION_SQL, start, stop)
        fields = []
        for row in cursor.fetchall():
            seconds = Decimal(row.BookedSeconds)
            fields.append({"fieldId": int(row.FieldID), "fieldName": row.FieldName or f"Sân #{row.FieldID}",
                           "isArchived": bool(row.IsArchived), "bookedHours": round(float(seconds / 3600), 4),
                           "capacityHours": days * 24,
                           "utilizationPercent": round(float(seconds * 100 / (days * 86400)), 2)})
        daily = []
        for offset in range(days):
            day = str(start + timedelta(days=offset))
            gross = receipts.get(day, Decimal(0)); refunded = refunds.get(day, Decimal(0))
            deposit = deposits.get(day, Decimal(0))
            daily.append({"date": day, "grossRevenue": _money(gross),
                          "depositAmount": _money(deposit), "venueCollectedAmount": _money(gross-deposit), "refundedAmount": _money(refunded),
                          "revenue": _money(gross - refunded)})
        gross = sum(receipts.values(), Decimal(0)); refunded = sum(refunds.values(), Decimal(0))
        deposit = sum(deposits.values(), Decimal(0))
        return {"from": str(start), "to": str(end), "dayCount": days, "currency": "VND",
                "dateBasis": "booking-date", "revenueBasis": "booking-receipts-minus-confirmed-refunds",
                "utilizationBasis": "confirmed-completed-union-over-24h-per-day",
                "revenue": _money(gross-refunded), "grossRevenue": _money(gross), "refundedAmount": _money(refunded),
                "depositAmount": _money(deposit), "venueCollectedAmount": _money(gross-deposit),
                "bookingCount": completed, "bookingStatusCount": bookings, "bookingBreakdown": breakdown,
                "bookingLifecycleBreakdown": lifecycle,
                "invoiceCount": sum(invoices.values()), "invoiceStatusCount": invoices,
                "fieldUtilization": fields, "dailyRevenue": daily}
    except pyodbc.Error as error:
        # No SQL text, DB names or connection details in API responses.
        raise PaymentError("Không thể tổng hợp báo cáo. Kiểm tra kết nối và schema database rồi thử lại", 503, "REPORT_UNAVAILABLE") from error
    finally:
        try:
            conn.rollback()  # Release read locks, including on authorization/errors.
        finally:
            try:
                if cursor is not None:
                    cursor.close()
            finally:
                conn.close()
