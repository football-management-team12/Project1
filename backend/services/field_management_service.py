
# ============================================================
# UC15 - FIELD MANAGEMENT SERVICE
# File: backend/services/field_management_service.py
#
# Chuc nang:
# - Lay danh sach / chi tiet san ADMIN
# - Them san moi
# - Sua thong tin san
# - Quan ly bang gia / khung gio
# - Doi AVAILABLE / MAINTENANCE
# - Archive / Restore
#
# Khong hard delete FootballFields, Bookings, Payments.
# ============================================================

from datetime import datetime
from decimal import Decimal, InvalidOperation


class FieldManagementError(Exception):
    def __init__(self, message, status=400, code="INVALID_DATA"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


ALLOWED_STATUSES = {"AVAILABLE", "MAINTENANCE"}
ALLOWED_FIELD_TYPES = {"5 player", "7 player", "11 player"}


def require_active_admin(cursor, user_id):
    cursor.execute("SELECT Role, Status FROM dbo.Users WHERE UserID = ?", user_id)
    user = cursor.fetchone()
    if (user is None or str(user.Role or "").strip().upper() != "ADMIN"
            or str(user.Status or "").strip().upper() != "ACTIVE"):
        raise FieldManagementError(
            "Chỉ ADMIN đang hoạt động được quản lý sân", 403, "FORBIDDEN"
        )


def validate_text(value, name, max_length, required=True):
    if not isinstance(value, str):
        raise FieldManagementError(
            f"{name} phải là chuỗi ký tự"
        )

    value = value.strip()

    if required and not value:
        raise FieldManagementError(
            f"{name} không được để trống"
        )

    try:
        # SQL Server NVARCHAR and HTML maxLength both count UTF-16 units.
        value_length = len(value.encode("utf-16-le")) // 2
    except UnicodeEncodeError:
        raise FieldManagementError(f"{name} chứa ký tự không hợp lệ")

    if value_length > max_length:
        raise FieldManagementError(
            f"{name} không được vượt quá {max_length} ký tự"
        )

    return value


def validate_field_type(value):
    value = validate_text(value, "Loại sân", 30)
    if value not in ALLOWED_FIELD_TYPES:
        raise FieldManagementError(
            "Loại sân chỉ được là 5 player, 7 player hoặc 11 player",
            400,
            "INVALID_FIELD_TYPE",
        )
    return value


def validate_status(value):
    if not isinstance(value, str):
        raise FieldManagementError(
            "Trạng thái sân không hợp lệ"
        )

    result = value.strip().upper()

    if result not in ALLOWED_STATUSES:
        raise FieldManagementError(
            "Trạng thái chỉ được AVAILABLE hoặc MAINTENANCE"
        )

    return result


def validate_time(value):
    if not isinstance(value, str):
        raise FieldManagementError(
            "Thời gian phải có định dạng HH:MM"
        )

    try:
        return datetime.strptime(
            value.strip(), "%H:%M"
        ).time()
    except ValueError:
        raise FieldManagementError(
            "Thời gian phải có định dạng HH:MM"
        )


def validate_price(value):
    if isinstance(value, bool) or value is None:
        raise FieldManagementError(
            "Giá sân phải là số dương"
        )

    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise FieldManagementError(
            "Giá sân không hợp lệ"
        )

    if (
        not result.is_finite()
        or result <= 0
        or result > Decimal("999999999")
    ):
        raise FieldManagementError(
            "Giá sân phải lớn hơn 0 và không vượt giới hạn"
        )

    if result != result.quantize(Decimal("0.01")):
        raise FieldManagementError("Giá sân chỉ được tối đa 2 chữ số thập phân")

    return result


def validate_slot(data):
    if not isinstance(data, dict):
        raise FieldManagementError(
            "Thông tin khung giờ không hợp lệ"
        )

    start_time = validate_time(
        data.get("StartTime")
    )
    end_time = validate_time(
        data.get("EndTime")
    )
    price = validate_price(
        data.get("Price")
    )

    if start_time >= end_time:
        raise FieldManagementError(
            "Giờ kết thúc phải lớn hơn giờ bắt đầu"
        )

    return start_time, end_time, price


def serialize_field(row):
    return {
        "FieldID": row.FieldID,
        "FieldName": row.FieldName,
        "FieldType": row.FieldType,
        "Location": row.Location,
        "Image": row.Image,
        "Status": row.Status,
        "IsArchived": bool(row.IsArchived),
        "ArchivedAt": (
            str(row.ArchivedAt)
            if row.ArchivedAt is not None
            else None
        ),
        "ArchivedBy": row.ArchivedBy,
    }


def get_field(cursor, field_id, lock=False):
    lock_hint = (
        "WITH (UPDLOCK, HOLDLOCK)"
        if lock else ""
    )

    cursor.execute(
        f"""
        SELECT
            FieldID,
            FieldName,
            FieldType,
            Location,
            Image,
            Status,
            IsArchived,
            ArchivedAt,
            ArchivedBy
        FROM dbo.FootballFields {lock_hint}
        WHERE FieldID = ?
        """,
        field_id
    )

    row = cursor.fetchone()

    if row is None:
        raise FieldManagementError(
            "Không tìm thấy sân bóng",
            404,
            "FIELD_NOT_FOUND"
        )

    return row


def get_admin_fields(cursor, archived=None):
    sql = """
        SELECT
            FieldID,
            FieldName,
            FieldType,
            Location,
            Image,
            Status,
            IsArchived,
            ArchivedAt,
            ArchivedBy
        FROM dbo.FootballFields
    """

    if archived is not None:
        sql += " WHERE IsArchived = ?"

        cursor.execute(sql + " ORDER BY FieldID", archived)
    else:
        cursor.execute(sql + " ORDER BY FieldID")

    return [
        serialize_field(row)
        for row in cursor.fetchall()
    ]


def get_field_details(cursor, field_id):
    field = get_field(cursor, field_id)

    result = serialize_field(field)

    cursor.execute(
        """
        SELECT
            PriceID,
            StartTime,
            EndTime,
            Price
        FROM dbo.FieldPrices
        WHERE FieldID = ?
        ORDER BY StartTime, PriceID
        """,
        field_id
    )

    result["Prices"] = [
        {
            "PriceID": row.PriceID,
            "StartTime": str(row.StartTime)[:5],
            "EndTime": str(row.EndTime)[:5],
            "Price": float(row.Price),
        }
        for row in cursor.fetchall()
    ]

    return result


def has_active_bookings(cursor, field_id):
    """
    Booking PENDING/CONFIRMED trong tương lai
    hoặc đang diễn ra phải được bảo vệ.

    Khong tu huy booking, khong thay doi payment.
    """
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM dbo.Bookings WITH (UPDLOCK, HOLDLOCK)
        WHERE FieldID = ?
          AND UPPER(LTRIM(RTRIM(Status)))
              IN ('PENDING', 'CONFIRMED')
          AND (
                CAST(BookingDate AS DATE)
                    > CAST(GETDATE() AS DATE)
                OR (
                    CAST(BookingDate AS DATE)
                        = CAST(GETDATE() AS DATE)
                    AND EndTime > CAST(GETDATE() AS TIME)
                )
          )
        """,
        field_id
    )

    return int(cursor.fetchone()[0]) > 0


def ensure_no_active_bookings(cursor, field_id):
    if has_active_bookings(cursor, field_id):
        raise FieldManagementError(
            "Sân đang có lịch đặt hiệu lực. "
            "Vui lòng xử lý booking trước khi thao tác.",
            409,
            "ACTIVE_BOOKINGS"
        )


def create_field(cursor, data):
    if not isinstance(data, dict):
        raise FieldManagementError(
            "Dữ liệu JSON không hợp lệ"
        )

    name = validate_text(
        data.get("FieldName"), "Tên sân", 100
    )
    field_type = validate_field_type(data.get("FieldType"))
    location = validate_text(
        data.get("Location"), "Địa điểm", 255
    )
    image = validate_text(
        data.get("Image", ""), "Hình ảnh", 255,
        required=False
    )
    status = validate_status(
        data.get("Status", "AVAILABLE")
    )

    cursor.execute(
        """
        INSERT INTO dbo.FootballFields
        (
            FieldName,
            FieldType,
            Location,
            Image,
            Status,
            IsArchived
        )
        OUTPUT INSERTED.FieldID
        VALUES (?, ?, ?, ?, ?, 0)
        """,
        name,
        field_type,
        location,
        image or None,
        status
    )

    field_id = int(cursor.fetchone()[0])

    return get_field_details(cursor, field_id)


def update_field(cursor, field_id, data):
    field = get_field(cursor, field_id, lock=True)

    if field.IsArchived:
        raise FieldManagementError(
            "Hãy khôi phục sân trước khi chỉnh sửa",
            409,
            "FIELD_ARCHIVED"
        )

    if not isinstance(data, dict) or not data:
        raise FieldManagementError(
            "Dữ liệu cập nhật không hợp lệ"
        )

    allowed = {
        "FieldName", "FieldType", "Location", "Image"
    }

    if set(data.keys()) - allowed:
        raise FieldManagementError(
            "Chỉ được sửa tên, loại, địa điểm và ảnh sân"
        )

    name = validate_text(
        data.get("FieldName", field.FieldName),
        "Tên sân",
        100
    )
    field_type = validate_field_type(data.get("FieldType", field.FieldType))
    location = validate_text(
        data.get("Location", field.Location),
        "Địa điểm",
        255
    )
    image = validate_text(
        data.get("Image", field.Image or ""),
        "Hình ảnh",
        255,
        required=False
    )

    cursor.execute(
        """
        UPDATE dbo.FootballFields
        SET
            FieldName = ?,
            FieldType = ?,
            Location = ?,
            Image = ?
        WHERE FieldID = ?
        """,
        name,
        field_type,
        location,
        image or None,
        field_id
    )

    return get_field_details(cursor, field_id)


def set_field_status(cursor, field_id, status):
    field = get_field(cursor, field_id, lock=True)

    if field.IsArchived:
        raise FieldManagementError(
            "Không thể đổi trạng thái sân đã lưu trữ",
            409,
            "FIELD_ARCHIVED"
        )

    status = validate_status(status)

    if status == "MAINTENANCE":
        ensure_no_active_bookings(cursor, field_id)

    cursor.execute(
        """
        UPDATE dbo.FootballFields
        SET Status = ?
        WHERE FieldID = ?
        """,
        status,
        field_id
    )

    return get_field_details(cursor, field_id)


def archive_field(cursor, field_id, admin_id):
    field = get_field(cursor, field_id, lock=True)

    if field.IsArchived:
        raise FieldManagementError(
            "Sân này đã được lưu trữ",
            409,
            "ALREADY_ARCHIVED"
        )

    ensure_no_active_bookings(cursor, field_id)

    cursor.execute(
        """
        UPDATE dbo.FootballFields
        SET
            IsArchived = 1,
            ArchivedAt = SYSDATETIME(),
            ArchivedBy = ?
        WHERE FieldID = ?
          AND IsArchived = 0
        """,
        admin_id,
        field_id
    )

    if cursor.rowcount != 1:
        raise FieldManagementError(
            "Không thể lưu trữ sân",
            409
        )

    return get_field_details(cursor, field_id)


def restore_field(cursor, field_id):
    field = get_field(cursor, field_id, lock=True)

    if not field.IsArchived:
        raise FieldManagementError(
            "Sân này chưa được lưu trữ",
            409,
            "NOT_ARCHIVED"
        )

    cursor.execute(
        """
        UPDATE dbo.FootballFields
        SET
            IsArchived = 0
        WHERE FieldID = ?
          AND IsArchived = 1
        """,
        field_id
    )

    if cursor.rowcount != 1:
        raise FieldManagementError(
            "Không thể khôi phục sân",
            409
        )

    return get_field_details(cursor, field_id)


def ensure_price_slot_available(
    cursor,
    field_id,
    start_time,
    end_time,
    exclude_price_id=None
):
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM dbo.FieldPrices WITH (UPDLOCK, HOLDLOCK)
        WHERE FieldID = ?
          AND StartTime < ?
          AND EndTime > ?
          AND (? IS NULL OR PriceID <> ?)
        """,
        field_id,
        end_time,
        start_time,
        exclude_price_id,
        exclude_price_id
    )

    if int(cursor.fetchone()[0]) > 0:
        raise FieldManagementError(
            "Khung giờ bị trùng với bảng giá hiện tại",
            409,
            "PRICE_SLOT_OVERLAP"
        )


def add_field_price(cursor, field_id, data):
    field = get_field(cursor, field_id, lock=True)

    if field.IsArchived:
        raise FieldManagementError(
            "Không thể sửa giá sân đã lưu trữ",
            409,
            "FIELD_ARCHIVED"
        )

    ensure_no_active_bookings(cursor, field_id)

    start_time, end_time, price = validate_slot(data)

    ensure_price_slot_available(
        cursor, field_id, start_time, end_time
    )

    cursor.execute(
        """
        INSERT INTO dbo.FieldPrices
        (
            FieldID,
            StartTime,
            EndTime,
            Price
        )
        OUTPUT INSERTED.PriceID
        VALUES (?, ?, ?, ?)
        """,
        field_id,
        start_time,
        end_time,
        price
    )

    price_id = int(cursor.fetchone()[0])

    return {
        "PriceID": price_id,
        "Field": get_field_details(cursor, field_id)
    }


def update_field_price(
    cursor, field_id, price_id, data
):
    field = get_field(cursor, field_id, lock=True)

    if field.IsArchived:
        raise FieldManagementError(
            "Không thể sửa giá sân đã lưu trữ",
            409,
            "FIELD_ARCHIVED"
        )

    ensure_no_active_bookings(cursor, field_id)

    cursor.execute(
        """
        SELECT PriceID
        FROM dbo.FieldPrices WITH (UPDLOCK, HOLDLOCK)
        WHERE FieldID = ? AND PriceID = ?
        """,
        field_id,
        price_id
    )

    if cursor.fetchone() is None:
        raise FieldManagementError(
            "Không tìm thấy khung giá",
            404,
            "PRICE_NOT_FOUND"
        )

    start_time, end_time, price = validate_slot(data)

    ensure_price_slot_available(
        cursor,
        field_id,
        start_time,
        end_time,
        price_id
    )

    cursor.execute(
        """
        UPDATE dbo.FieldPrices
        SET StartTime = ?, EndTime = ?, Price = ?
        WHERE FieldID = ? AND PriceID = ?
        """,
        start_time,
        end_time,
        price,
        field_id,
        price_id
    )

    return get_field_details(cursor, field_id)
