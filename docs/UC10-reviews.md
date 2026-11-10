# UC10 — Đánh giá & Phản hồi (T123-66)

## Quy tắc chốt cho tester T123-130

- Chỉ CUSTOMER ACTIVE, JWT hợp lệ, sở hữu booking COMPLETED được gửi.
- Không thêm điều kiện Invoice PAID hoặc yêu cầu cọc/thanh toán nữa.
- Một review mỗi booking; không sửa/xóa nội dung review của khách. ADMIN trả lời
  được bổ sung theo yêu cầu ngày 11/11/2026 (xem phần cuối tài liệu).
- Rating: JSON integer 1..5; bool, float và string đều không hợp lệ.
- Comment: bắt buộc string, trim trước lưu, không rỗng, tối đa 1.000 đơn vị UTF-16
  (đúng giới hạn textarea và NVARCHAR; emoji có thể chiếm 2 đơn vị); không chứa
  ký tự điều khiển trừ xuống dòng/tab.
- UserID và FieldID lấy từ booking trên server; không tin các ID trong body.
- Đơn người khác trả 403 theo T123-130; đơn không tồn tại 404; ineligible và trùng 409.
- Danh sách public chỉ review gắn đúng owner/field với booking COMPLETED; sân đã
  Archive không công khai. Không công bố ID khách/booking hoặc thông tin tài khoản.

## SQL cần người vận hành chạy

File: `backend/migrations/011_uc10_booking_reviews.sql`.

Chọn đúng database backend đang dùng trong SSMS, chạy migration, kiểm tra kết quả
TargetDatabase/ReviewsTableID, rồi khởi động lại backend để nạp blueprint mới.
Nếu local và deploy dùng database riêng, phải áp dụng riêng trên từng database.
CI/deploy hiện không tự chạy migration. Chưa chạy file này vào database ứng dụng
trong quá trình triển khai local; chỉ kiểm tra phiên bản đổi tên trên tempdb fixtures.

Bảng thêm mới `dbo.BookingReviews`: ReviewID identity, BookingID UNIQUE + FK,
UserID/FieldID FK, Rating CHECK 1..5, Comment NVARCHAR(1000), CreatedAt UTC.
Index theo FieldID/CreatedAt/ReviewID. Không ALTER các bảng cũ, không sửa tiền
hay trạng thái Booking/Payment/Invoice.

Nếu chưa có bảng, các API UC10 trả 503 REVIEWS_NOT_READY. Luồng cũ không được nối
thêm truy vấn bảng review vào API booking cũ, nên không phụ thuộc migration UC10.

## API

### POST /api/bookings/{bookingId}/reviews

JWT CUSTOMER ACTIVE. Body chỉ cần `{"rating":5,"comment":"Sân tốt, đúng giờ"}`.
201: `{reviewId,bookingId,fieldId,rating,comment,createdAt}`; thời gian UTC ISO8601.
400 dữ liệu sai; 401 JWT; 403 role/inactive/ownership; 404 không có booking;
409 chưa COMPLETED hoặc trùng; 413 body >16 KB; 500 lỗi ghi/commit rollback;
503 DB/migration chưa sẵn sàng.

Transaction SERIALIZABLE + khóa booking UPDLOCK/HOLDLOCK + UNIQUE BookingID bảo vệ
request đồng thời. Sau lỗi unique trả 409; không có row thứ hai.

### GET /api/bookings/{bookingId}/reviews

JWT CUSTOMER owner. API bổ sung phục vụ UI, chỉ đọc:
`{bookingId,fieldId,canReview,reason,review}`. reason null, BOOKING_NOT_COMPLETED
hoặc REVIEW_ALREADY_EXISTS. review null hoặc object như POST. Không đổi dữ liệu.

### GET /api/fields/{fieldId}/reviews?page=1&pageSize=10

Public, không yêu cầu token. page 1..1.000.000, pageSize 1..50.
`{fieldId,fieldName,page,pageSize,total,totalPages,averageRating,items}`.
Mới nhất trước, CreatedAt DESC / ReviewID DESC. Không có review: averageRating=null,
items=[], totalPages=0. Trang vượt tổng: items=[]. Sai phân trang 400; sân không
tồn tại/Archive 404. Tên người đánh giá công khai là nhãn “Khách đã đặt sân”.

Chi tiết schema: `backend/swagger.yaml`. Postman: `postman/UC10.postman_collection.json`.

## UI

- Lịch sử: nút Đánh giá sân chỉ trên booking COMPLETED, mở chi tiết và cuộn tới form.
- Chi tiết: 1..5 sao bằng radio có bàn phím, nhận xét/đếm ký tự, khóa lúc gửi;
  success/error/retry; đã đánh giá hiển thị lại review và không cho gửi thêm.
- Nếu tab khác gửi trước: API 409, UI tải review đã lưu thay vì tạo trùng.
- Link Xem đánh giá trên thẻ sân mở `/fields/{fieldId}/reviews`: danh sách public,
  điểm trung bình, phân trang, trạng thái rỗng/lỗi và retry, responsive.
- Comment được render bằng React text, không dùng dangerouslySetInnerHTML.

## Kiểm tra và bằng chứng bản đầu

- Kết quả local: 119 API tests (21 test UC10 mới), 2 health tests và 11 browser
  scenarios đạt; frontend production build đạt. ESLint component/service UC10,
  FieldCard và AppRoutes đạt. Hai trang BookingDetail/BookingHistory còn tổng
  2 lỗi effect và 1 warning dependency giống baseline trước thay đổi; không coi
  lint toàn repository đã xanh.
- API mock: `tests/api/test_reviews.py`; toàn bộ regression chạy cùng CI hiện có.
- SQL thật trên tempdb fixtures: `backend/scripts/verify_uc10_sql.py`.
  Chạy migration đổi tên hai lần; POST đúng owner, duplicate, biên input,
  ineligible, pagination đúng sân; hai request đồng thời cho kết quả 201/409,
  chỉ một row. Không ghi bảng ứng dụng. SQL Server không enforce FK trên bảng
  tạm nên cần kiểm tra FK thật sau khi người vận hành áp dụng migration 011.
- Evidence SQL: `docs/uc10-evidence/sql-fixtures.json`.
- Evidence UI: `docs/uc10-evidence/browser-checks.json` và ảnh form desktop/mobile,
  sau khi gửi, danh sách public mobile trong cùng thư mục. Dữ liệu ảnh là fixture.
- Kiểm thử độc lập của tester và xác nhận môi trường deploy còn cần thực hiện.
  Hoàn thiện local không có nghĩa task đã nghiệm thu/Done.

Backend đang chạy trước đó có thể chưa nạp blueprint UC10 (probe local port 5001
trước restart trả 404). Sau khi chạy SQL, dừng đúng terminal backend cũ và chạy lại
`backend/venv/Scripts/python.exe backend/app.py` từ thư mục gốc. Frontend Vite sẽ
nạp các file mới. Không tự dừng một tiến trình Python chưa xác minh đúng dự án.

## Kịch bản retest chính

1. Chuẩn bị CUSTOMER A/B, ADMIN và inactive; booking COMPLETED/PENDING/CONFIRMED/CANCELLED.
2. A gửi review cho COMPLETED của mình: 201, đúng booking/owner/field trong DB.
3. Gửi lại/cùng lúc: một row, request trùng 409; A xem lại thấy review đã lưu.
4. A dùng booking B: 403; sai JWT 401, ADMIN 403; ineligible 409.
5. Rating 1/5 hợp lệ; 0/6, bool/string/float sai; comment rỗng/quá dài sai.
6. GET theo sân, page/pageSize: đúng sân, không lặp giữa trang, không lộ dữ liệu tài khoản.
7. UI form thành công/lỗi/trùng, public list, mobile và nội dung giống HTML phải chỉ hiển thị chữ.
8. Regression UC05/06/07/08/09/12/15; review không ghi Payment/Invoice/Booking.

## Bổ sung ADMIN xem và phản hồi (11/11/2026)

Chạy **012_uc10_review_replies.sql** sau 011 trên đúng database. File chỉ thêm
`dbo.BookingReviewReplies` (ReviewID PK/FK, AdminUserID FK, Comment tối đa 1000,
CreatedAt/UpdatedAt UTC). Không sửa các bảng cũ. Nếu chưa có 012, API khách vẫn
xem/gửi review được, reply trả null; API inbox/reply Admin báo chưa sẵn sàng.

- Admin → **Đánh giá & phản hồi** (`/admin/reviews`): danh sách mới nhất, khách,
  sân, booking, điểm, nội dung và câu trả lời; lọc đã/chưa phản hồi và số sao.
- Badge menu là tổng số **chưa phản hồi**, không phải tổng số chưa đọc.
- Tự cập nhật mỗi 30 giây khi tab hiện; tải lại khi focus/visibility và sau khi lưu
  phản hồi. Có nút Làm mới. Poll giữ nội dung bản nháp đang soạn; không phải WebSocket.
- Mỗi review có một câu trả lời công khai, ADMIN có thể cập nhật. Giữ CreatedAt,
  đổi UpdatedAt và người cập nhật; không lưu chuỗi lịch sử sửa. Khi hai ADMIN sửa
  cùng phản hồi, lần lưu sau là nội dung hiện hành.
- Khách xem câu trả lời tại đánh giá theo sân và đánh giá của mình trong đơn;
  hai nơi tự tải lại mỗi 30 giây/khi focus, không lộ AdminUserID ra public.
- GET `/api/admin/reviews?page=1&pageSize=10&status=all&rating=5`: ADMIN ACTIVE;
  trả items/total/totalPages và totalReviews/unansweredCount toàn inbox.
- PUT `/api/admin/reviews/{reviewId}/reply`, body `{comment}`: ADMIN ACTIVE;
  tạo/cập nhật trả 200; dùng chung validation nhận xét, khóa review và transaction;
  sai quyền 403, missing review 404, body sai 400, lỗi ghi rollback.
- Middleware JWT lẫn vai trò/trạng thái trong DB đều được kiểm tra lại.

Evidence thêm: `admin-browser-checks.json`, ảnh `admin-replies-desktop.png`;
SQL fixture chạy migration 012 hai lần, tạo/sửa một reply, CUSTOMER bị chặn,
lọc Admin, đếm chờ phản hồi và khách/public nhận câu trả lời.

Kết quả bản mở rộng: 132 API tests, 2 health tests, 11 browser scenarios khách
và 7 browser scenarios Admin đạt. Build và ESLint các module mới/được mở rộng
cho inbox, sidebar, phản hồi đạt; lỗi lint cũ ở BookingDetail/BookingHistory
vẫn như phần ghi chú bản đầu. Postman có 16 request; các request Admin cần
`adminToken` và `reviewId` fixture (POST review thành công lưu reviewId tự động).
