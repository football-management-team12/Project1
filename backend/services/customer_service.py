"""UC13: ADMIN reads customer/history and edits contact fields only."""
from contextlib import contextmanager
import re

import pyodbc

from database import get_connection
from services.payment_service import PaymentError
from services.user_service import _is_valid_email


EDITABLE = {"fullName":"FullName", "email":"Email", "phone":"Phone"}
COLUMNS = "U.UserID,U.Username,U.FullName,U.Email,U.Phone,U.Role,U.Status"
CUSTOMER = "UPPER(LTRIM(RTRIM(U.Role)))='CUSTOMER'"


@contextmanager
def _session():
    conn=get_connection()
    if conn is None:
        raise PaymentError("Không thể kết nối database",503,"DB_UNAVAILABLE")
    cursor=None
    try:
        cursor=conn.cursor()
        yield conn,cursor
    finally:
        if cursor is not None: cursor.close()
        conn.close()


def _admin(cursor,user_id):
    cursor.execute("SELECT Role,Status FROM dbo.Users WHERE UserID=?",user_id)
    row=cursor.fetchone()
    if row is None or str(row.Status).strip().upper()!="ACTIVE":
        raise PaymentError("Tài khoản không hoạt động",403,"ACCOUNT_INACTIVE")
    if str(row.Role).strip().upper()!="ADMIN":
        raise PaymentError("Chỉ quản trị viên được quản lý khách hàng",403,"FORBIDDEN")


def _serialize(row):
    result={"customerId":int(row.UserID),"username":row.Username,"fullName":row.FullName,
            "email":row.Email,"phone":row.Phone,"role":str(row.Role).strip().upper(),
            "status":str(row.Status).strip().upper()}
    if hasattr(row,"BookingCount"): result["bookingCount"]=int(row.BookingCount)
    return result


def _target(cursor,customer_id,lock=False):
    hint="WITH (UPDLOCK,HOLDLOCK)" if lock else ""
    cursor.execute(f"SELECT {COLUMNS} FROM dbo.Users U {hint} WHERE U.UserID=? AND {CUSTOMER}",customer_id)
    row=cursor.fetchone()
    if row is None:
        raise PaymentError("Không tìm thấy khách hàng",404,"CUSTOMER_NOT_FOUND")
    return row


def list_customers(admin_id,keyword,status,page,page_size):
    with _session() as (_,cursor):
        _admin(cursor,admin_id)
        where=" WHERE "+CUSTOMER;args=[]
        if keyword:
            # Treat wildcard characters as literal search input.
            pattern="%"+keyword.replace("~","~~").replace("%","~%").replace("_","~_").replace("[","~[")+"%"
            where+=" AND (LOWER(U.FullName) LIKE LOWER(?) ESCAPE '~' OR LOWER(U.Username) LIKE LOWER(?) ESCAPE '~' OR LOWER(U.Email) LIKE LOWER(?) ESCAPE '~' OR U.Phone LIKE ? ESCAPE '~')"
            args.extend([pattern]*4)
        if status:
            where+=" AND UPPER(LTRIM(RTRIM(U.Status)))=?";args.append(status)
        cursor.execute("SELECT COUNT(*) FROM dbo.Users U"+where,*args)
        count=int(cursor.fetchone()[0])
        cursor.execute(f"""SELECT {COLUMNS},(SELECT COUNT(*) FROM dbo.Bookings B WHERE B.UserID=U.UserID) AS BookingCount
            FROM dbo.Users U"""+where+" ORDER BY U.UserID DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
            *args,(page-1)*page_size,page_size)
        return {"items":[_serialize(row) for row in cursor.fetchall()],"total":count,"page":page,
                "pageSize":page_size,"totalPages":(count+page_size-1)//page_size}


def get_customer(admin_id,customer_id):
    with _session() as (_,cursor):
        _admin(cursor,admin_id)
        return _serialize(_target(cursor,customer_id))


def customer_bookings(admin_id,customer_id,page,page_size):
    with _session() as (_,cursor):
        _admin(cursor,admin_id);_target(cursor,customer_id)
        cursor.execute("SELECT COUNT(*) FROM dbo.Bookings WHERE UserID=?",customer_id)
        count=int(cursor.fetchone()[0])
        cursor.execute("""SELECT B.BookingID,B.FieldID,B.BookingDate,B.StartTime,B.EndTime,B.TotalAmount,B.Status,
            F.FieldName,F.FieldType FROM dbo.Bookings B LEFT JOIN dbo.FootballFields F ON F.FieldID=B.FieldID
            WHERE B.UserID=? ORDER BY B.BookingDate DESC,B.StartTime DESC,B.BookingID DESC
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY""",customer_id,(page-1)*page_size,page_size)
        items=[]
        for row in cursor.fetchall():
            items.append({"bookingId":int(row.BookingID),"fieldId":int(row.FieldID),"fieldName":row.FieldName,
                          "fieldType":row.FieldType,"bookingDate":str(row.BookingDate)[:10],
                          "startTime":str(row.StartTime)[:5],"endTime":str(row.EndTime)[:5],
                          "totalAmount":float(row.TotalAmount) if row.TotalAmount is not None else None,
                          "status":str(row.Status).strip().upper()})
        return {"customerId":customer_id,"items":items,"total":count,"page":page,
                "pageSize":page_size,"totalPages":(count+page_size-1)//page_size}


def validate_update(payload):
    if not isinstance(payload,dict) or not payload:
        raise PaymentError("Cần ít nhất một trường thông tin cần cập nhật",400,"INVALID_BODY")
    if set(payload)-set(EDITABLE):
        raise PaymentError("Chỉ được sửa họ tên, email và số điện thoại",400,"INVALID_FIELDS")
    result={}
    for key,value in payload.items():
        if not isinstance(value,str) or not value.strip():
            raise PaymentError("Thông tin cập nhật không được để trống",400,"INVALID_CUSTOMER_DATA")
        value=value.strip()
        if any(ord(char)<32 for char in value):
            raise PaymentError("Thông tin chứa ký tự không hợp lệ",400,"INVALID_CUSTOMER_DATA")
        if key=="fullName":
            try: length=len(value.encode("utf-16-le"))//2
            except UnicodeEncodeError: length=101
            if length>100:
                raise PaymentError("Họ tên tối đa 100 ký tự",400,"INVALID_FULL_NAME")
        elif key=="email":
            value=value.lower()
            if not value.isascii() or len(value)>100 or not _is_valid_email(value):
                raise PaymentError("Email không hợp lệ hoặc quá 100 ký tự",400,"INVALID_EMAIL")
        elif key=="phone" and not re.fullmatch(r"0[0-9]{9}",value):
            raise PaymentError("Số điện thoại phải có 10 chữ số, bắt đầu bằng 0",400,"INVALID_PHONE")
        result[key]=value
    return result


def update_customer(admin_id,customer_id,payload):
    values=validate_update(payload)
    with _session() as (conn,cursor):
        try:
            cursor.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
            _admin(cursor,admin_id);row=_target(cursor,customer_id,lock=True)
            original=_serialize(row)
            changed={key:value for key,value in values.items() if value!=original[key]}
            if not changed:
                conn.rollback()
                return {"message":"Thông tin không thay đổi","customer":original,"updatedFields":[]}
            duplicates=[];args=[customer_id]
            if "email" in changed: duplicates.append("LOWER(Email)=?");args.append(changed["email"])
            if "phone" in changed: duplicates.append("Phone=?");args.append(changed["phone"])
            if duplicates:
                cursor.execute("SELECT TOP 1 UserID FROM dbo.Users WITH (UPDLOCK,HOLDLOCK) WHERE UserID<>? AND ("+" OR ".join(duplicates)+")",*args)
                if cursor.fetchone() is not None:
                    raise PaymentError("Email hoặc số điện thoại đã được sử dụng",409,"CONTACT_ALREADY_USED")
            assignments=",".join(EDITABLE[key]+"=?" for key in changed)
            cursor.execute(f"UPDATE dbo.Users SET {assignments} WHERE UserID=? AND UPPER(LTRIM(RTRIM(Role)))='CUSTOMER'",
                           *changed.values(),customer_id)
            if cursor.rowcount!=1:
                raise PaymentError("Khách hàng đã thay đổi, vui lòng tải lại",409,"CUSTOMER_CHANGED")
            result=_serialize(_target(cursor,customer_id))
            conn.commit()
            return {"message":"Đã cập nhật thông tin khách hàng","customer":result,"updatedFields":list(changed)}
        except pyodbc.IntegrityError as error:
            conn.rollback()
            if any(code in str(error) for code in ("2601","2627")):
                raise PaymentError("Email hoặc số điện thoại đã được sử dụng",409,"CONTACT_ALREADY_USED") from error
            raise
        except pyodbc.Error as error:
            conn.rollback()
            if "1205" in str(error) or "40001" in str(error):
                raise PaymentError("Dữ liệu đang được cập nhật, vui lòng thử lại",409,"CUSTOMER_CHANGED") from error
            raise
        except Exception:
            conn.rollback();raise
