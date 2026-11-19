# T123-177 — Lọc booking theo ngày và đồng bộ KPI

Nhánh: `feature/T123-177-booking-date-filter`, từ `origin/develop` sau PR #117. Đã bàn giao local để người dùng kiểm tra; sau đó người dùng yêu cầu commit, push và merge vào develop.

## Hành vi

- Mở/reload `/admin/bookings`: ngày hiện tại tại Việt Nam qua clock đồng bộ máy chủ, không dùng ngày UTC làm mặc định.
- Bộ lọc ngay sau trạng thái: Một ngày / Khoảng ngày, hai đầu tính bao gồm, nút Hôm nay và nhãn Đang xem dạng dd/MM/yyyy.
- Chọn ngày hợp lệ áp dụng ngay. Thiếu ngày/ngược đầu cuối báo lỗi và giữ phạm vi hợp lệ gần nhất, không gửi truy vấn sai.
- Quá khứ/tương lai được phép, năm 1900–9998; không giới hạn số ngày trong một khoảng.
- API chỉ nhận ngày cho trang này; keyword và trạng thái được lọc tiếp tại frontend bằng AND. Cả 8 KPI lấy toàn bộ đơn trong phạm vi ngày, không phụ thuộc keyword/trạng thái.
- Mọi nhóm trạng thái dùng bookingDisplayStatus hiện có, không sửa quy tắc booking/payment/operation.
- Ngày rỗng: 8 KPI bằng 0 và thông báo không có đơn trong khoảng thời gian đã chọn. Loading hiển thị …; lỗi hiển thị — và thông báo trong trang, không giả số 0.
- Inbox yêu cầu hủy là tác vụ độc lập, không giới hạn ngày và có ghi chú rõ ràng.
- Refresh, polling, cập nhật thanh toán/trạng thái/hủy dùng cùng phạm vi đã chọn. Request cũ bị abort khi đổi ngày; kết quả được gắn key theo user/range/revision, không ghi đè dữ liệu mới. Poll kế tiếp chỉ lên lịch sau khi request trước kết thúc, không alert lỗi tự động.
- Bổ sung theo yêu cầu sau review: nút Hôm nay ngay sau Tháng này ở Thống kê & báo cáo, đặt from/to về cùng ngày Việt Nam và tải ngay. Tháng này cũng tái dùng clock đồng bộ máy chủ.

## API

`GET /api/bookings/?from=2026-11-16&to=2026-11-20`

- JWT ADMIN/STAFF, giữ kiểm tra role/status DB hiện có.
- `from` và `to` cùng có hoặc cùng bỏ, YYYY-MM-DD, validation trước khi mở kết nối; duplicate param bị từ chối.
- SQL parameterized: `B.BookingDate >= ? AND B.BookingDate <= ?`, không dùng CreatedAt.
- Kết hợp được status/search ở API cho các caller hiện có. Bỏ ngày giữ nguyên hợp đồng toàn lịch sử để tránh hồi quy caller cũ.
- Không đổi schema DB, không có migration.

## File

- `backend/routes/booking.py`, `backend/swagger.yaml`: lọc và tài liệu hợp đồng.
- `frontend/src/services/booking_service.js`: truyền ngày và AbortSignal.
- `frontend/src/hooks/useBookingRange.js`: tải đúng phạm vi, polling, abort/race, refresh.
- `frontend/src/utils/bookingDateRange.js`: validation và định dạng nhãn ngày.
- `frontend/src/pages/Admin/BookingManagement.jsx`, `BookingManagement.css`: điều khiển ngày, lỗi/empty/loading, inbox note và KPI.
- `tests/api/test_booking_date_filter.py`: 5 test mới.
- `tests/booking_date_filter_browser_check.mjs`: kiểm tra UI thật bằng API giả lập.
- `docs/T123-177-evidence`: desktop/mobile và checks.json.

## Kiểm tra

- 219 test API đạt, gồm 5 test mới: thiếu/sai/ngược/duplicate ngày; ngày nhuận/quá khứ/tương lai; parameterized và kết hợp status/search; tương thích caller không truyền ngày; ADMIN/STAFF và chặn CUSTOMER/guest.
- 12 nhóm browser check đạt: default ngày và 8 KPI, AND search/status, khoảng bao gồm hai đầu, inbox độc lập, giữ ngày khi refresh/poll, invalid range, empty, stale response, error/retry không alert, mobile, chi tiết/thu đủ giữ ngày, 00:30 VN/UTC hôm trước, STAFF.
- Đối chiếu GET trên DB local thật với danh sách toàn bộ: ngày 16/11/2026 trả 8 đơn; khoảng 16–20/11 trả 9 đơn; ngày tương lai rỗng trả 0. So khớp tập BookingID theo BookingDate, không sửa dữ liệu.
- Build frontend, lint hook/helper mới và Swagger YAML đạt.

Phần T123-175 vẫn giữ riêng trong stash có tên. Cấu hình DB và AdminCommon.css có sẵn không thuộc task.
