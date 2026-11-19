# Báo cáo tiền theo ngày đá

Task: T123-179. Nhánh: `bugfix/T123-179-report-reconciliation`.

Quy tắc được người dùng chốt: khách cọc ngày 16 cho sân ngày 17 thì tính cọc vào ngày 17. Tài liệu này thay thế mô tả cũ về ngày ghi nhận tiền trong UC16 và dashboard.

- Tiền đã thu: tổng SUCCESS dương của DEPOSIT/FINAL_PAYMENT/EXTRA gắn với các đơn có BookingDate trong phạm vi. Phân nhóm ngày bằng BookingDate, không dùng PaymentDate/UpdatedAt/CreatedAt.
- Tiền đã hoàn: tổng BookingDepositRefunds của chính các đơn có ngày đá trong phạm vi, không theo ConfirmedAt. Chỉ khoản đã được xác nhận/lưu mới được trừ.
- Thuần = đã thu − đã hoàn. Cọc giữ lại do không đến vẫn được cộng vì giao dịch thành công được giữ nguyên.
- Theo yêu cầu hiển thị mới: thêm `depositAmount` (DEPOSIT), `venueCollectedAmount` (FINAL_PAYMENT/EXTRA). Hai khoản không trùng nhau; `grossRevenue` giữ tổng hai khoản để tương thích. Thuần = cọc + thu tại sân − đã hoàn. Tách tương tự trên bảng theo ngày và CSV; ô cuối mang nhãn Tiền đã hoàn cọc.
- Chỉ nhận khoản tiền thực thu đã có giao dịch thành công, không tự tính phần còn nợ thành doanh thu.
- Thu phần còn lại tại sân đã bị khóa trước giờ bắt đầu ở UI/API; giữ nguyên kiểm tra hiện có. Các giao dịch cũ, kể cả đã ghi nhận sớm, không bị sửa hay xóa.
- Khoản hoàn đã ghi trong DB không chứng minh chuyển tiền thực tế; dữ liệu hiện có giữ nguyên để đối soát. Không tự xóa khoản hoàn của #9032.
- Thay đổi báo cáo áp dụng cả dashboard và CSV. Không có migration. Số hóa đơn vẫn theo ngày phát hành như hợp đồng cũ, không phải số đơn theo ngày đá.
- Theo yêu cầu tiếp theo: tổng hợp booking dùng nhóm pending/confirmed/in_progress/ended/no_show/cancelled/completed theo cùng quy tắc bookingDisplayStatus và giờ Việt Nam. Thêm bookingLifecycleBreakdown, giữ bookingBreakdown tài chính cũ cho tương thích, không cộng gộp hai loại. Hiển thị Tổng số đơn thay Tổng 3 nhóm, CSV cùng phạm vi. Dữ liệu lạ hiện nhóm Không xác định thay vì bỏ mất.
- Đối soát ngày 16/11: 4 hoàn thành, 2 hết giờ, 1 đang đá, 1 không đến, đã hủy 0; tổng 8. So trực tiếp với helper JavaScript trên dữ liệu API thật, không chỉnh trạng thái booking trong DB.

Đối chiếu GET dữ liệu local thật:

| Ngày đá | Đã thu | Đã hoàn | Thuần |
|---|---:|---:|---:|
| 16/11/2026 | 2.850.000 | 0 | 2.850.000 |
| 17/11/2026 | 100.000 | 100.000 | 0 |

Khoản hoàn ngày 17 thuộc #9032. Ngày 16 không cộng giao dịch của #5016 (ngày đá 25/10) hoặc #9032 (ngày đá 17/11).

Kiểm tra: 222 test API, 16 kiểm tra giao diện báo cáo, điều kiện thu đủ trước/đúng giờ bắt đầu, build frontend và đối chiếu API chỉ đọc DB thật đều đạt. Người dùng đã kiểm tra local và yêu cầu push/merge/deploy.
