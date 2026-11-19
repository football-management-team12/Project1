# T123-182: Đánh giá sau khi hết giờ và thu đủ

## Nguyên nhân

Sau khi bỏ thao tác xác nhận đã đá xong, đơn có thể vẫn lưu `CONFIRMED` dù đã hết giờ và thu đủ. API đánh giá và nút trong lịch sử trước đây chỉ kiểm tra `Status=COMPLETED`, khiến khách không đánh giá được.

## Cách xử lý

- Hoàn thành khi đã đến giờ kết thúc theo múi giờ Việt Nam và tổng thu thành công trừ khoản đã hoàn đủ tổng tiền.
- Áp dụng với đơn `CONFIRMED` hoặc `COMPLETED`; loại đơn hủy và khách không đến.
- Trước giờ kết thúc, kể cả đã thu đủ, đơn vẫn chưa được đánh giá.
- Đồng bộ trạng thái hiển thị, nút đánh giá, API tạo/xem đánh giá, danh sách đánh giá công khai và số đơn hoàn thành trong báo cáo.
- Giữ giới hạn một đánh giá mỗi đơn và kiểm tra chủ sở hữu.
- Không cập nhật trạng thái trong database khi đọc dữ liệu; không cần migration hay sửa dữ liệu cũ.

`backend/services/booking_completion.py` chứa quy tắc hoàn thành dùng chung cho API đánh giá và biểu thức SQL của báo cáo/danh sách đánh giá.

## Kiểm chứng

- 226 kiểm thử API, gồm đơn CONFIRMED đã hết giờ/thu đủ, đúng mốc kết thúc, chưa hết giờ, thiếu tiền, hoàn tiền và NO_SHOW.
- `node tests/booking_collection_check.mjs`: trạng thái, số tiền và mốc giờ.
- `tests/uc10_browser_check.mjs`: 11 tình huống trên React với API giả lập, gồm đơn CONFIRMED đã hết giờ/thu đủ được đánh giá, chống gửi trùng, lỗi/thử lại và màn hình điện thoại.
- Frontend production build thành công.

Đã kiểm tra local bằng dữ liệu chỉ đọc: đơn #9030 được đánh giá, trạng thái gốc vẫn CONFIRMED; báo cáo ngày 16/11 có 6 đơn hoàn thành trên tổng 8 đơn.
