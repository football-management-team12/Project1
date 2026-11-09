# T123-164 — Demo Payment EXPIRED đồng bộ Booking CANCELLED

## Contract và phạm vi

Endpoint giữ nguyên: `PATCH /api/payments/{paymentId}/demo-status`, CUSTOMER ACTIVE,
JWT hợp lệ, chỉ payment thuộc booking của mình, PAYMENT_DEMO_MODE=true.
Body: `{"status":"EXPIRED"}`.

Khi DEPOSIT PENDING chuyển EXPIRED, cùng transaction SERIALIZABLE sẽ hủy booking
PENDING đủ điều kiện. Đây là sự kiện demo chủ động, không cần đợi Deadline qua như
expiry theo thời gian T123-162. Response giữ nguyên cấu trúc payment hiện có.

Các guard giữ booking:

- Đã có bất kỳ payment SUCCESS (không xóa/ghi đè lịch sử tài chính).
- Có DEPOSIT PENDING khác còn deadline tương lai hoặc deadline chưa xác định.
- Có yêu cầu hủy PENDING_REVIEW theo UC07.
- Booking đã CONFIRMED/COMPLETED/CANCELLED, không phải PENDING.
- Payment đích không thuộc booking, không phải DEPOSIT hoặc chưa EXPIRED.

Gửi EXPIRED lần nữa cho payment đã EXPIRED sẽ kiểm tra đồng bộ booking, sửa trường
hợp legacy payment đã hết hạn nhưng booking còn PENDING. Không cập nhật lại payment,
không sinh payment/invoice/audit mới, không đổi số tiền. Gửi SUCCESS/FAILED đã ở trạng
thái cuối sang EXPIRED vẫn trả 409. FAILED không hủy booking để khách còn thử lại;
SUCCESS vẫn xác nhận booking và giữ kiểm tra deadline/chống trùng trước đó.

Payment và booking commit cùng nhau. Lỗi cập nhật booking hoặc chuẩn hóa response
đều rollback trước commit. Không có migration, không sửa schema/dữ liệu khách hàng
bằng script dev. Helper timer T123-162 được giữ nguyên.

## Retest

1. Dùng booking QA riêng PENDING, DEPOSIT PENDING, không có thu thành công/yêu cầu hủy.
2. CUSTOMER chủ booking PATCH EXPIRED: HTTP 200, payment.status=EXPIRED. SQL xác nhận
   Payments.Status=EXPIRED và Bookings.Status=CANCELLED cùng lúc; Amount giữ nguyên.
3. GET booking/deposit và availability để xác nhận trạng thái mới và lịch đã giải phóng.
4. Gửi lại EXPIRED: 200, không tạo giao dịch mới; thử fixture legacy EXPIRED/PENDING để
   xác nhận booking được đồng bộ dù không có chuyển trạng thái Payment mới.
5. Chạy các guard phía trên: booking không bị hủy khi có receipt SUCCESS, payment mới
   còn hiệu lực, PENDING_REVIEW hoặc trạng thái CONFIRMED/COMPLETED.
6. CUSTOMER khác: 404; ADMIN/STAFF hoặc account inactive: 403; thiếu/sai/hết hạn JWT:
   401. PAYMENT_DEMO_MODE=false: 403 và không truy cập DB để thay đổi payment.
7. Thử SUCCESS/FAILED và terminal-state transitions để xác nhận không hồi quy UC06.
8. QA riêng: tạo lỗi SQL giữa hai UPDATE và hai request EXPIRED/SUCCESS đồng thời;
   lưu request/response (ẩn token), SQL trước/sau, build/env, Actual vs Expected.

## Kiểm tra dev

- 75 API/regression tests và 2 health tests đạt.
- 11 test mới dùng Flask/JWT thật, SQL mock: thứ tự cập nhật, commit/rollback,
  idempotency, SUCCESS/FAILED, ownership/role, mode tắt và serialization trước commit.
- SQL Server kiểm tra 12 booking bằng biến bảng trong phiên, gửi sự kiện hai lần.
  Bao gồm EXPIRED trước deadline, các guard và payment không thuộc booking.
- Evidence: `docs/T123-164-sql-verification.json`. Không ghi bảng thật, không commit
  dữ liệu khách. Biến bảng không thay thế kiểm thử khóa trên DB QA thực.

```powershell
.\backend\venv\Scripts\python.exe -m unittest discover -s tests/api -p 'test_[a-z]*.py'
.\backend\venv\Scripts\python.exe backend/scripts/verify_t123_164_sql.py
```
