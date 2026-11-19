# Nghiệp vụ quản lý đặt sân

- Không có nút xác nhận đã đá xong. Hết khung giờ tự hiển thị trạng thái hết giờ. Đơn đến giờ nhưng thiếu tiền tô vàng; thu đủ trở về trắng.
- Không yêu cầu xác nhận khách đến. Trạng thái Đang đá theo khung giờ. Chỉ hiện và cho phép xác nhận thu đủ từ giờ bắt đầu, API kiểm tra lại khi ghi nhận.
- Chủ sân đánh dấu khách không đến sau giờ kết thúc, bắt buộc nhập lý do, không tự động. Không hoàn cọc thực nhận, không thu thêm; tiền trả trước vượt cọc chuyển chờ hoàn có bằng chứng.
- Phải xử lý yêu cầu hủy đang chờ trước khi đánh dấu không đến.
- Khách gửi hủy trước giờ bắt đầu hơn 2 tiếng, kể cả đã trả đủ. Yêu cầu đúng hạn được xét muộn nếu chưa check-in hoặc kết thúc thực tế. Hủy trực tiếp sau giờ bắt đầu bị chặn.
- Từ chối hủy giữ sân và khóa gửi lại. Lịch sử từ chối không thay thế trạng thái buổi đá.
- Hoàn tiền tính toàn bộ khoản đã thu, cần bằng chứng và chống hoàn trùng.
- Đính chính quyết định cần lý do. Khôi phục chỉ trước giờ kết thúc, chưa hoàn và không trùng lịch. Đổi từ chối thành đồng ý chỉ trước giờ bắt đầu. Lưu người xử lý, thời gian và snapshot dữ liệu cũ, không xóa lịch sử. Snapshot nội bộ chỉ dành cho admin.
- Đơn xác nhận thủ công chưa có cọc vẫn thu toàn bộ tại sân được. Thu đủ làm QR cọc đang chờ hết hiệu lực, giữ nguyên giao dịch thành công.
- Giao diện đồng bộ /api/time, hiển thị giờ Việt Nam; API kiểm tra thời gian tại mỗi thao tác. DATABASE_TIMEZONE_OFFSET_MINUTES mặc định 0, mô tả múi giờ DB cũ. Local đã kiểm tra UTC. Sự kiện mới lưu UTC.
- Chạy migration 013_booking_operations.sql trước khi khởi động. Local đã áp dụng, không sửa đơn hoặc giao dịch cũ.

Tài liệu này thay thế những quy tắc cũ mâu thuẫn trong booking-lifecycle-payment-rules.md, gồm suy ra khách đang đá chỉ từ giờ và chặn mọi yêu cầu đúng hạn nhưng xét muộn.
