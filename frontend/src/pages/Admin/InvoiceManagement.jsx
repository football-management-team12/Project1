import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { cancelAdminInvoice, getAdminInvoice, listAdminInvoices } from "../../services/admin_invoice_service";
import SettlementPanel from "../../components/SettlementPanel/SettlementPanel";
import "./InvoiceManagement.css";

const money = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value ?? 0);
const labels = { ACTIVE: "Còn hiệu lực", CANCELLED: "Đã hủy", UNPAID: "Chưa thanh toán", PARTIALLY_PAID: "Thanh toán một phần", PAID: "Đã thanh toán đủ", SUCCESS: "Thành công", PENDING: "Chờ xử lý", FAILED: "Thất bại", EXPIRED: "Hết hạn" };
const displayDate = (value) => value ? String(value).replace("T", " ").slice(0, 19) : "—";
const defaults = { status: "", customer: "", from: "", to: "", page: 1, pageSize: 20 };

export default function InvoiceManagement() {
  const [draft, setDraft] = useState(defaults);
  const [filters, setFilters] = useState(defaults);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    listAdminInvoices(filters, controller.signal).then((data) => {
      if (!controller.signal.aborted) { setResult(data); setError(""); }
    }).catch((err) => {
      if (!controller.signal.aborted) { setError(err.message); setResult(null); }
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [filters, revision]);
  const update = (event) => setDraft({ ...draft, [event.target.name]: event.target.value });
  const search = (event) => { event.preventDefault(); setBusy(true); setFilters({ ...draft, page: 1 }); };
  const turnPage = (page) => { setBusy(true); setFilters({ ...filters, page }); };
  return <section className="uc12-page">
    <h1>Hóa đơn & thanh toán</h1>
    <p>Tra cứu hóa đơn đã phát hành và lịch sử giao dịch. Hóa đơn tạm thời sau đặt cọc được xem trong quản lý đặt sân.</p>
    <form className="uc12-filters" onSubmit={search}>
      <label>Khách hàng<input name="customer" maxLength={100} value={draft.customer} onChange={update} placeholder="Tên hoặc email" /></label>
      <label>Trạng thái<select name="status" value={draft.status} onChange={update}>
        <option value="">Tất cả</option>{["ACTIVE", "UNPAID", "PARTIALLY_PAID", "PAID", "CANCELLED"].map((s) => <option key={s} value={s}>{labels[s]}</option>)}
      </select></label>
      <label>Phát hành từ<input type="date" name="from" value={draft.from} onChange={update} /></label>
      <label>Đến ngày<input type="date" name="to" min={draft.from || undefined} value={draft.to} onChange={update} /></label>
      <button className="ui-button" disabled={busy}>Tìm kiếm</button>
      <button type="button" className="ui-button ui-button-secondary" disabled={busy} onClick={() => { setDraft(defaults); setFilters({ ...defaults }); setBusy(true); }}>Xóa bộ lọc</button>
    </form>
    {error && <div role="alert">{error} <button onClick={() => { setBusy(true); setRevision((v) => v + 1); }}>Thử lại</button></div>}
    {busy ? <p role="status">Đang tải hóa đơn...</p> : result && <>
      {result.items.length === 0 ? <p role="status">Không tìm thấy hóa đơn phù hợp.</p> : <div className="uc12-table"><table>
        <caption>Hóa đơn · Trang {result.page}</caption>
        <thead><tr>{["Hóa đơn", "Khách hàng", "Ngày phát hành", "Trạng thái", "Tổng tiền", "Đã trả", "Còn lại", ""].map((s, i) => <th key={i} scope="col">{s}</th>)}</tr></thead>
        <tbody>{result.items.map((item) => <tr key={item.invoiceId}>
          <td>#{item.invoiceId}<small>Booking #{item.bookingId}</small></td>
          <td>{item.customer.name}<small>{item.customer.email}</small></td>
          <td>{displayDate(item.createdDate)}</td><td><span className={`uc12-badge uc12-badge-${item.status.toLowerCase()}`}>{labels[item.status] || item.status}</span></td>
          <td>{money(item.totalAmount)}</td><td>{money(item.paidAmount)}</td><td>{money(item.remainingAmount)}</td>
          <td><Link to={`/admin/invoice-management/${item.invoiceId}`}>Chi tiết</Link></td>
        </tr>)}</tbody>
      </table></div>}
      <nav className="uc12-pagination" aria-label="Phân trang hóa đơn">
        <button disabled={filters.page <= 1} onClick={() => turnPage(filters.page - 1)}>Trang trước</button>
        <span>Trang {filters.page}</span><button disabled={!result.hasNext} onClick={() => turnPage(filters.page + 1)}>Trang sau</button>
      </nav>
    </>}
  </section>;
}

export function AdminInvoiceDetail() {
  const { invoiceId } = useParams();
  return <InvoiceDetail key={invoiceId} invoiceId={invoiceId} />;
}

function InvoiceDetail({ invoiceId }) {
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = () => { setLoading(true); setRevision((v) => v + 1); };
  useEffect(() => {
    const controller = new AbortController();
    getAdminInvoice(invoiceId, controller.signal).then((data) => {
      if (!controller.signal.aborted) { setInvoice(data); setError(""); }
    }).catch((err) => {
      if (!controller.signal.aborted) { setInvoice(null); setError(err.message); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [invoiceId, revision]);
  const cancel = async (event) => {
    event.preventDefault();
    if (saving || !reason.trim() || !window.confirm(`Hủy hóa đơn #${invoiceId}? Thao tác này không thể khôi phục.`)) return;
    setSaving(true); setNotice("");
    try { const data = await cancelAdminInvoice(invoiceId, reason.trim()); setNotice(data.message); setReason(""); reload(); }
    catch (err) { setNotice(err.message); reload(); }
    finally { setSaving(false); }
  };
  return <section className="uc12-page">
    <Link to="/admin/invoices">← Danh sách hóa đơn</Link><h1>Chi tiết hóa đơn #{invoiceId}</h1>
    {notice && <p role="status">{notice}</p>}
    {error && <div role="alert">{error} <button onClick={reload}>Thử lại</button></div>}
    {loading ? <p role="status">Đang tải hóa đơn...</p> : invoice && <>
      <div className="uc12-card"><h2>{invoice.customer.name}</h2><p>{invoice.customer.email}</p>
        <p className="uc12-status-row"><span className={`uc12-badge uc12-badge-${invoice.invoiceStatus.toLowerCase()}`}>{labels[invoice.invoiceStatus]}</span><span className={`uc12-badge uc12-badge-${invoice.paymentStatus.toLowerCase()}`}>{labels[invoice.paymentStatus]}</span></p>
        <dl className="uc12-summary">
          <dt>Booking</dt><dd><Link to={`/admin/bookings/${invoice.bookingId}/invoice`}>#{invoice.bookingId} · Xem hóa đơn đặt sân</Link></dd>
          <dt>Sân</dt><dd>{invoice.field.name || "Chưa cập nhật"} · {invoice.field.location}</dd>
          <dt>Ngày / giờ đặt</dt><dd>{invoice.bookingDate} · {invoice.startTime} – {invoice.endTime}</dd>
          <dt>Ngày phát hành</dt><dd>{displayDate(invoice.createdDate)}</dd>
          <dt>Tổng tiền</dt><dd>{money(invoice.totalAmount)}</dd>
          <dt>Đã thanh toán</dt><dd>{money(invoice.paidAmount)}</dd>
          <dt>Còn lại</dt><dd>{money(invoice.remainingAmount)}</dd>
          <dt>Đã hoàn cọc</dt><dd>{money(invoice.refund?.amount)}</dd>
        </dl>
        {invoice.cancellation && <p>Hủy lúc {displayDate(invoice.cancellation.at)} bởi tài khoản #{invoice.cancellation.by}: {invoice.cancellation.reason}</p>}
      </div>
      <h2>Lịch sử thanh toán</h2>
      <p>Khoản đã thu chỉ tính giao dịch thành công; tiền hoàn cọc hiển thị riêng.</p>
      {invoice.payments.length === 0 ? <p>Chưa có giao dịch thanh toán.</p> : <div className="uc12-table"><table>
        <thead><tr>{["Giao dịch", "Loại", "Thời gian", "Phương thức", "Số tiền", "Trạng thái", "Tham chiếu"].map((s) => <th scope="col" key={s}>{s}</th>)}</tr></thead>
        <tbody>{invoice.payments.map((p) => <tr key={p.paymentId}><td>#{p.paymentId}</td><td>{p.type === "DEPOSIT" ? "Đặt cọc" : p.type === "FINAL_PAYMENT" ? "Thanh toán cuối" : p.type || "—"}</td><td>{displayDate(p.recordedAt)}</td><td>{p.method || "—"}</td><td>{money(p.amount)}</td><td>{labels[p.status] || p.status}</td><td>{p.reference || "—"}</td></tr>)}</tbody>
      </table></div>}
      {invoice.invoiceStatus === "ACTIVE" && invoice.remainingAmount > 0 && invoice.bookingStatus === "COMPLETED" && <>
        <h2>Xác nhận thu tiền tại sân</h2><SettlementPanel bookingId={invoice.bookingId} mode="admin" onPaymentConfirmed={reload} onRefresh={reload} />
      </>}
      {invoice.canCancel && <form className="uc12-card" onSubmit={cancel}>
        <h2>Hủy hóa đơn</h2><p>Booking đã hủy và chưa thu tiền. Hủy hóa đơn không thay đổi booking hoặc lịch sử giao dịch.</p>
        <label>Lý do hủy<textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button className="ui-button" disabled={saving || !reason.trim()}>{saving ? "Đang xử lý..." : "Hủy hóa đơn"}</button>
      </form>}
    </>}
  </section>;
}
