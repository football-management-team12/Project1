# Booking chưa cọc bị chuyển CONFIRMED/COMPLETED

## Nguyên nhân và hành vi sửa

- API PATCH status cũ chỉ kiểm tra sơ đồ trạng thái; ADMIN có thể xác nhận đơn có
  phí mà không có DEPOSIT SUCCESS, rồi chuyển COMPLETED cả khi chưa hết giờ thuê.
- UC09 yêu cầu COMPLETED và cọc thành công nên `canConfirm=false` ở các đơn lỗi;
  không thể sửa bằng cách bật nút thu tiền cho tất cả đơn chưa cọc.
- PaidAmount trên danh sách/detail cũ chỉ cộng DEPOSIT, bỏ khoản cuối và EXTRA.

Giờ booking có phí cần cọc SUCCESS để CONFIRMED/COMPLETED. Muốn COMPLETED phải
đã hết giờ thuê theo đồng hồ database. Booking miễn phí được miễn cọc, nhưng vẫn
phải hết giờ trước khi kết thúc lịch. UI dùng nhãn “Đã kết thúc lịch” để phân biệt
với thanh toán; không đổi tên giá trị trạng thái API/database.

GET danh sách/detail quản trị sau kiểm tra tài khoản sẽ đồng bộ hủy các booking
PENDING/CONFIRMED có phí, đã quá hạn và chưa có khoản thu. Hạn đang dùng lấy từ
deadline cọc còn hiệu lực hoặc DEPOSIT_DEADLINE_MINUTES của booking. Không tạo
scheduler nền; đồng bộ được thực hiện khi API này được gọi. Không hủy booking
miễn phí, đã có SUCCESS, Invoice có tiền/cờ PAID, hoàn cọc hoặc yêu cầu hủy đang
chờ xét duyệt. Không tự viết lại lịch sử COMPLETED.

Response danh sách/detail:

- `PaidAmount`: tổng SUCCESS thuộc DEPOSIT, FINAL_PAYMENT, EXTRA.
- `DepositAmount`: tổng DEPOSIT SUCCESS riêng.
- `CanConfirmBooking`, `CanCompleteBooking`: điều kiện hiển thị/khóa thao tác;
  backend kiểm tra lại khi PATCH, không tin trạng thái cũ trong trình duyệt.
- `RemainingAmount`: tổng tiền trừ các khoản thu hợp lệ.

Luồng thu cuối UC09 giữ nguyên: đã kết thúc lịch, có cọc SUCCESS, còn dư và chưa
có khoản cuối/Invoice PAID thì ADMIN thấy nút “Xác nhận đã thu đủ”. Khi thu xong,
danh sách/detail cũng phản ánh khoản cuối và số dư 0. Booking chưa cọc không được
hợp thức hóa bằng cách ghi khoản cuối; UI giải thích cần hủy/đối soát đơn lỗi.

## Đối soát dữ liệu cũ

Đơn cũ có phí, không có khoản thu nhưng đã bị chuyển COMPLETED cần được đối soát
riêng. Không cập nhật bản ghi thật trong quá trình kiểm tra bản sửa này.

`backend/scripts/repair_unpaid_completed_bookings.sql` dành cho SSMS, không phải
migration schema và không tự chạy khi deploy:

1. Kết nối đúng database backend đang dùng, local hoặc môi trường deploy.
2. Nhập `@BookingID` cần đối soát, giữ `@Apply=0`; chỉnh deadline cho khớp cấu hình. Chạy để xem
   database và bản ghi đủ điều kiện. Bản xem trước rollback, không sửa dữ liệu.
3. Chỉ khi bản ghi đúng và đủ điều kiện, đổi `@Apply=1`, chạy lại để chuyển
   CONFIRMED/COMPLETED chưa thu tiền sang CANCELLED và cọc PENDING sang EXPIRED.
4. Nếu không có candidate, cần đối soát; không bỏ các điều kiện bảo vệ để ép sửa.

Script chỉ sửa một BookingID được chỉ định, bảo vệ mọi khoản SUCCESS, Invoice có
tiền/cờ PAID, hoàn cọc, deadline PENDING còn hiệu lực và yêu cầu hủy PENDING_REVIEW.
Không tạo payment giả, không sửa/xóa số tiền hoặc invoice. Không áp dụng script
vào database thật trong quá trình phát triển bản sửa này.

## Kiểm chứng

- 106 API tests và 2 health tests đạt, gồm 8 test mới cho state/deposit/end-time,
  miễn phí, tiền đã thu, inactive manager và rollback lỗi đồng bộ.
- SQL Server fixture: 13 booking; bảo vệ cọc SUCCESS, EXTRA SUCCESS, Invoice có
  tiền, hoàn cọc, pending review, cọc còn hạn và miễn phí; hủy đơn hết hạn chưa thu.
  Kiểm tra kết thúc lịch → settlement canConfirm → thu tiền mặt → PaidAmount đủ,
  số dư 0 → chặn thu trùng. Script sửa dữ liệu được chạy cả preview/apply chỉ trên
  bảng tạm riêng trong connection, không ghi bảng ứng dụng.
- Edge headless với API fixtures: khóa xác nhận chưa cọc, khóa kết thúc trước giờ,
  đơn đã hủy không có nút kết thúc; nút thu đủ hiện khi hợp lệ, click/refresh đúng;
  đơn COMPLETED cũ chưa cọc hiện hướng dẫn và không có nút thu cuối.
- Frontend production build đạt. ESLint hai file React còn 3 lỗi set-state-in-effect
  và 1 cảnh báo dependency đã có trên HEAD trước thay đổi; không báo là lint đã đạt.

Chưa deploy và chưa sửa dữ liệu booking trên database thật.
