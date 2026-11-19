# T123-73: sửa bộ lọc và tải lại lịch trống

Nhánh: `bugfix/T123-73-field-list-availability`, tạo từ develop.

## Lỗi và cách tái hiện

- Chọn ngày ở `/fields`, rồi bấm “Xóa bộ lọc”: ngày và lịch trống vẫn còn, nút đặt sân vẫn dùng ngày cũ.
- Khi API lịch trống mất hơn 30 giây, `setInterval` gửi thêm yêu cầu trước khi yêu cầu trước hoàn tất. Phản hồi cũ về muộn có thể ghi đè lịch vừa tải.

## Thay đổi

- Theo yêu cầu cập nhật: mở `/fields` tự chọn ngày hiện tại và tải lịch trống ngay. Xóa bộ lọc trả ngày về hôm nay và tải lại lịch nếu đã đổi ngày; nếu đang xem hôm nay thì giữ kết quả hiện tại.
- Đổi ngày xóa lịch cũ ngay; chỉ dùng kết quả gắn với đúng ngày đã chọn.
- Lần tải tự động tiếp theo bắt đầu sau khi lần trước hoàn tất 30 giây. Đổi ngày hoặc rời trang hủy bộ hẹn giờ; phản hồi của ngày cũ bị bỏ qua.

## Kiểm tra

- `npm.cmd run build`: đạt.
- `npx.cmd eslint src/pages/FieldList/FieldList.jsx`: đạt.
- `node tests/field_availability_browser_check.mjs`: 5 kiểm tra đạt; xem `T123-73-evidence/checks.json`.
- Trình duyệt Edge thật, API giả lập được chặn hoàn toàn: vào trang tự chọn hôm nay và hiển thị lịch; tải chậm không chồng yêu cầu; đổi ngày khóa nút dùng lịch cũ; phản hồi ngày cũ không ghi đè; xóa bộ lọc trả về hôm nay và hiển thị lịch.
- Kiểm tra tăng tốc bộ hẹn giờ 30 giây thành 150 ms để mô phỏng phản hồi chậm, không truy cập hoặc sửa dữ liệu nghiệp vụ.

T123-73 là task chức năng gốc, hiện Done; bản sửa này không xác nhận nghiệm thu QA hoặc triển khai production.
