# T123-162 — Đồng bộ hết hạn cọc trong database

## Thay đổi

Trước đây kiểm tra availability chỉ hủy booking quá hạn, để Payment PENDING trong DB.
GET deposit có một luồng cập nhật riêng, tính hạn từ CreatedAt của booking thay vì
Deadline đã lưu trên payment; hai đường xử lý có thể trả trạng thái khác nhau.

Hiện cả availability và GET deposit dùng `expire_pending_bookings`:

- Chỉ DEPOSIT PENDING đã tới hạn mới chuyển thành EXPIRED; cập nhật UpdatedAt.
- Deadline đã lưu là nguồn chính. Khi chưa có deadline/payment, dùng CreatedAt và
  DEPOSIT_DEADLINE_MINUTES (mặc định 10 phút, tối thiểu 1 phút).
- Booking PENDING hết hạn chuyển CANCELLED khi không còn cọc PENDING với deadline
  tương lai, không có khoản thanh toán SUCCESS và không có yêu cầu hủy PENDING_REVIEW.
- Không đổi SUCCESS/FAILED/EXPIRED, không hủy booking CONFIRMED/COMPLETED, không sửa
  số tiền, invoice hoặc lịch sử hoàn cọc.
- GET `/api/bookings/{bookingId}/deposit` kiểm tra JWT/quyền/chủ booking trước cập nhật,
  khóa booking trong transaction SERIALIZABLE, chỉ xử lý booking của request đó,
  đọc lại booking/payment và commit hai trạng thái cùng nhau. Lỗi bất kỳ rollback.
- Response giữ các trường hiện có; deadline/isExpired theo deadline của payment mới
  nhất nếu có, không giả trạng thái EXPIRED chỉ trên JSON mà bỏ quên DB.
- Availability xử lý các bản ghi tới hạn trong transaction của endpoint gọi helper.
  Đây là expiry khi có request kiểm tra cọc/lịch trống/tạo booking; không thêm scheduler.

Không có migration hoặc yêu cầu thêm bảng. T123-164 (PATCH demo EXPIRED) không nằm
trong bản sửa này; các rule ở luồng PATCH vẫn giữ nguyên.

## Retest cho tester

1. Trên DB QA, chuẩn bị CUSTOMER ACTIVE A/B, booking PENDING và DEPOSIT PENDING có
   Deadline đã qua. Với fixture khác, để CreatedAt mới nhưng Deadline quá hạn để
   xác nhận hệ thống thực sự dùng Deadline payment.
2. CUSTOMER A GET deposit booking của mình: 200, payment/currentPaymentStatus EXPIRED,
   booking CANCELLED, isExpired=true. Đối chiếu SQL cả Bookings và Payments, UpdatedAt.
3. Gọi lại: trạng thái giữ nguyên, không sinh payment mới hoặc sửa số tiền.
4. Chạy tương tự qua availability: cọc quá hạn không còn PENDING trong DB; lịch được
   giải phóng cho booking không còn hiệu lực.
5. Deadline tương lai dù CreatedAt đã cũ: giữ PENDING. Nếu có payment cũ quá hạn và
   payment mới còn hạn, chỉ payment cũ hết hạn, không hủy booking còn cọc đang hiệu lực.
6. Cọc SUCCESS: không hủy booking; booking có PENDING_REVIEW giữ chỗ theo UC07, nhưng
   payment PENDING đã hết hạn vẫn chuyển EXPIRED. CONFIRMED/COMPLETED không bị hủy.
7. CUSTOMER B/ADMIN/STAFF hoặc tài khoản inactive không được dùng GET này để cập nhật
   booking A. Lỗi DB giữa hai UPDATE phải rollback cả hai.
8. Retest xác nhận cọc gần thời điểm deadline đồng thời với expiry trên dữ liệu QA;
   chỉ một kết quả tài chính hợp lệ, không hủy booking đã ghi nhận thu tiền thành công.

## Kiểm tra dev

- 64 API/regression tests đạt, gồm 8 test mới cho ownership, deadline, rollback,
  response và các luồng thanh toán/hóa đơn hiện có.
- SQL Server: 12 booking, 11 payment ở hai chế độ all/scoped, chạy expiry hai lần.
  Kiểm tra đúng trạng thái, không đổi SUCCESS, giữ review/future deadline và idempotency.
  Chỉ dùng biến bảng trong phiên SQL, không ghi bảng thật hoặc commit dữ liệu khách.
- Evidence: `docs/T123-162-sql-verification.json`.
- Kiểm thử khóa đồng thời trên bảng QA thật và fault injection SQL thực vẫn cần tester;
  fixture biến bảng không chứng minh tính chất khóa/concurrency.

```powershell
.\backend\venv\Scripts\python.exe -m unittest discover -s tests/api -p 'test_[a-z]*.py'
.\backend\venv\Scripts\python.exe backend/scripts/verify_t123_162_sql.py
```
