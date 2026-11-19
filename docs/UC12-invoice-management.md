# UC12 / T123-110 — Quản lý hóa đơn & thanh toán

## Phạm vi và contract

Chỉ ADMIN có JWT hợp lệ và Users.Status=ACTIVE được truy cập. CUSTOMER/STAFF trả 403;
thiếu/sai/hết hạn JWT trả 401. Cả ba API kiểm tra quyền, không chỉ ẩn nút trên UI.

- `GET /api/admin/invoices?status=&customer=&from=&to=&page=1&pageSize=20`
- `GET /api/admin/invoices/{invoiceId}`
- `PATCH /api/admin/invoices/{invoiceId}/status`

Danh sách chỉ chứa hóa đơn đã phát hành (có Invoices.InvoiceID), không tự tạo invoice.
Booking mới có cọc vẫn xem hóa đơn tạm tại UC08 hoặc quản lý đặt sân.
`customer` tìm chuỗi con theo tên/email, tối đa 100 ký tự; ký tự LIKE được escape.
`from`/`to` là ngày phát hành hóa đơn theo ngày SQL Server, dạng YYYY-MM-DD, bao gồm
cả ngày kết thúc. `status`: rỗng/tất cả, ACTIVE, CANCELLED, UNPAID, PARTIALLY_PAID, PAID.
Ba bộ lọc thanh toán loại hóa đơn quản trị đã hủy. ACTIVE gồm mọi hóa đơn chưa hủy.
Tham số lạ/trùng, trạng thái/ngày/phân trang sai trả 400. pageSize 1–100, mặc định 20.
Sắp xếp CreatedDate DESC rồi InvoiceID DESC; phân trang bằng page, trả hasNext.

Response danh sách: `{items: [invoice], page, pageSize, hasNext}`. Mỗi invoice:

```json
{
  "invoiceId": 20, "bookingId": 10, "bookingStatus": "COMPLETED",
  "invoiceStatus": "ACTIVE", "paymentStatus": "PARTIALLY_PAID", "status": "PARTIALLY_PAID",
  "totalAmount": 100000, "depositAmount": 30000, "paidAmount": 30000, "remainingAmount": 70000,
  "customer": {"userId": 1, "name": "Khách hàng", "email": "customer@example.test"},
  "field": {"name": "Sân 1", "location": "Test"},
  "createdDate": "2026-11-09T10:00:00", "bookingDate": "2026-11-09",
  "startTime": "18:00", "endTime": "19:00", "paymentMethod": "NOT_RECORDED",
  "canConfirm": false, "canCancel": false, "allowedTransitions": [], "cancellation": null
}
```

`canConfirm` giữ false từ hàm tính UC09; UI lấy điều kiện xác nhận thực từ API settlement
trong SettlementPanel. Không dùng trường này để tự bỏ qua kiểm tra UC09.
Detail bổ sung `payments` (paymentId/type/amount/status/method/reference/recordedAt)
và `refund` (amount/at hoặc null). Payment theo BookingID **hoặc** InvoiceID để không mất
cọc chưa liên kết InvoiceID. Không trả token, cấu hình DB hoặc thông tin tài khoản hoàn tiền.
Không tìm thấy invoice trả 404; dữ liệu số tiền không nhất quán trả 409.

## Trạng thái và bảo toàn UC trước

`invoiceStatus` là trạng thái quản trị riêng: ACTIVE hoặc CANCELLED.
`paymentStatus` luôn tính theo SUCCESS DEPOSIT + FINAL_PAYMENT + EXTRA, dùng nguyên `_summary`
của UC09. `status` của UC12 là CANCELLED khi đã hủy; nếu chưa hủy thì bằng paymentStatus.
Tiền hoàn cọc hiển thị riêng, không trừ khỏi lịch sử tiền đã thu.

Chuyển trạng thái duy nhất: **ACTIVE → CANCELLED**, với booking đã CANCELLED và
paidAmount=0, đồng thời cờ PaymentStatus lưu trong DB không phải PAID. Không cho hủy hóa đơn đã có khoản thu kể cả đã hoàn cọc; cần quy trình
điều chỉnh tài chính riêng nếu bổ sung nghiệp vụ này. Không hỗ trợ khôi phục hoặc
PATCH sang PAID/UNPAID/PARTIALLY_PAID. UI chỉ hiện thao tác theo allowedTransitions.

```json
{"status":"CANCELLED","reason":"Booking đã hủy, chưa thu tiền"}
```

reason bắt buộc, trim, 1–500 ký tự. Trường bổ sung như PaidAmount/amount bị từ chối.
Trạng thái đích/payload sai trả 400; không đủ điều kiện hoặc hủy trùng trả 409.
Thành công trả invoiceId, invoiceStatus/status=CANCELLED và message.

Hủy chỉ INSERT vào bảng mới InvoiceAdminCancellations: invoice, người thực hiện,
thời gian DB và lý do. PK InvoiceID chống bản ghi hủy trùng. Transaction SERIALIZABLE
khóa booking theo cách UC09, kiểm tra lại điều kiện và rollback khi lỗi.
Không UPDATE/DELETE Bookings, Payments, Invoices; không sửa schema/response UC06/07/08/09.
Điều kiện booking đã hủy khiến UC06/UC09 vốn đã từ chối tạo/xác nhận thu tiền tiếp.
Không gọi API hủy booking hoặc hoàn cọc từ PATCH này. Sân archive vẫn được đọc bằng LEFT JOIN.

UC08 vẫn phản ánh lịch sử tài chính, kể cả hóa đơn được đánh dấu hủy ở UC12.
Không thay nghĩa trạng thái thanh toán UC08 bằng trạng thái quản trị UC12.

## Giao diện

- `/admin/invoices`: danh sách, tìm kiếm, lọc, phân trang.
- `/admin/invoice-management/:invoiceId`: detail quản trị và lịch sử thanh toán.
- Giữ `/admin/invoices/:invoiceId` và `/admin/bookings/:bookingId/invoice` cho UC08 cũ.
- Xác nhận thu tiền tái sử dụng SettlementPanel và endpoint UC09 hiện có; có xác nhận
  trước khi gửi, chống nhấn lặp, làm mới số dư sau thành công.
- Hủy có lý do, xác nhận và làm mới sau lỗi xung đột. Có trạng thái tải/rỗng/lỗi/thử lại.

## Migration và kiểm thử bàn giao T123-131

Chạy `backend/migrations/010_uc12_invoice_cancellations.sql` đúng database trước khi
dùng UC12. Migration thêm một bảng, chạy lại được, không sửa dữ liệu cũ. Người dùng đã
chạy thành công qua SSMS; kiểm tra SELECT xác nhận bảng tồn tại trong DB cấu hình local.
Nếu rollback ứng dụng, có thể giữ bảng này;
UC trước không đọc bảng và vẫn hoạt động. Không cần xóa lịch sử audit.

Kiểm tra tự động:

```powershell
.\backend\venv\Scripts\python.exe -m unittest discover -s tests/api -p 'test_[a-z]*.py'
.\backend\venv\Scripts\python.exe -m unittest discover -s tests -p test_staging_health.py
cd frontend
npm run build
npx eslint src/pages/Admin/InvoiceManagement.jsx src/services/admin_invoice_service.js
```

Các bài test dùng JWT thật và SQL mock, không tạo dữ liệu thật. Hai file test21/test22
nhập token thủ công và gửi request ghi dữ liệu không được chạy trong discovery này.
Postman: `postman/UC12.postman_collection.json`; PATCH yêu cầu fixture QA riêng.

Kết quả kiểm tra dev:

- 44 API contract/regression tests và 2 health tests đạt; có UC07, UC08, UC09, email,
  mật khẩu và UC12. CI đã bổ sung chạy nhóm API không tương tác này.
- Frontend build và ESLint cho các file JS/JSX thay đổi đạt.
- 9 kiểm tra Edge headless đạt: danh sách, filter khách hàng, phân trang, rỗng,
  lỗi/thử lại, hủy hóa đơn giả lập, thu tiền qua UC09 giả lập, mobile và chặn CUSTOMER.
  Ảnh và kết quả ở `docs/uc12-evidence/`; toàn bộ API trình duyệt được intercept.
- 25 kiểm tra API với SQL thật trên 4 hóa đơn hiện có đạt; số tiền và trạng thái
  UC12 khớp UC08/UC09. Bảng migration 010 tồn tại. Không ghi dữ liệu, không tạo fixture.
  Script từ chối SQL ngoài SELECT và mọi commit; evidence `sql-readonly.json` chỉ lưu
  đường dẫn/status và số lượng, không lưu JWT hoặc thông tin cá nhân khách hàng.

Chạy lại SQL read-only bằng `backend/venv/Scripts/python.exe backend/scripts/verify_uc12_readonly.py`.
Kiểm tra UI: bật Vite cổng 5178 rồi `node tests/uc12_browser_check.mjs`.

Tester cần xác nhận trên DB QA sau migration: dữ liệu phát hành nhiều trạng thái,
deposit chưa link InvoiceID, refund, sân archive, phân trang/lọc theo ngày, role matrix,
hai PATCH đồng thời (một thành công/một 409), rollback khi INSERT lỗi và chạy đồng thời
với UC06/07/09. So sánh snapshot Bookings/Invoices/Payments trước/sau PATCH: không đổi;
chỉ một audit mới. Mocks không thay thế kiểm thử khóa/concurrency SQL Server thực tế.
