# T123-167 — Minh chứng hoàn tiền UC07

## Kết quả điều tra

Endpoint `GET /api/bookings/{bookingId}/deposit-refund/evidence` trên develop đã
trả **file nhị phân** đúng contract. Không có trường JSON `data` hoặc `url` trong
response thành công. Khi dùng Postman cần Save Response/Send and Download để xem
file, đồng thời kiểm tra Content-Type, Content-Disposition và kích thước body.

Chưa tái hiện được backend trả 200 rỗng với dữ liệu hợp lệ. Jira chưa cung cấp
baseUrl, BookingID hoặc response thực tế. Vì vậy thay đổi này không khẳng định
đã sửa nguyên nhân của lần báo lỗi gốc và không xác nhận môi trường deploy.

Tái hiện được vấn đề phía client: hàm download cũ coi mọi HTTP 200 là biên lai,
kể cả body rỗng hoặc HTML/JSON; có thể tải ra tệp rỗng hoặc `.bin` không dùng được.

## Thay đổi

- Client chỉ tạo download cho body không rỗng và MIME PNG, JPEG hoặc PDF. HTTP 200
  rỗng/HTML/JSON hay MIME khác hiển thị lỗi, không tạo file tải xuống.
- OpenAPI mô tả đúng ba MIME backend thực sự trả về thay cho octet-stream.
- Thêm test qua Flask app thật với JWT và DB mock: byte-for-byte PNG/JPEG/PDF,
  header tải file, cache, quyền sở hữu, ADMIN/CUSTOMER, thiếu file, thiếu booking,
  tài khoản inactive, JWT và database unavailable.
- Không sửa logic hoàn tiền, số dư, dữ liệu lịch sử hay schema. Không cần migration.

## Kiểm tra ngày 2026-11-10

- 104 API tests và 2 staging-health tests đạt.
- `node tests/refund_evidence_download_check.mjs`: 3 dạng file tải thành công,
  4 dạng HTTP 200 sai bị chặn, JSON 404 bị chặn.
- ESLint file service và frontend production build đạt.
- `backend/scripts/verify_t123_167_sql.py`: 5 HTTP checks với SQL Server và bảng tạm
  riêng trong connection; không ghi vào bảng ứng dụng. Xác nhận hoàn tiền bằng file
  PDF giả, đọc lại VARBINARY, tải bằng ADMIN/chủ booking đều khớp từng byte;
  CUSTOMER khác và bản ghi cũ không có minh chứng trả 404.
- SHA-256 file PDF giả upload/download:
  `a97ccc10b389b17c4ab3266369ba7207187d2e469d01b3da6d5a409d1f2d736f`.

## Retest môi trường tester

1. Xác nhận đúng baseUrl backend và phiên bản deploy. Đăng nhập ADMIN ACTIVE.
2. Trong môi trường test, dùng booking đã hủy, có cọc thành công và đủ điều kiện
   hoàn tiền; gửi file PNG/JPEG/PDF qua API xác nhận hoàn tiền hiện có.
3. GET endpoint evidence: mong đợi 200, MIME đúng file, Content-Disposition
   attachment và body có byte; lưu response thành file và so hash với file đã gửi.
4. CUSTOMER chủ booking được tải; CUSTOMER khác không tải được. Booking không có
   minh chứng trả JSON 404 EVIDENCE_NOT_FOUND, không trả 200 rỗng.
5. Kiểm tra nút tải trên giao diện; mô phỏng proxy trả HTML 200 hoặc body rỗng phải
   hiện lỗi, không tạo file tải xuống.
6. Nếu lỗi gốc còn xảy ra, thu URL đã resolve, BookingID, response headers/body,
   thời điểm và commit deploy. Không đính kèm JWT hay biên lai thật có thông tin cá nhân.

Không tạo minh chứng giả cho các khoản hoàn tiền lịch sử thiếu file; cần bổ sung
chứng từ thật theo quy trình nghiệp vụ khi có yêu cầu riêng.
