# T123-176 — Dashboard quản trị dùng dữ liệu thực

Nhánh local: `feature/T123-176-admin-dashboard`. Chưa commit, push hay tạo PR.

## Phạm vi

- `/admin`: lời chào tài khoản, ngày Việt Nam, làm mới, bỏ card Vai trò hiện tại.
- ADMIN: 4 KPI, tối đa 7 đơn hôm nay, yêu cầu hủy chờ và đánh giá chưa phản hồi, doanh thu 7 ngày và mức sử dụng sân hôm nay.
- STAFF: chỉ lịch hôm nay và lượt đặt theo ngày; không gọi báo cáo, yêu cầu hủy hay đánh giá admin.
- Không có thao tác duyệt hủy/thu tiền trên dashboard. Link sang trang nghiệp vụ và đúng chi tiết đơn/đánh giá.
- Loading/error/empty từng khối, refresh và tự làm mới 30 giây khi tab hiển thị; đổi ngày tự tải lại.
- Không dùng số liệu mẫu hoặc phần trăm tăng trưởng trong sản phẩm.

## API

- Mới: `GET /api/management/dashboard/schedule?date=YYYY-MM-DD`. JWT ADMIN/STAFF, kiểm tra lại role/status trong DB, chỉ SELECT, trả count và TOP 7 theo giờ bắt đầu. Ngày mặc định là ngày Việt Nam, `Cache-Control: no-store`.
- Tái dùng `GET /api/admin/reports/summary` cho khoảng 7 ngày và riêng ngày hôm nay; đọc `revenue`, `dailyRevenue`, `fieldUtilization`.
- Tái dùng cancellation inbox từ AdminLayout: `GET /api/admin/cancellation-requests?status=PENDING_REVIEW`.
- Tái dùng `GET /api/admin/reviews?status=unanswered&pageSize=3` và `unansweredCount`.
- Tái dùng `/api/time` qua clock hiện có.

Doanh thu giữ định nghĩa UC16: khoản thu thành công trừ khoản hoàn đã xác nhận, theo ngày ghi nhận database của báo cáo (`dateBasis=database-local`). Khoảng báo cáo được chọn bằng ngày Việt Nam, không tự đổi cách nhóm ngày trong UC16. Biểu đồ có đường 0, cột âm và bảng số liệu.

Lượt đặt là tất cả đơn có BookingDate hôm nay, gồm mọi trạng thái. Trạng thái lịch là trạng thái booking gốc từ backend; không dùng nhãn thanh toán hoặc sự kiện vận hành thay thế. Mức sử dụng là giờ đặt CONFIRMED/COMPLETED gộp khung trùng, mẫu số 24 giờ/sân/ngày, không phải thông tin sân đang trống.

## File thay đổi

- Backend: `routes/dashboard.py`, đăng ký trong `app.py`, hợp đồng Swagger.
- Frontend: `pages/Admin/Admin.jsx`, `Dashboard.css`, deep link trong BookingManagement và ReviewManagement; thêm cờ loading cho cancellation inbox.
- Test: `tests/api/test_dashboard.py`, `tests/dashboard_browser_check.mjs`.
- Bằng chứng: `docs/T123-176-evidence/desktop.png`, `mobile.png`, `checks.json`.

## Kiểm tra

- 214 test API đạt (6 test endpoint mới), gồm quyền, tài khoản bị thu hồi quyền, tham số ngày, số 0 và lỗi DB.
- 7 nhóm browser check đạt: desktop 4 KPI, lịch/chi tiết, review/filter, mobile, lỗi riêng báo cáo và retry, dữ liệu rỗng/0/âm, STAFF không gọi API ADMIN.
- ESLint các module dashboard/review/inbox thay đổi đạt; build frontend đạt.
- Kiểm tra GET trên dữ liệu local thật: schedule, báo cáo hôm nay, reviews và cancellation inbox đều HTTP 200; không ghi dữ liệu booking/payment.

## Tách công việc local

Sửa T123-175 chưa commit được lưu tại stash có tên `T123-175 local UI review pending before T123-176`, không đưa sang nhánh này. Cấu hình DB và AdminCommon.css có sẵn ngoài phạm vi được giữ nguyên ở local.

Không thay đổi nghiệp vụ đặt/hủy/thanh toán, không có migration mới. Các hạn chế báo cáo đã ghi ở T123-170/T123-174 không được sửa trong task dashboard.
