# UC07 — nâng cấp database

Chọn đúng database của ứng dụng trong SQL Server trước khi chạy. Sau các migration nền `001_users_username.sql`, `002_payments.sql`, chạy theo thứ tự:

1. `003_booking_cancellations.sql`
2. `004_cancellation_requests.sql`
3. `006_deposit_refunds.sql`
4. `007_cancellation_refund_account.sql`
5. `008_refund_evidence.sql`

Các script UC07 có thể chạy lại. Chúng tạo bảng/cột còn thiếu, giữ nguyên đơn, thanh toán và lịch sử hủy/hoàn cọc đã có. Bản hoàn cọc cũ không có biên lai vẫn được giữ nguyên; API yêu cầu mã giao dịch và biên lai cho lần xác nhận mới.

`BookingCancellations` là lịch sử hủy. `BookingCancellationRequests` lưu yêu cầu và tài khoản nhận tiền. `BookingDepositRefunds` lưu số tiền, người/thời gian xác nhận, mã giao dịch và biên lai. Không sửa thanh toán `SUCCESS` khi hoàn cọc.

Biên lai hỗ trợ PNG/JPEG/PDF tối đa 2 MB, lưu trong database cùng bản ghi hoàn cọc. API tải biên lai yêu cầu JWT của chủ đơn hoặc ADMIN đang hoạt động; không có đường dẫn tệp công khai.

Sau nâng cấp, khởi động lại backend và tải lại frontend. Tester thực hiện kiểm tra thủ công qua API/Swagger/Postman theo Jira T123-122.
