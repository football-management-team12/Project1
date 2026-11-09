# T123-163 — Payment cuối trạng thái và lỗi định tuyến

## Kết quả kiểm tra

- Logic hiện tại đã trả JSON HTTP 409 `PAYMENT_ALREADY_FINAL` khi CUSTOMER ACTIVE
  sở hữu payment chuyển SUCCESS sang FAILED. Không cần sửa logic tài chính.
- Trước thay đổi, PATCH `/api/payments/19/demo-status/` có dấu `/` cuối trả HTML
  404; URL không có dấu `/` cuối đi vào route (thiếu token trả JSON 401).
- Đây là một trường hợp tái hiện được lỗi định tuyến giống mô tả Jira. Ticket ghi
  URL không có dấu `/` cuối nên chưa đủ bằng chứng kết luận nguyên nhân lần báo lỗi
  ban đầu; môi trường/baseUrl hoặc phiên bản deploy vẫn cần được kiểm tra khi retest.

## Thay đổi

Route demo-status chấp nhận cả URL có và không có dấu `/` cuối bằng
`strict_slashes=False`. Cả hai đi qua cùng JWT, kiểm tra vai trò và service.
Không thay đổi database, cách tính tiền, quyền sở hữu hay quy tắc chuyển trạng thái.

## Kiểm chứng

`tests/api/test_payment_final_status.py` dùng Flask app thật, JWT test và DB mock:

- SUCCESS → FAILED: cả hai dạng URL trả JSON 409, không ghi dữ liệu, rollback.
- Các chuyển đổi khác giữa trạng thái cuối vẫn trả 409.
- SUCCESS → SUCCESS giữ tính lặp an toàn, không ghi lại payment.
- Không tìm thấy payment hoặc không sở hữu vẫn trả JSON 404 PAYMENT_NOT_FOUND;
  truy vấn phải lọc theo người sở hữu.
- Thiếu token trả 401; ADMIN/STAFF trả 403; demo bị tắt trả 403.

Chạy ngày 2026-11-10: **98 API tests + 2 staging-health tests đạt**.
Các test dùng dữ liệu giả, không cập nhật payment của khách hàng thật.

## Retest trên môi trường đã deploy

1. Xác nhận baseUrl trỏ đúng backend và bản deploy chứa commit của PR này.
2. Bật demo mode trong môi trường test; đăng nhập CUSTOMER ACTIVE sở hữu payment.
3. Dùng payment SUCCESS thực sự tồn tại của tài khoản đó, không mặc định ID 19.
4. PATCH `/api/payments/{id}/demo-status`, JSON `{"status":"FAILED"}`:
   mong đợi JSON 409 PAYMENT_ALREADY_FINAL và payment vẫn SUCCESS.
5. Lặp lại với dấu `/` cuối: kết quả giống bước 4.
6. Nếu vẫn nhận HTML 404, lưu URL thực tế Postman đã resolve, response headers/body,
   thời điểm và commit deploy để kiểm tra proxy/route của môi trường đó.

Chưa xác minh lại trên môi trường deploy; không coi test local là xác nhận deploy.
