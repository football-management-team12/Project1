import { useEffect, useState } from "react";
import { BarChart3, CalendarDays, Download, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { bookingGroups, bookingGroupTotal, getReportSummary, reportCsv } from "../../services/report_service";
import { vietnamDate } from "../../utils/bookingTime";
import "./ReportManagement.css";

const money = value => `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} đ`;
const number = value => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 4 });

function currentMonth() {
  const today = vietnamDate();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

function RevenueChart({ rows }) {
  const width = 800, height = 190;
  const max = Math.max(0, ...rows.map(row => row.revenue));
  const min = Math.min(0, ...rows.map(row => row.revenue));
  const span = max - min || 1;
  const y = value => 14 + (max - value) / span * (height - 28);
  const x = index => 12 + (rows.length === 1 ? (width - 24) / 2 : index / (rows.length - 1) * (width - 24));
  return <div className="uc16-chart">
    <div className="uc16-axis"><span>{money(max)}</span><span>{money(min)}</span></div>
    <div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Doanh thu thuần theo ngày, từ ${money(min)} đến ${money(max)}`}>
      <line x1="0" x2={width} y1={y(0)} y2={y(0)} stroke="#d9e5df" strokeDasharray="5 5" />
      <polyline points={rows.map((row, i) => `${x(i)},${y(row.revenue)}`).join(" ")} fill="none" stroke="#0b8c62" strokeWidth="3" strokeLinejoin="round" />
      {rows.map((row, i) => <circle key={row.date} cx={x(i)} cy={y(row.revenue)} r={rows.length > 60 ? 2 : 4} fill="#087b57">
        <title>{row.date}: {money(row.revenue)}</title></circle>)}
    </svg><div className="uc16-chart-dates"><span>{rows[0]?.date}</span><span>{rows.at(-1)?.date}</span></div></div>
  </div>;
}

export default function ReportManagement() {
  const [draft, setDraft] = useState(currentMonth);
  const [range, setRange] = useState(currentMonth);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    getReportSummary(range, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setResult(data); setError(""); }
    }).catch(err => { if (!controller.signal.aborted) setError(err.message || "Không thể tải báo cáo"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range, revision]);
  const apply = event => {
    event.preventDefault();
    const start = Date.parse(draft.from), end = Date.parse(draft.to);
    if (!Number.isFinite(start) || !Number.isFinite(end) || draft.from > draft.to || (end-start)/86400000 >= 366) {
      setValidation("Chọn khoảng ngày hợp lệ, tối đa 366 ngày."); return;
    }
    setValidation(""); setLoading(true); setRange({ ...draft });
  };
  const refresh = () => { setLoading(true); setRevision(value => value+1); };
  const exportReport = () => {
    const url = URL.createObjectURL(new Blob([reportCsv(result)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `bao-cao-${result.from}-${result.to}.csv`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const ready = !loading && !error && result;
  const summaryTotal = result ? bookingGroupTotal(result.bookingLifecycleBreakdown) : null;
  return <section className="uc16-page" aria-busy={loading}>
    <header className="uc16-heading"><div><span className="uc16-eyebrow">HIỆU QUẢ HOẠT ĐỘNG</span><h1>Thống kê & báo cáo</h1></div>
      <button className="uc16-button secondary" disabled={!ready || summaryTotal===null} onClick={exportReport}><Download size={17} />Xuất CSV</button></header>
    <form className="uc16-filter" onSubmit={apply}>
      <div className="uc16-filter-intro"><CalendarDays size={21} /><strong>Khoảng báo cáo</strong><small>Mặc định từ đầu tháng đến hôm nay · tối đa 366 ngày</small></div>
      <label>Từ ngày<input type="date" name="from" required min="1900-01-01" max="9998-12-31" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
      <label>Đến ngày<input type="date" name="to" required min="1900-01-01" max="9998-12-31" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
      <button className="uc16-button" disabled={loading}>Xem báo cáo</button>
      <button className="uc16-button secondary" type="button" disabled={loading} onClick={() => { const next = currentMonth(); setDraft(next); setRange(next); setLoading(true); setValidation(""); }}>Tháng này</button>
      <button className="uc16-button secondary" type="button" disabled={loading} onClick={() => {
        const today = vietnamDate();
        const next = { from: today, to: today };
        setDraft(next); setRange(next); setLoading(true); setValidation("");
      }}>Hôm nay</button>
    </form>
    {validation && <p className="uc16-error" role="alert">{validation}</p>}
    {loading && <div className="uc16-state" role="status"><RefreshCw size={24} />Đang tổng hợp báo cáo…</div>}
    {!loading && error && <div className="uc16-state uc16-error" role="alert"><p>{error}</p><button className="uc16-button" onClick={refresh}>Thử lại</button></div>}
    {ready && <>
      <div className="uc16-period"><span>Kết quả: <strong>{result.from} — {result.to}</strong> · {result.dayCount} ngày</span>
        <button className="uc16-refresh" onClick={refresh}><RefreshCw size={15} />Làm mới</button></div>
      <div className="uc16-metrics">
        <article className="uc16-metric featured"><span><TrendingUp size={20} />Doanh thu thuần</span><strong>{money(result.revenue)}</strong><small>Tiền cọc + thu tại sân − đã hoàn cọc</small></article>
        <article className="uc16-metric"><span><Wallet size={20} />Tiền thu tại sân</span><strong>{result.venueCollectedAmount == null ? "—" : money(result.venueCollectedAmount)}</strong><small>Khoản đã thu ngoài tiền cọc, theo ngày đá</small></article>
        <article className="uc16-metric"><span><Wallet size={20} />Tiền đã cọc</span><strong>{result.depositAmount == null ? "—" : money(result.depositAmount)}</strong><small>Tiền cọc thành công, theo ngày đá</small></article>
        <article className="uc16-metric"><span><CalendarDays size={20} />Đơn hoàn thành</span><strong>{number(result.bookingCount)}</strong><small>Đã hoàn thành và đã thu đủ tiền · theo ngày đặt sân</small></article>
        <article className="uc16-metric"><span><BarChart3 size={20} />Tiền đã hoàn cọc</span><strong>{money(result.refundedAmount)}</strong><small>Khoản đã hoàn xác nhận, theo ngày đá</small></article>
      </div>
      {result.bookingBreakdown.total === 0 && result.grossRevenue === 0 && result.refundedAmount === 0 && result.invoiceCount === 0 && result.fieldUtilization.length === 0 && <p className="uc16-empty" role="status">Không có dữ liệu phát sinh trong khoảng ngày này.</p>}
      <div className="uc16-main-grid"><section className="uc16-card"><header><div><h2>Doanh thu theo ngày</h2><p>Thuần = khoản thu thành công − khoản hoàn đã xác nhận</p></div><span className="uc16-unit">VND</span></header>
        <RevenueChart rows={result.dailyRevenue} />
        <details><summary>Xem bảng số liệu theo ngày</summary><div className="uc16-table"><table><thead><tr><th>Ngày</th><th>Thu tại sân</th><th>Đã cọc</th><th>Đã hoàn cọc</th><th>Thuần</th></tr></thead>
          <tbody>{result.dailyRevenue.map(row => <tr key={row.date}><td>{row.date}</td><td>{row.venueCollectedAmount == null ? "—" : money(row.venueCollectedAmount)}</td><td>{row.depositAmount == null ? "—" : money(row.depositAmount)}</td><td>{money(row.refundedAmount)}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div></details>
      </section><section className="uc16-card uc16-booking-summary"><header><div><h2>Tổng hợp đơn đặt sân</h2><p>Ngày đặt sân: {result.from} — {result.to}</p></div></header>
        <dl className="uc16-status-list">
          {bookingGroups.map(([key,label,color]) => <div key={key} data-booking-group={key}><dt><i className={`uc16-dot ${color}`} />{label}</dt><dd>{number(result.bookingLifecycleBreakdown?.[key])}</dd></div>)}
          {result.bookingLifecycleBreakdown?.unknown > 0 && <div><dt>Không xác định</dt><dd>{number(result.bookingLifecycleBreakdown.unknown)}</dd></div>}
          <div className="uc16-booking-total"><dt>Tổng số đơn</dt><dd>{number(summaryTotal)}</dd></div>
        </dl>{summaryTotal===null && <p className="uc16-error" role="alert">Backend chưa cập nhật đủ dữ liệu. Khởi động lại backend rồi bấm Làm mới.</p>}
        <p className="uc16-muted">Cùng cách phân nhóm với Quản lý đặt sân: trạng thái theo giờ Việt Nam, tách khách không đến khỏi đã hủy. Tiền cọc hiển thị riêng ở phần thanh toán.</p>
      </section></div>
      <section className="uc16-card uc16-fields"><header><div><h2>Mức sử dụng sân</h2><p>Giờ đặt đã xác nhận / hoàn thành; gộp các khung giờ trùng nhau.</p></div><span className="uc16-unit">{result.fieldUtilization.length} sân có lịch</span></header>
        <p className="uc16-definition">Tỷ lệ = giờ đã đặt ÷ ({result.dayCount} ngày × 24 giờ). Đây là tỷ lệ trên toàn bộ thời gian, chưa trừ giờ đóng cửa hoặc bảo trì.</p>
        {!result.fieldUtilization.length ? <p className="uc16-muted">Chưa có lịch đã xác nhận hoặc hoàn thành trong khoảng ngày này.</p> : <div className="uc16-table"><table>
          <thead><tr><th>Sân bóng</th><th>Giờ đã đặt</th><th>Giờ quy ước</th><th>Tỷ lệ sử dụng</th></tr></thead><tbody>{result.fieldUtilization.map(field => <tr key={field.fieldId}>
            <td><strong>{field.fieldName}</strong><small>#{field.fieldId}{field.isArchived ? " · Đã lưu trữ" : ""}</small></td><td>{number(field.bookedHours)} giờ</td><td>{number(field.capacityHours)} giờ</td>
            <td><div className="uc16-utilization"><meter min="0" max="100" value={field.utilizationPercent}>{field.utilizationPercent}%</meter><strong>{number(field.utilizationPercent)}%</strong></div></td>
          </tr>)}</tbody></table></div>}
      </section>
      <aside className="uc16-notes"><strong>Cách đọc báo cáo</strong><p>Đơn hoàn thành là đơn đã hết giờ và thu đủ tiền, không bị hủy hoặc đánh dấu không đến. Tiền đã thu bao gồm cọc, thanh toán cuối và khoản thu thêm thành công của tất cả đơn trong phạm vi, kể cả cọc giữ lại khi khách không đến; không cộng lại giá trị hóa đơn. Khoản hoàn đã xác nhận được trừ vào ngày đá của đơn tương ứng.</p>
        <p>Tiền cọc, tiền thu tại sân và khoản hoàn được tổng hợp theo ngày diễn ra trận (BookingDate), không theo ngày giao dịch. Chỉ cộng tiền đã thanh toán thành công. Bấm Làm mới để cập nhật số liệu.</p></aside>
    </>}
  </section>;
}
