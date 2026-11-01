# T123-74 – UC15 quản lý sân bóng: QA handoff

## Phạm vi
Backend: `routes/field_admin.py` (blueprint độc lập), `app.py` đăng ký
vào `/api/fields`. Frontend ADMIN: `FieldManagement.jsx/.css` và
`field_admin_service.js`. Swagger: `backend/swagger.yaml`.

## Kiểm thử thủ công theo T123-137
| TC | Kiểm thử | Expected |
| --- | --- | --- |
| 01 | ADMIN ACTIVE POST sân mới hợp lệ | 201; GET public thấy sân mới |
| 02 | CUSTOMER/STAFF POST/PUT/PATCH/DELETE | 403 |
| 03 | Không có JWT | 401 |
| 04 | Sân không tồn tại | 404 |
| 05 | Thiếu tên/loại/địa điểm, chuỗi quá dài | 400 |
| 06 | Giá âm/0/chữ/NaN | 400, không đổi DB |
| 07 | Khung giờ end <= start | 400 |
| 08 | Thêm/sửa khung giờ trùng | 409, rollback |
| 09 | Sửa sân hợp lệ | 200; GET mới khớp DB |
| 10 | Chuyển AVAILABLE -> MAINTENANCE không có booking tương lai | 200 |
| 11 | MAINTENANCE có booking đang hiệu lực | 409, không sửa |
| 12 | Xóa sân chưa có booking | 200; FootballFields + FieldPrices bị xóa |
| 13 | Xóa sân có booking tương lai | 409 |
| 14 | Xóa sân có lịch sử nhưng không có booking đang hiệu lực | 200, deactivated=true, status MAINTENANCE; booking vẫn còn |
| 15 | Thao tác thay khung giờ khi có booking hiệu lực | 409 |
| 16 | Hủy booking UC07, availability T123-59/70 | Không hồi quy |
| 17 | Deposit UC06 và final payment UC09 | Không hồi quy |
| 18 | 2 ADMIN thao tác đồng thời | Không mất dữ liệu, SQL transaction bảo vệ |

## SQL kiểm tra
```sql
SELECT FieldID, FieldName, FieldType, Location, Status
FROM dbo.FootballFields ORDER BY FieldID DESC;
SELECT PriceID, FieldID, StartTime, EndTime, Price
FROM dbo.FieldPrices ORDER BY FieldID DESC, StartTime;
SELECT BookingID, FieldID, BookingDate, Status
FROM dbo.Bookings WHERE FieldID = @FieldID;
```

## Lưu ý
- Chạy trên database test, sao lưu trước, không dùng booking thật.
- UC15 không thay đổi schema, bảng Payments/BookingCancellations/Invoices.
- Trang quản lý sân: /admin/fields, đăng nhập ADMIN.
- Đừng kết luận PASS trước khi test thật trên SQL Server và browser.
- Hệ thống hiện chỉ có AVAILABLE / MAINTENANCE, nên sân có lịch sử được
  deactivate bằng MAINTENANCE, không hard-delete.
