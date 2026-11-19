import { apiRequest } from "./api";

export const bookingGroups = [
  ["pending", "Chờ xác nhận", "pending"],
  ["confirmed", "Đã xác nhận", "confirmed"],
  ["in_progress", "Đang đá", "in-progress"],
  ["ended", "Đã hết giờ / kết thúc", "ended"],
  ["no_show", "Khách không đến", "no-show"],
  ["cancelled", "Đã hủy", "cancelled"],
  ["completed", "Hoàn thành", "completed"],
];

export function bookingGroupTotal(breakdown) {
  if (!bookingGroups.every(([key]) => Number.isInteger(breakdown?.[key]) && breakdown[key]>=0)) return null;
  const unknown = breakdown.unknown ?? 0;
  if (!Number.isInteger(unknown) || unknown < 0) return null;
  const total = bookingGroups.reduce((total,[key]) => total+breakdown[key],unknown);
  return total === breakdown.total ? total : null;
}

export const getReportSummary = (range, options = {}) =>
  apiRequest(`/api/admin/reports/summary?${new URLSearchParams(range)}`, options);

// Quote every cell and neutralize spreadsheet formulas in database text.
export function reportCsv(report) {
  const rows = [
    ["Báo cáo thống kê", report.from, report.to],
    ["Cơ sở ngày", "Ngày đá (BookingDate): tiền cọc, tiền thu tại sân và khoản hoàn của các đơn trong phạm vi"],
    ["Tiền thu tại sân (VND)", report.venueCollectedAmount],
    ["Tiền đã cọc (VND)", report.depositAmount], ["Tiền đã hoàn cọc (VND)", report.refundedAmount],
    ["Doanh thu thuần (VND)", report.revenue], ["Số đơn hoàn thành và đã thu đủ tiền theo ngày đặt sân", report.bookingCount],
    ["Hóa đơn phát hành", report.invoiceCount], [],
    ["Tổng hợp đơn theo ngày đặt sân", "Số lượng"],
    ...bookingGroups.map(([key,label]) => [label, report.bookingLifecycleBreakdown?.[key]]),
    ["Không xác định", report.bookingLifecycleBreakdown?.unknown],
    ["Tổng số đơn", bookingGroupTotal(report.bookingLifecycleBreakdown)], [],
    ["Ngày", "Thu tại sân", "Đã cọc", "Đã hoàn cọc", "Thuần"],
    ...report.dailyRevenue.map(row => [row.date, row.venueCollectedAmount, row.depositAmount, row.refundedAmount, row.revenue]), [],
    ["Mã sân", "Sân", "Giờ đã đặt (gộp trùng)", "Giờ khả dụng quy ước 24h/ngày", "Tỷ lệ (%)"],
    ...report.fieldUtilization.map(row => [row.fieldId, row.fieldName, row.bookedHours, row.capacityHours, row.utilizationPercent]), [],
    ["Trạng thái hóa đơn", "Số lượng (theo ngày phát hành)"], ...Object.entries(report.invoiceStatusCount),
  ];
  return "\uFEFF" + rows.map(row => row.map(value => {
    let text = String(value ?? "");
    if (typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
}
