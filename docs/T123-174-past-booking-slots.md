# T123-174 — chặn đặt khung giờ đã qua

Nhánh: `bugfix/T123-174-past-booking-slots`, từ develop sau PR #114.

Nguyên nhân: availability chỉ kiểm tra bảo trì và lịch bị trùng; POST booking chỉ chặn ngày cũ, không chặn giờ bắt đầu đã qua trong hôm nay.

Quy tắc: theo giờ Việt Nam UTC+7, nếu thời điểm bắt đầu <= hiện tại thì không cho tạo booking mới. Khung giờ đang diễn ra cũng không cho đặt mới. Khi mọi khung hôm nay đều đã bắt đầu (ví dụ lúc 23:00), tất cả nút đặt sân hôm nay bị khóa. Ngày mai và các khung tương lai vẫn đặt được; không thêm giờ đóng cửa cố định ngoài lịch giá hiện có.

- Hai API availability trả `available=false`, `reason=PAST_TIME`; số khung/sân trống và `availableOnly` dùng kết quả đã loại giờ quá hạn.
- POST booking trả 400 `PAST_TIME` trước truy cập DB và kiểm tra lại ngay trước INSERT để tránh vượt giờ trong lúc xử lý. Không đổi booking hoặc giao dịch cũ.
- FieldCard và Booking hiển thị “Đã qua giờ”. Đồng hồ UI cập nhật mỗi giây và khi cửa sổ nhận focus, chặn cả phản hồi availability cũ. Nút tiếp tục của khung đã chọn cũng khóa khi đến giờ; thao tác tiếp tục kiểm tra lại thời gian.
- Ngày mặc định và min date ở Fields/Booking dùng Asia/Ho_Chi_Minh, thống nhất với API kể cả máy chạy UTC.

Kiểm tra:

- 186 test API đạt, gồm biên trước/đúng/sau giờ bắt đầu, qua nửa đêm, ngày mai, bảo trì, lịch đã đặt, cả hai endpoint availability, availableOnly và POST trực tiếp.
- 5 kịch bản Edge đạt với clock giả lập và API cố ý vẫn trả available=true: khóa hôm nay lúc 23h, ngày mai còn đặt được, tự khóa trang đang mở, trang Booking chặn giờ cũ và khóa nút tiếp tục khi khung đã chọn bắt đầu.
- `npm.cmd run build`: đạt.
- ESLint FieldCard, FieldList, useBookingClock và bookingTime: đạt. Booking.jsx còn hai lỗi `react-hooks/set-state-in-effect` đã tồn tại trong HEAD, xác nhận bằng lint nội dung `git show HEAD:frontend/src/pages/Booking/Booking.jsx`; bản sửa không thêm lỗi lint mới.
- Bằng chứng trình duyệt: `docs/T123-174-evidence/checks.json`. Chạy Vite cổng 5188 rồi `node tests/past_booking_browser_check.mjs`.

Chưa commit/push hoặc cập nhật trạng thái Jira.
