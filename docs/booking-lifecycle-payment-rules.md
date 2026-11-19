# Quy tắc trạng thái sân, thanh toán và yêu cầu hủy

## Vòng đời đơn

- PENDING: chờ xác nhận/cọc, không suy ra đã đá từ thời gian.
- CONFIRMED trước giờ bắt đầu: đã xác nhận, kể cả khách đã trả đủ trước.
- CONFIRMED trong khung giờ: hiển thị Đang đá theo giờ Việt Nam. Đây là thời gian đặt sân, không phải bằng chứng khách đã check-in.
- CONFIRMED sau giờ kết thúc: hiển thị Đã kết thúc / hết giờ, chờ chủ sân xác nhận thực tế.
- Chủ sân dùng “Xác nhận đã đá xong” để lưu COMPLETED khi buổi đá kết thúc, có thể kết thúc sớm thực tế.
- COMPLETED nhưng thiếu tiền: hiển thị Đã kết thúc / hết giờ và Chưa thu đủ.
- COMPLETED và thu đủ: Hoàn thành. Định nghĩa này khớp báo cáo UC16: trạng thái COMPLETED và tổng thu ròng đủ tổng tiền.
- CANCELLED: luôn là đã hủy; ghi chú/yêu cầu hủy và thanh toán không đổi nhãn vòng đời này.

Thời gian chỉ tạo trạng thái hiển thị, không tự sửa dữ liệu hoặc xác nhận khách thực sự đã đá. Bộ lọc và thống kê trên admin/khách sử dụng cùng helper `bookingDisplayStatus` với danh sách. Khách lọc trên tập đơn của chính mình đã lấy qua API JWT, không gửi trạng thái hiển thị mới vào bộ lọc trạng thái DB cũ.

## Thanh toán

- Cọc là tổng SUCCESS loại DEPOSIT; giữ riêng cột Đã cọc.
- Tổng đã thu là SUCCESS dương loại DEPOSIT/FINAL_PAYMENT/EXTRA; trừ khoản hoàn đã xác nhận khi tính thu ròng.
- Còn lại = max(Tổng tiền - Thu ròng, 0). Chi tiết không còn dùng riêng tiền cọc làm tổng đã thu.
- Nhãn thanh toán tách khỏi trạng thái sân. Thanh toán trước không tự hoàn thành buổi đá.
- Đơn đang đá/đã kết thúc mà thiếu tiền tô vàng; thu đủ bỏ vàng. Chỉ chuyển Hoàn thành khi chủ sân đã xác nhận kết thúc.
- Cho phép chủ sân ghi nhận khoản tiền còn lại khi đơn CONFIRMED hoặc COMPLETED, vẫn giữ kiểm tra cọc, vai trò ADMIN, chống thu trùng, transaction Payment/Invoice. Không tự cập nhật Booking thành COMPLETED khi thu tiền.
- Đơn hủy không thể thu khoản thanh toán cuối. Không đổi quy tắc hoàn tiền.

## Yêu cầu hủy

- Khách gửi trước giờ bắt đầu hơn 2 tiếng, mốc bằng 2 tiếng bị khóa; API kiểm tra lại khi POST.
- Yêu cầu gửi đúng hạn có thể xét sau hạn gửi, nhưng không cho APPROVED từ giờ bắt đầu trở đi. Vẫn có thể REJECTED để giải quyết yêu cầu tồn.
- Admin hủy trực tiếp là thao tác riêng của chủ sân, không được xem là quyền hủy của khách.
- Từ chối giữ sân, giữ cọc, khóa gửi lại. Lịch sử quyết định không thay thế vòng đời đơn.
- Quyết định theo nút Cho phép hủy / Không cho phép hủy; không suy luận từ nội dung ghi chú.

## Kiểm tra

- 194 test API đạt, gồm xác nhận thu tiền khi CONFIRMED và không tự kết thúc Booking, chặn duyệt hủy sau giờ bắt đầu, và số tiền còn lại dùng tổng đã thu.
- `node tests/booking_collection_check.mjs`: biên thời gian, trả trước, đang đá, kết thúc, thu đủ/thiếu, hoàn tiền, đơn hủy.
- Edge fixtures (không ghi DB): `booking_lifecycle_admin_check.mjs`, `booking_lifecycle_customer_check.mjs`, `cancellation_result_browser_check.mjs`, `cancellation_notification_browser_check.mjs` đạt.
- Production build đạt. Lint helper, payment badge và BookingHistory đạt; các lỗi setState trong effect đã có ở Admin BookingManagement, BookingDetail và SettlementPanel vẫn còn.

Không migration, không sửa dữ liệu nghiệp vụ cũ trong lần chuẩn hóa này. Chưa commit/push.
