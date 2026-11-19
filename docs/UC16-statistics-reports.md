# UC16 — Thống kê & báo cáo

Task dev: [T123-67](https://footballgaming983.atlassian.net/browse/T123-67). Tester: [T123-139](https://footballgaming983.atlassian.net/browse/T123-139).

Nhánh: `feature/T123-67-uc16-statistics-reports`. Phạm vi: ADMIN ACTIVE đọc báo cáo bằng dữ liệu thật; không sửa Booking/Payment/Invoice/Field, không tự cập nhật trạng thái quá hạn. Không tự suy luận khách đã đá xong từ báo cáo.

## API và quyền truy cập

`GET /api/admin/reports/summary?from=2026-11-01&to=2026-11-02`

- JWT bắt buộc. CUSTOMER/STAFF: 403; thiếu/sai/hết hạn token: 401.
- Kiểm tra lại Role/Status từ Users trong mỗi lần gọi: ADMIN phải còn ACTIVE; token ADMIN cũ không vượt qua role đã đổi hoặc tài khoản ngừng hoạt động.
- `from` và `to` bắt buộc, mỗi tham số đúng một lần, YYYY-MM-DD ASCII, ngày thực; năm 1900–9998; from ≤ to; tối đa **366 ngày tính cả hai đầu**. Tham số lạ, thiếu, trùng hoặc sai: 400 `INVALID_DATE_RANGE`.
- Không có dữ liệu: 200 với tiền/số lượng bằng 0, fieldUtilization=[], bảng theo ngày được điền đủ giá trị 0.
- DB không kết nối: 503 `DB_UNAVAILABLE`; schema thiếu, timeout/deadlock hoặc lỗi SQL: 503 `REPORT_UNAVAILABLE`, không trả báo cáo một phần. Lỗi bất ngờ: 500 `REPORT_ERROR`. Không trả SQL/connection string ra API.
- `Cache-Control: no-store`. Khoảng ngày tối đa, timeout truy vấn 30 giây và parameter binding; không đưa input vào SQL.

## Công thức, nguồn dữ liệu và giới hạn ngày

Các cột ngày tài chính hiện lưu **datetime không kèm múi giờ**, viết bằng GETDATE()/SYSDATETIME(). Báo cáo dùng **database-local**: `[from 00:00:00, (to + 1 ngày) 00:00:00)`, không tự cộng/trừ 7 giờ. BookingDate là ngày sân được đặt. Cần cấu hình giờ SQL Server nhất quán với giờ nghiệp vụ (Việt Nam) khi vận hành; nếu dữ liệu cũ bị trộn UTC/giờ Việt Nam, cần đối soát trước, UC16 không tự sửa lịch sử. Bộ lọc mặc định phía UI là từ đầu tháng đến hôm nay theo Asia/Ho_Chi_Minh; backend vẫn chỉ dùng khoảng ngày người dùng gửi.

| Chỉ tiêu | Công thức / thời điểm lọc |
|---|---|
| grossRevenue — tiền đã thu | SUM Payments.Amount > 0, Status=SUCCESS, PaymentType thuộc DEPOSIT/FINAL_PAYMENT/EXTRA; theo `COALESCE(PaymentDate, UpdatedAt, CreatedAt)` |
| refundedAmount — đã hoàn cọc | SUM BookingDepositRefunds.Amount > 0 theo ConfirmedAt. Chỉ khoản Admin đã xác nhận, không tính yêu cầu đang chờ. |
| revenue — doanh thu thuần | grossRevenue − refundedAmount, có thể âm khi hoàn khoản thu từ kỳ trước. Đây là dòng tiền thuần, không phải doanh thu dồn tích theo ngày sử dụng sân. |
| bookingCount | Chỉ COUNT Bookings COMPLETED có TotalAmount không null và không âm, tổng Payment SUCCESS dương loại DEPOSIT/FINAL_PAYMENT/EXTRA trừ hoàn cọc đã xác nhận ≥ TotalAmount. Lọc theo BookingDate; thu/hoàn xét toàn bộ lịch sử. Đơn miễn phí đủ điều kiện khi COMPLETED. bookingStatusCount chỉ gồm các đơn đủ điều kiện. |
| bookingBreakdown | Cùng BookingDate; completedPaid = bookingCount; deposited = còn cọc SUCCESS, thu ròng > 0 nhưng chưa đủ tổng tiền; cancelled = đã hủy; unpaid = chưa thu tiền; paidAwaitingCompletion = thu đủ nhưng chưa hoàn thành; partiallyPaid = thu một phần không còn cọc hợp lệ; refunded = đã hoàn hết khoản thu nhưng chưa hủy; invalidAmount/invalidStatus/invalidBalance = tổng tiền thiếu/sai, trạng thái không hỗ trợ hoặc hoàn vượt khoản thu. Mỗi đơn thuộc đúng một nhóm, total = tổng các nhóm. Không dùng số hóa đơn để suy ra số đơn. |
| invoiceCount / invoiceStatusCount | COUNT Invoices theo CreatedDate, nhóm PaymentStatus đang lưu; không cộng Amount/PaidAmount vào doanh thu. Là số hóa đơn phát hành, bao gồm bản ghi lịch sử bị hủy; không suy luận trạng thái từ bảng admin cancellation. |
| bookedHours | Bookings CONFIRMED/COMPLETED theo BookingDate, EndTime > StartTime; hợp các khoảng thời gian trùng/lồng/liền kề trên cùng FieldID và cùng ngày rồi cộng giây/3600. Không nhân giờ khi join nhiều Payment/Invoice. |
| capacityHours | Số ngày trong bộ lọc × **24**. Hệ thống chưa có lịch sử giờ mở cửa/bảo trì để tính công suất kinh doanh thực tế. |
| utilizationPercent | bookedSeconds ÷ (số ngày × 86400) × 100; làm tròn 2 số thập phân. Không phải tỷ lệ trên giờ mở cửa hay xác nhận khách thực sự đã chơi. |
| dailyRevenue | Tiền thu, tiền hoàn và thuần theo từng ngày; thêm dòng 0 cho ngày không phát sinh. |

Quy tắc bổ sung:

- Không lọc khoản thu SUCCESS theo trạng thái booking hiện tại: khoản đã thu của đơn hủy vẫn là tiền thu cho đến khi có hoàn được xác nhận. Không đổi trạng thái thanh toán cũ.
- Không cộng Payment PENDING/FAILED/EXPIRED, Amount không dương, loại Payment không hỗ trợ vào grossRevenue. Thanh toán SUCCESS thiếu toàn bộ ba mốc ngày không xác định được kỳ thu nên không nằm trong tiền thu. Đã bỏ paymentStatusCount khỏi API, giao diện và CSV theo yêu cầu cập nhật.
- PaymentDate là ưu tiên; fallback UpdatedAt/CreatedAt hỗ trợ VietQR demo/legacy không lưu riêng ngày thu. Không thể tái dựng thời điểm thành công chính xác nếu lịch sử bị thiếu/ghi đè.
- Không join Payments với Invoices/Bookings để cộng tiền. Mỗi aggregate độc lập nên không nhân bản khoản thu khi một booking có nhiều giao dịch/hóa đơn.
- fieldUtilization chỉ gồm sân có khoảng CONFIRMED/COMPLETED hợp lệ trong kỳ; vẫn có sân đã archive. Sân chưa có lịch không thêm hàng 0. Giữ lịch sử dù trạng thái hiện tại là bảo trì/archive; không dùng bảng giá hiện tại để suy diễn giờ mở cửa quá khứ.
- Booking qua nửa đêm hoặc EndTime ≤ StartTime là dữ liệu ngoài contract đặt sân cùng ngày; không góp giờ sử dụng. bookingCount vẫn kiểm tra COMPLETED và đã thu đủ tiền độc lập với tính giờ.
- Các aggregate chạy trong transaction SERIALIZABLE để giữ các range đọc nhất quán; luôn rollback để thả khóa, không commit/write nghiệp vụ. Không thay đổi cấu hình database. Với dữ liệu lớn cần theo dõi scan/khóa và tối ưu index sau khi đo; không tự thêm index hoặc chạy migration trên database thật.

## Response mẫu đối chiếu được

Fixture riêng ngày 01–02/11/2026:

```json
{
  "from": "2026-11-01", "to": "2026-11-02", "dayCount": 2,
  "currency": "VND", "dateBasis": "database-local",
  "revenueBasis": "cash-receipts-minus-confirmed-refunds",
  "utilizationBasis": "confirmed-completed-union-over-24h-per-day",
  "grossRevenue": 450, "refundedAmount": 100, "revenue": 350,
  "bookingCount": 4, "invoiceCount": 2,
  "bookingStatusCount": {"COMPLETED":4},
  "bookingBreakdown": {"completedPaid":4,"deposited":1,"cancelled":3,"unpaid":8,"paidAwaitingCompletion":3,"partiallyPaid":2,"refunded":1,"invalidAmount":2,"invalidStatus":0,"invalidBalance":1,"total":25},
  "invoiceStatusCount": {"PAID":1,"PARTIALLY_PAID":1},
  "fieldUtilization": [
    {"fieldId":5,"fieldName":"QA Main","isArchived":false,"bookedHours":6,"capacityHours":48,"utilizationPercent":12.5},
    {"fieldId":6,"fieldName":"QA Archived","isArchived":true,"bookedHours":2,"capacityHours":48,"utilizationPercent":4.17},
    {"fieldId":7,"fieldName":"QA Free","isArchived":false,"bookedHours":1,"capacityHours":48,"utilizationPercent":2.08}
  ],
  "dailyRevenue": [
    {"date":"2026-11-01","grossRevenue":150,"refundedAmount":0,"revenue":150},
    {"date":"2026-11-02","grossRevenue":300,"refundedAmount":100,"revenue":200}
  ]
}
```

Fixture cố tình dùng số nhỏ để tính tay (VND), không phải số liệu khách hàng. Expected: thu 100 cọc + 250 cuối + 50 EXTRA + 20 fallback UpdatedAt + 30 fallback CreatedAt = **450**, hoàn **100**, thuần **350**. Field 5 ngày 1: 06–08, 07–09, 09–10 và 07:30–07:45 hợp thành 06–10 = 4 giờ; ngày 2 thêm 10–12 = 2 giờ; tổng 6/48 = 12,5%. Field 6 archive 2/48=4,17%; field 7 miễn phí 1/48=2,08%.

Có 4 đơn đủ điều kiện đếm: #11 đã thu đủ 50, #22 đã thu đủ 100 từ kỳ trước, #28 miễn phí đã hoàn thành, #33 tổng cọc/cuối/EXTRA đủ 100. Loại đơn chưa hoàn thành, đã hủy, thiếu tiền, đã hoàn khiến thiếu tiền, tổng tiền null/âm; không dùng tiền chờ/thất bại hoặc loại giao dịch lạ để bù phần thiếu.

## Giao diện

Yêu cầu giao diện mới nhất: **chỉ hiển thị Hoàn thành, Đã cọc, Đã hủy**. Dòng **Tổng 3 nhóm** chỉ cộng completedPaid + deposited + cancelled; không dùng bookingBreakdown.total vì trường đó gồm toàn bộ nhóm kiểm tra trong API. CSV cũng chỉ xuất ba nhóm và cùng tổng hiển thị. Điều kiện hoàn thành vẫn là COMPLETED và thu đủ tiền; nhóm đã cọc chỉ gồm đơn còn thiếu tiền. Nếu backend cũ thiếu cancelled, hiển thị dấu — và thông báo khởi động lại backend, không thay bằng số 0 hoặc NaN; tạm khóa xuất CSV đến khi đủ dữ liệu.

- Admin → **Thống kê & báo cáo** → `/admin/reports`, có guard ADMIN riêng.
- Chọn ngày → Xem báo cáo; mặc định và nút Tháng này chọn từ đầu tháng đến **ngày hiện tại** theo giờ Việt Nam. Làm mới dùng bộ lọc đã áp dụng; bảng tổng hợp in rõ hai mốc ngày. Đơn có ngày chơi sau `to` không nằm trong báo cáo dù đã cọc hôm nay. Khoản cọc ban đầu vẫn có thể hiện trong quản lý đặt sân sau khi đơn đã thu đủ; báo cáo xét tổng khoản thu, không suy từ cột cọc.
- Card tiền thu/hoàn/thuần và số đơn hoàn thành đã thu đủ; biểu đồ thuần, bảng ngày; bảng mức sử dụng sân có công thức. Cột phải là **Tổng hợp đơn đặt sân** với ba nhóm theo yêu cầu mới nhất ở trên, không có “Đơn khác” hoặc các dòng kiểm tra dữ liệu. Không hiển thị phần trạng thái thanh toán. Invoice vẫn có trong API/CSV để đối chiếu riêng.
- Có loading, validation, empty, error và retry. Khi lỗi/đang tải không xuất báo cáo cũ. Ngày của kết quả luôn hiển thị riêng với draft bộ lọc chưa áp dụng.
- CSV UTF-8 BOM cho Excel: cùng kết quả đã tải từ backend, không tính lại công thức; gồm tổng hợp, từng ngày, từng sân và trạng thái. Escape dấu nháy và chặn spreadsheet formula injection ở trường text. Không xuất thông tin khách hàng/thông tin đăng nhập.
- Không có PDF/XLSX hoặc drill-down dữ liệu cá nhân trong phạm vi task này.

## Database / SSMS

**Không có migration UC16 mới.** Dùng bảng/cột hiện có: Users; Bookings; Payments (migration 002); BookingDepositRefunds (006); FootballFields.IsArchived (009); Invoices.CreatedDate/PaymentStatus. Đã đối chiếu metadata schema local, không đọc/chỉnh sửa bản ghi nghiệp vụ để seed test. Môi trường deploy cần có các migration tiền đề; thiếu schema báo 503, không tự tạo bảng.

Script `backend/scripts/verify_uc16_sql.py` dựng các bảng tạm **##UC16_<UUID>_***, adapter chỉ cho SQL trỏ vào bảng tạm, chạy API Flask/JWT thật, đối chiếu kết quả, so sánh dữ liệu trước/sau và dọn đúng bảng tạm của lần chạy. Không ghi bảng ứng dụng. Không yêu cầu người dùng chạy SQL sửa dữ liệu thật trong SSMS.

## Kiểm tra và bằng chứng

```powershell
backend/venv/Scripts/python.exe -m unittest discover -s tests/api -p 'test_[a-z]*.py'
backend/venv/Scripts/python.exe -m unittest discover -s tests -p test_staging_health.py
backend/venv/Scripts/python.exe backend/scripts/verify_uc16_sql.py --output docs/uc16-evidence/sql-fixtures.json
cd frontend
npm.cmd run build
npx.cmd eslint src/pages/Admin/ReportManagement.jsx src/services/report_service.js src/components/AdminLayout/AdminLayout.jsx src/routes/AppRoutes.jsx
```

Browser: khởi động Vite cổng 5180 rồi từ root chạy `node tests/uc16_browser_check.mjs` (mặc định Edge Windows, có thể đặt UC16_BROWSER/UC16_BASE_URL). API bị intercept bằng fixture giả; không gửi dữ liệu thật/token thật ra dịch vụ ngoài.

- 168 API tests đạt tại lần kiểm tra đầu, gồm 10 test UC16 (mỗi test có nhiều biến thể role/ngày/lỗi).
- 2 health tests đạt. Backend local đang chạy trước khi triển khai trả 404 cho route mới, cần khởi động lại tiến trình đó để nạp code UC16; chưa coi route trên tiến trình cũ là đã kiểm thử tích hợp thành công.
- 10 nhóm SQL checks trên bảng tạm đạt; có đơn COMPLETED tổng 350 chỉ cọc 100: không tính hoàn thành, chỉ tính một đơn đã cọc. Kiểm tra cả cọc đã hoàn hết/đơn đã hủy, các nhóm cộng đúng 25 đơn; mở rộng bộ lọc sang ngày tới thêm đúng đơn cọc trong ngày đó. `docs/uc16-evidence/sql-fixtures.json` lưu Expected/Response.
- 15 kịch bản browser đạt: mặc định/nút Tháng này chọn từ đầu tháng đến hôm nay và ghi rõ ngày ở tổng hợp; đối chiếu đơn chỉ cọc không vào thẻ hoàn thành, cột phải có số đơn đã cọc và tổng; loading, bộ lọc, bảng ngày, chặn ngày đảo/quá dài, reset, no-data, số âm, lỗi/retry, CSV, escape text, 1024px và nội dung hẹp. Không khẳng định đã kiểm thử toàn bộ shell admin trên mobile.
- Frontend production build và ESLint các module thay đổi đạt. Không khẳng định lint toàn repo đã sạch các lỗi cũ.
- Ảnh `report-desktop.png`, `report-tablet.png` và browser-checks.json trong `docs/uc16-evidence/` dùng dữ liệu QA giả.
- Postman: `postman/UC16.postman_collection.json`, token biến riêng ADMIN/CUSTOMER/STAFF; không commit token. Dùng fixture đã seed trong QA riêng để đối chiếu tay. Không chạy collection thay cho QA E2E độc lập.

Chưa xác nhận deploy. Tester cần đối chiếu dữ liệu môi trường QA thực tế, múi giờ SQL và hiệu năng theo quy mô dữ liệu trước khi nghiệm thu.
