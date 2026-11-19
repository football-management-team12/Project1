# T123-161 — Booking 0 đồng không tạo cọc

## Contract

- Dùng **TotalAmount đã lưu trên server**, không tin amount/TotalAmount trong body.
- POST `/api/bookings/{bookingId}/deposit`: nếu tổng bằng 0, trả **200** với
  requiresDeposit=false, bookingStatus=CONFIRMED, status/currentPaymentStatus=NOT_REQUIRED,
  depositAmount/amount=0; payment/paymentId/vietQr/deadline=null, demoMode=false.
- Xác nhận PENDING → CONFIRMED, không dùng PAID làm trạng thái booking. Booking đã
  CONFIRMED có thể gọi lại; CANCELLED/COMPLETED không được xác nhận lại.
- Không INSERT Payments hoặc Invoices, không tạo QR hoặc SUCCESS 0 đồng giả.
- Các DEPOSIT PENDING cũ chuyển EXPIRED trong cùng transaction để không còn thu nhầm.
  Lịch sử FAILED/EXPIRED và các khoản SUCCESS không bị sửa/xóa.
- Nếu đã có bất kỳ Payment SUCCESS hoặc invoice có Amount/PaidAmount khác 0,
  trả 409 PAYMENT_MISMATCH/INVOICE_MISMATCH để đối soát; không tự điều chỉnh tiền.
- Nếu có yêu cầu hủy PENDING_REVIEW, trả 409 REQUEST_PENDING, giữ nghiệp vụ UC07.
- GET deposit của booking 0 đồng trả thông tin không yêu cầu cọc; không xác nhận
  booking hoặc cập nhật tài chính. Giao diện có nút xác nhận miễn phí khi còn PENDING.
- Các booking có tổng dương giữ HTTP 201 và cách tính cọc trước đó. Tổng âm vẫn lỗi.
- Chỉ CUSTOMER ACTIVE/chủ booking, JWT hợp lệ; transaction SERIALIZABLE, khóa booking,
  rollback khi lỗi. Body sửa tiền không làm booking trả phí thành miễn phí.

## Tương thích

- Không áp dụng timer hết hạn cọc cho booking 0 đồng vì không có nghĩa vụ đặt cọc.
  Các booking dương vẫn theo T123-162; sự kiện EXPIRED cũng không hủy booking 0 đồng.
- Demo SUCCESS trên payment cũ của booking tổng <=0 bị chặn, không thu cọc cũ.
- UC09 số dư 0 không cho ghi nhận thu tiền cuối; không tạo FINAL_PAYMENT 0 đồng.
- UC08 có thể xem bản tạm của booking miễn phí đã xác nhận/hoàn thành/đã hủy:
  isComplimentary=true, paidAmount=remainingAmount=0, paymentStatus=PAID theo số dư,
  invoiceId=null khi chưa phát hành. UI ghi rõ miễn phí, không ghi nhận cọc thành công.
- UC12 vẫn chỉ liệt kê invoice đã phát hành. Nếu có invoice 0 đồng hợp lệ từ trước,
  filter PAID lấy được và UNPAID không lấy; không tự phát hành invoice cho đơn miễn phí.
- UC07 không thêm hoàn tiền hay chặn hủy vì hóa đơn PAID giả, vì bản sửa không tạo invoice.

Không cần migration, không tự sửa TotalAmount của booking đang có hoặc dữ liệu tài chính thật.
Chuẩn bị fixture giảm giá/miễn phí trong DB QA riêng; không sửa tổng đơn đã thu tiền
để thử nghiệm trên dữ liệu khách hàng.

## Retest cho tester

1. Booking QA PENDING TotalAmount=0, không có SUCCESS/invoice sai: POST deposit → 200,
   CONFIRMED; Payments/Invoices không tăng, QR=null, số tiền vẫn 0.
2. Có cọc PENDING 200k từ trước: POST miễn phí → cọc cũ EXPIRED, không đổi Amount;
   không ghi SUCCESS. Gọi lại vẫn không tạo thêm dữ liệu.
3. GET/UI miễn phí: không QR, không đếm ngược, có nút xác nhận khi PENDING và thông báo
   đã xác nhận khi CONFIRMED; CANCELLED/COMPLETED không có nút xác nhận lại.
4. Thành công đã thu/invoice sai/review đang chờ: 409, rollback, không che số tiền cũ.
5. CUSTOMER khác/ADMIN/STAFF/inactive/token sai: từ chối theo role/ownership/JWT.
6. Booking dương 600k, body giả amount=0: vẫn tạo cọc 200k, HTTP 201.
7. Demo payment cũ SUCCESS sau khi TotalAmount=0: 409, không thu tiền; timer/sự kiện
   EXPIRED không vô tình hủy booking miễn phí.
8. Kiểm tra invoice/settlement 0 đồng, UC12 filter PAID/UNPAID; regression cọc dương,
   EXTRA T123-165, expiry T123-162/164, hủy UC07 và invoice UC08/12.
9. Hai POST miễn phí đồng thời và lỗi SQL giữa cập nhật cọc/booking trên QA riêng:
   không nhân đôi bản ghi, rollback đầy đủ, không ảnh hưởng booking/sân khác.

## Validation

- 92 API/regression tests đạt; positive-deposit/EXTRA/expiry/ownership/rollback vẫn đạt.
- Build frontend và ESLint cho DepositPanel/InvoiceDetail đạt.
- 3 tình huống Edge headless đạt: xác nhận miễn phí không QR/đếm ngược, đơn đã hủy
  không có nút xác nhận và luồng QR cọc dương 200k vẫn hoạt động. API được giả lập,
  evidence ở `docs/T123-161-browser-checks.json`.
- `backend/scripts/verify_t123_161_sql.py` thực thi Flask/JWT APIs với bảng #temp riêng
  trong một phiên SQL Server: GET/POST miễn phí, gọi lại, cọc cũ, xung đột lịch sử thu,
  đơn đã hủy và body giả tiền. Không ghi bảng ứng dụng thật, bảng #temp bị xóa khi đóng.
- Evidence: `docs/T123-161-sql-verification.json`. Concurrency giữa phiên độc lập vẫn
  cần QA; kiểm tra một phiên không chứng minh hành vi khóa đồng thời.

```powershell
.\backend\venv\Scripts\python.exe -m unittest discover -s tests/api -p 'test_[a-z]*.py'
.\backend\venv\Scripts\python.exe backend/scripts/verify_t123_161_sql.py
```
