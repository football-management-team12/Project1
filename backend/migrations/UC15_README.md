# UC15 — quản lý sân và lưu trữ

Chọn đúng database ứng dụng rồi chạy `009_uc15_field_archive.sql` trước khi khởi động backend mới. Migration có thể chạy lại; các sân cũ có `IsArchived=0`. Những cột và thông tin lưu trữ đã có được giữ nguyên.

Archive chỉ đổi cờ và ghi người/thời gian; không xóa sân, bảng giá, booking hoặc thanh toán. Restore chỉ đưa `IsArchived` về 0, giữ trạng thái bảo trì/hoạt động và thông tin lần lưu trữ gần nhất. Mỗi lần archive tiếp theo cập nhật lại `ArchivedAt/ArchivedBy`.

API quản trị `/api/admin/fields` yêu cầu JWT và tài khoản ADMIN ACTIVE. Sân có booking PENDING/CONFIRMED tương lai hoặc đang diễn ra không được archive; các thay đổi được thực hiện trong transaction. Luồng tạo booking cũng khóa dòng sân và kiểm tra `IsArchived` để tránh đặt sân đồng thời với archive.

FieldPrices chỉ hỗ trợ thêm và cập nhật theo PriceID; không có API xóa vật lý bảng giá. API sửa giá cũ vẫn được giữ và kiểm tra ADMIN ACTIVE; nếu sân không có đúng một khung giá thì trả 409, yêu cầu dùng API theo PriceID.

Giới hạn nhập liệu khớp schema hiện hành: tên sân 100 ký tự, địa điểm 255, URL ảnh 255; loại sân chỉ nhận `5 player`, `7 player`, `11 player`. Backend kiểm tra enum cho cả thêm và sửa sân. Giá dương, tối đa 2 chữ số thập phân. Swagger mô tả contract, Postman `postman/UC15.postman_collection.json` cung cấp request cho kiểm tra thủ công. Đặt baseUrl/adminToken, lấy fieldId/priceId từ response rồi điền vào collection variables.

Frontend chỉ hiển thị nút quản lý cho ADMIN, có danh sách/chi tiết, lọc trạng thái lưu trữ, bảng giá, xác nhận archive/restore và thông báo lỗi ngay trong form. Khách không thấy sân lưu trữ trong danh sách/availability và không tạo booking mới được; các JOIN lịch sử vẫn giữ tên sân.

Nghiệm thu API, SQL và hồi quy UC06/UC07/UC09 thuộc Jira T123-137. Chỉ merge sau khi QA xác nhận theo T123-74.

Collection có 58 request thủ công, gồm 12 request cơ bản và các nhóm authorization, validation, giá trùng, Archive với PENDING/CONFIRMED, lịch sử, rollback và concurrency. Điền token/ID theo từng fixture; không chạy toàn bộ collection như một kịch bản tuần tự. Các request không có script tự động gán ID hoặc xác nhận PASS.

Với Archive bị 409, lưu baseline booking cùng Payments/Invoices và metadata sân trước/sau; dữ liệu phải giống nhau. Với rollback, chỉ thiết lập lỗi SQL có kiểm soát trên database QA riêng: API không có tham số ép lỗi. Với concurrency, gửi từ hai phiên song song và lưu cả hai response cùng trạng thái SQL cuối. Việc có request trong collection không thay cho kết quả thực thi/nghiệm thu của Tester.
