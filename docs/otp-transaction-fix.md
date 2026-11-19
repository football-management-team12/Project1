# Sửa OTP gửi thành công nhưng transaction chưa lưu

## Nguyên nhân và bằng chứng trước khi sửa

`get_connection()` trả pyodbc connection mặc định `autocommit=False`. Trong chế độ
manual commit của ODBC, driver tự bắt đầu transaction khi thực thi statement.
`transaction()` cũ còn gọi `BEGIN TRANSACTION`, tạo thêm một tầng transaction SQL.
`conn.commit()` có thể trả về mà tầng transaction ngoài vẫn chưa được lưu; đóng
connection sẽ rollback. Vì thế API cũ trả 202, Gmail đã gửi, nhưng các bảng OTP rỗng.

Đã tái hiện **trước khi sửa service** trên SQL Server 2022 local, machine id
`81a8dc78efc0`, ODBC Driver 17, pyodbc 5.3.0. Mỗi lần probe tạo database mới
`OtpIntegration_<uuid>` tại `127.0.0.1:1433`, dùng bảng TransactionProbe riêng,
không đọc/ghi dữ liệu `FootballBookingDB`; database thử được xóa sau khi chạy.

| Giai đoạn | Có BEGIN thủ công | Chỉ ODBC |
|---|---|---|
| Sau SET / trước INSERT: `(@@TRANCOUNT,XACT_STATE())` | `(2,1)` | `(1,1)` |
| Sau INSERT, trước commit | `(2,1)` | `(1,1)` |
| Query sau `conn.commit()` | `(1,1)` | `(1,1)` |
| Reader độc lập sau khi writer đóng | **0 bản ghi** | **1 bản ghi** |

Truy vấn `SELECT @@TRANCOUNT` sau commit **tự mở transaction ODBC mới**, nên không
thể lấy số 1 sau commit làm bằng chứng commit lỗi. Reader độc lập và dữ liệu còn
tồn tại sau khi writer đóng mới phân biệt được hai trường hợp.

[Microsoft: Transactions in ODBC](https://learn.microsoft.com/en-us/sql/relational-databases/native-client/odbc/performing-transactions-in-odbc?view=sql-server-ver15)
hướng dẫn dùng SQLEndTran trong chế độ manual commit, không trộn BEGIN/COMMIT/ROLLBACK
T-SQL với transaction do ODBC quản lý.
[pyodbc Connection](https://github.com/mkleehammer/pyodbc/wiki/Connection)
xác nhận autocommit mặc định False và transaction được quản lý trên connection.

## File thay đổi trong lần sửa bug

- `backend/services/otp_service.py`: bỏ BEGIN thủ công, giữ SET XACT_ABORT,
  LOCK_TIMEOUT và application lock. Thêm `commit_transaction()` dùng chung cho
  kết thúc thành công, sai OTP và Gmail lỗi. Kiểm tra depth=1/state=1 trước commit;
  connection autocommit hoặc transaction nested/doomed bị từ chối. Lỗi commit
  lan tới route để trả 503, không trả thành công. Connection luôn được đóng.
- `tests/api/test_auth_email_otp.py`: sửa fixture mô phỏng autocommit/counters;
  thêm tests nested/doomed transaction, commit lỗi và autocommit không hợp lệ.
- `tests/integration/otp_sqlserver_support.py`: tạo/xóa database thử ngẫu nhiên,
  chỉ kết nối loopback, kiểm tra machine id trước mọi write. Không dùng DB_NAME.
- `tests/integration/probe_otp_transactions.py`: tái hiện so sánh transaction cũ/mới,
  chỉ in counters và số hàng; không in connection string hoặc request dữ liệu.
- `tests/integration/test_otp_sqlserver.py`: SQL Server thật, Gmail mock, reader độc lập.
- `docs/otp-transaction-fix.md`, `docs/auth-gmail-otp.md`: bằng chứng và nghiệm thu.

Không cần migration mới cho bug này. Không thay đổi routes, contract, frontend,
nghiệp vụ booking/payment/admin, credentials, database helper dùng chung hoặc `.env`.
Các thay đổi chưa commit có sẵn được giữ nguyên. Không commit/push/PR/merge/deploy.

## Kết quả kiểm thử

- **255 automated unit tests qua**, không lỗi/skip. Chạy mọi `test_*.py` trong
  `tests/api` và `tests/test_staging_health.py`, với guard chặn pyodbc.connect và
  HTTP thật để không vô tình kết nối database/API đang chạy.
- **11 SQL Server integration tests qua** trên database thử độc lập, bao phủ:
  cả 7 endpoint; đọc PendingRegistrations/EmailOtpChallenges/EmailOtpSendAttempts
  sau register 202 từ reader riêng; verify tạo ACTIVE user; resend consume mã cũ;
  forgot/reset grants và password; 5 attempts sai vẫn lưu sau response 400;
  Gmail lỗi vẫn lưu consumed challenge/rate; commit lỗi cho **từng endpoint**;
  lỗi commit ở cả hai nhánh commit-trước-raise; nested transaction; email không
  tồn tại; hai verify đồng thời chỉ một 201, một 400 và đúng một user bền vững.
- Migration 014 được apply **hai lần trên database thử mới** để chuẩn bị integration
  và kiểm tra idempotence. Không apply vào FootballBookingDB, production hoặc VPS.
- `npm.cmd run build`: qua. Không sửa frontend trong lần sửa bug này.
- `git diff --check`: qua (Git có cảnh báo CRLF ở file thay đổi có sẵn).

Không chạy ba script thủ công `test21_concurrency_payment.py`,
`test22_payment_db_error.py`, `Uc07_test10_booking_cancellation_flow.py`: chúng hỏi
admin token/booking ID và gọi API thực tại cổng 5001 để sửa payment/cancellation.
Chạy chúng sẽ vượt phạm vi OTP và ràng buộc giữ nguyên dữ liệu. Không báo chúng đã qua.

Các integration test không gọi Gmail thật. OTP/password/grant chỉ nằm trong bộ nhớ
test; không in ra terminal hoặc artifact. Mỗi case có email/IP test riêng để rate
limit không ảnh hưởng chéo; không nới rate limit của ứng dụng.

## Chạy lại và nghiệm thu

SQL Server local cần đang chạy, ODBC Driver 17/18 và tài khoản local có quyền tạo
database thử. Helper chỉ lấy DB_USER/DB_PASSWORD (hoặc trusted connection) từ env/
dotenv hiện có vào bộ nhớ; không sửa hoặc in các giá trị. SERVER luôn là loopback,
database luôn mới ngẫu nhiên, và machine id phải đúng trước khi CREATE DATABASE.

```powershell
$env:AUTH_OTP_SQLSERVER_INTEGRATION = '1'
$env:AUTH_OTP_TEST_SERVER_ID = '81a8dc78efc0' # thay bằng machine id SQL test đã kiểm chứng
backend/venv/Scripts/python.exe tests/integration/probe_otp_transactions.py
backend/venv/Scripts/python.exe -m unittest discover -s tests/integration -p test_otp_sqlserver.py -v
backend/venv/Scripts/python.exe -m unittest discover -s tests/api -p test_auth_email_otp.py -v
cd frontend
npm.cmd run build
```

Khi nghiệm thu local với Flask, khởi động lại process để nạp service mới. Gọi register
với dữ liệu thử mới; ngay khi nhận 202, dùng connection SQL độc lập xác nhận ba bảng
có dữ liệu cho email/challenge vừa tạo. Verify/resend phải dùng challenge mới; các
email từ lần test lỗi cũ không còn challenge để cứu lại. Thử sai OTP và xem Attempts
tăng; thử Gmail lỗi trong môi trường mock và xem challenge consumed. Không đưa OTP,
grant, mật khẩu hay secret vào log hoặc ảnh chụp bằng chứng.

Gmail và SQL không có distributed transaction: email vẫn có thể đã đến trước khi
SQL commit bị lỗi. Trong trường hợp đó API mới trả **503**, rollback và không công
bố challenge/grant thành công. HTTP 202/200/201 chỉ được tạo sau khi context manager
hoàn thành commit. Mất kết nối ngay lúc commit vẫn có thể gây kết quả không xác định
ở phía client; server không trả thành công khi driver báo commit lỗi.
