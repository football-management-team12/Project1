# UC13 — Quản lý khách hàng (T123-64)

Nguồn yêu cầu: T123-64, tester T123-133. Nhánh local
`feature/T123-64-uc13-customer-management`, dựa trên develop mới nhất khi bắt đầu.

## Phạm vi và dữ liệu

- Chỉ ADMIN ACTIVE (JWT hợp lệ + kiểm tra Role/Status trong DB) dùng cả bốn API.
  CUSTOMER và STAFF trả 403, token thiếu/sai trả 401.
- Chỉ quản lý tài khoản có Role CUSTOMER. ID của ADMIN/STAFF trả 404 như không tồn tại.
- Sửa được **fullName, email, phone**, gửi ít nhất một trường. Giữ nguyên trường
  không gửi. Không nhận Role, Status, Username, Password, UserID hoặc trường khác.
- Không xóa/khóa/mở khóa khách hàng trong phạm vi này. Status chỉ xem/lọc.
- Dùng các cột hiện có trong Users/Bookings/FootballFields. **Không cần migration
  hoặc chạy SQL mới trong SSMS.** Không tạo bảng/cột hay sửa dữ liệu thật khi phát triển.
- Contact schema đã kiểm tra bằng metadata: FullName NVARCHAR(100), Email VARCHAR(100),
  Phone VARCHAR(15); API giới hạn điện thoại Việt Nam 10 số bắt đầu 0.

## API contract chốt cho tester

### GET /api/admin/customers?keyword=&status=&page=1&pageSize=10

Tìm theo tên, username, email hoặc phone; keyword trim, tối đa 100 đơn vị UTF-16,
không chứa ký tự điều khiển. %, _ và [ được tìm như chữ, không dùng như wildcard.
status bỏ trống/ACTIVE/INACTIVE (normalize uppercase). page 1..1.000.000,
pageSize 1..50. Kết quả theo UserID giảm dần:

`{items:[customer],total,page,pageSize,totalPages}`.

Customer: `{customerId,username,fullName,email,phone,role,status,bookingCount}`.
Không trả PasswordHash. Empty search: 200, items=[], total=0. Trang vượt tổng
trả items=[] nhưng giữ total. Input query sai 400.

### GET /api/admin/customers/{customerId}

200 trả customer như trên, không có bookingCount (lịch sử cung cấp tổng riêng).
Khách inactive vẫn được ADMIN xem/cập nhật liên hệ, không đổi trạng thái.
customerId phải là SQL INT dương; không tồn tại hoặc không phải CUSTOMER: 404.

### GET /api/admin/customers/{customerId}/bookings?page=1&pageSize=10

200 `{customerId,items,total,page,pageSize,totalPages}`; item gồm bookingId,
fieldId,fieldName,fieldType,bookingDate,startTime,endTime,totalAmount,status.
Sắp ngày, giờ bắt đầu, BookingID giảm dần. Không lọc bỏ sân Archive; khách không
có booking trả danh sách rỗng. API chỉ đọc, không tự đồng bộ/hủy/thay trạng thái.
Không thêm truy vấn hay thao tác sửa Payment/Invoice.

### PUT /api/admin/customers/{customerId}

Ví dụ partial: `{"phone":"0912345678"}`.

- fullName string sau trim, 1..100 đơn vị UTF-16, không ký tự điều khiển.
- email ASCII, <=100 ký tự, đúng định dạng; trim + lowercase trước kiểm tra/lưu.
- phone ASCII `0[0-9]{9}` sau trim.
- Trường không gửi được giữ nguyên; unknown/forbidden fields trả 400, không âm thầm bỏ qua.
- Kiểm tra email/phone trùng trên **mọi tài khoản**, không chỉ CUSTOMER; ngoại trừ
  chính khách đang sửa. Trùng trả 409 CONTACT_ALREADY_USED.
- Ghi transaction SERIALIZABLE, khóa user, kiểm tra trùng và rollback khi lỗi.
  Tranh chấp/deadlock trả 409 CUSTOMER_CHANGED để thử lại; không ghi một phần.
- Chỉ UPDATE Users các cột contact đã thay đổi; không UPDATE Booking/Payment/Invoice,
  Username, Role, Status hoặc PasswordHash.
- 200 `{message,customer,updatedFields}`. No-op trả 200 với updatedFields=[].
- 400 validation, 401 JWT, 403 quyền, 404 target, 409 trùng/concurrency,
  413 body >16 KB, 500 lỗi hệ thống rollback, 503 DB unavailable.

Swagger: `backend/swagger.yaml`; Postman: `postman/UC13.postman_collection.json`.

## UI và chạy local

Admin → **Quản lý khách hàng** (`/admin/customers`): search/status/pagination,
chi tiết (`/admin/customers/{id}`), form contact và lịch sử booking.
Chỉnh sửa → chỉ gửi các trường thay đổi; Cancel khôi phục form không gọi PUT;
lỗi trùng giữ draft để sửa và gửi lại. Loading/empty/error/retry có riêng cho list
và lịch sử. Không có nút xóa, sửa Role, khóa tài khoản hay thay giao dịch.

Khởi động lại backend để nạp blueprint UC13. Frontend Vite nạp route mới.
Không cần chạy SQL bổ sung; người kiểm thử dùng fixture riêng cho các PUT.

## Kiểm chứng

- 158 API tests (20 test UC13 mới) và 2 health tests đạt; frontend production
  build và ESLint các file JS/JSX thay đổi đạt.
- 12 browser scenarios đạt: list/search/status/pagination/detail/history,
  partial update, duplicate/error/retry, cancel, khách không có booking.
- Unit/API: `tests/api/test_admin_customers.py`.
- SQL thật chỉ trên bảng tạm unique trong tempdb:
  `backend/scripts/verify_uc13_sql.py --output docs/uc13-evidence/sql-fixtures.json`.
  Tìm theo bốn loại thông tin, target role, inactive, partial update, trùng liên hệ,
  forbidden fields, concurrency 200/409 và không trùng email. Snapshot kiểm tra
  Booking/Payment/Invoice, Username/Role/Status/PasswordHash không đổi.
- Browser: `tests/uc13_browser_check.mjs`; API intercepted, toàn bộ dữ liệu QA giả.
  Screenshot và kết quả trong `docs/uc13-evidence/`.
- Chưa chạy PUT lên hồ sơ khách thật. Chưa push, chưa deploy, chưa nghiệm thu QA.

## Retest cho T123-133

1. ADMIN active/inactive, CUSTOMER, STAFF và token sai/hết hạn cho cả bốn API.
2. CUSTOMER A có booking; B không có; inactive; ID ADMIN phải 404.
3. Search tên/username/email/phone, status, empty, pagination và keyword có wildcard.
4. Detail/history đúng khách, giữ đơn đã hủy và sân Archive; GET không sửa DB.
5. PUT một hoặc cả ba trường; whitespace, dài, sai định dạng, trùng với khách khác
   hoặc Admin; no-op; forbidden fields; kiểm tra rollback và request đồng thời.
6. SQL trước/sau Users và snapshot lịch sử, xác nhận password/role/status không đổi.
7. UI list/search/detail/history/edit/cancel, lỗi và thử lại; regression các UC cũ.
