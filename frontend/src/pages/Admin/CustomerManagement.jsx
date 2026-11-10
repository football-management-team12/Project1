import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getCustomer, getCustomerBookings, listCustomers, updateCustomer } from "../../services/customer_service";
import "./CustomerManagement.css";

const initial = { keyword: "", status: "", page: 1, pageSize: 10 };
const labels = { ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động", PENDING: "Chờ xác nhận", CONFIRMED: "Đã xác nhận", COMPLETED: "Hoàn thành", CANCELLED: "Đã hủy" };
const contact = customer => ({ fullName: customer.fullName || "", email: customer.email || "", phone: customer.phone || "" });
const money = value => value === null ? "—" : `${Number(value).toLocaleString("vi-VN")}đ`;
function Status({ value }) { return <span className={`uc13-status ${value === "ACTIVE" ? "active" : ""}`}>{labels[value] || value}</span>; }
function Pagination({ data, busy, onChange }) {
  if (!data || data.totalPages <= 1) return null;
  return <nav className="uc13-pagination" aria-label="Phân trang">
    <button className="uc13-button secondary" disabled={busy || data.page<=1} onClick={() => onChange(data.page-1)}>Trang trước</button>
    <span>Trang {data.page}/{data.totalPages}</span>
    <button className="uc13-button secondary" disabled={busy || data.page>=data.totalPages} onClick={() => onChange(data.page+1)}>Trang sau</button>
  </nav>;
}

export default function CustomerManagement() {
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    listCustomers(filters, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setResult(data); setError(""); }
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, revision]);
  const search = event => { event.preventDefault(); setLoading(true); setFilters({ ...draft, keyword: draft.keyword.trim(), page: 1 }); };
  return <section className="uc13-page">
    <header className="uc13-heading"><div><span className="uc13-eyebrow">KHÁCH HÀNG CỦA SÂN</span><h1>Quản lý khách hàng</h1>
      <p>Tra cứu thông tin liên hệ và lịch sử đặt sân trong cùng một nơi.</p></div>
      <button className="uc13-button secondary" disabled={loading} onClick={() => { setLoading(true); setRevision(value => value+1); }}>Làm mới</button></header>
    <form className="uc13-filters" onSubmit={search}>
      <label>Tìm khách hàng<input value={draft.keyword} maxLength={100} onChange={e => setDraft({ ...draft, keyword: e.target.value })} placeholder="Tên, username, email hoặc điện thoại" /></label>
      <label>Trạng thái<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>
        <option value="">Tất cả trạng thái</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
      <button className="uc13-button" disabled={loading}>Tìm kiếm</button>
      <button className="uc13-button secondary" type="button" disabled={loading} onClick={() => { setDraft(initial); setLoading(true); setFilters({ ...initial }); }}>Xóa bộ lọc</button>
    </form>
    {error && <p className="uc13-error" role="alert">{error} <button onClick={() => { setLoading(true); setRevision(value => value+1); }}>Thử lại</button></p>}
    {loading ? <p role="status">Đang tải khách hàng…</p> : !error && result && <>
      <div className="uc13-list-summary"><strong>{result.total} khách hàng</strong><span>Chỉ hiển thị tài khoản CUSTOMER</span></div>
      {result.items.length === 0 ? <div className="uc13-card"><p>Không tìm thấy khách hàng phù hợp.</p></div> : <div className="uc13-table"><table>
        <thead><tr><th>Khách hàng</th><th>Liên hệ</th><th>Trạng thái</th><th>Đơn đặt sân</th><th>Thao tác</th></tr></thead>
        <tbody>{result.items.map(item => <tr key={item.customerId}>
          <td><strong>{item.fullName || "Chưa có họ tên"}</strong><small>@{item.username} · #{item.customerId}</small></td>
          <td><span>{item.email || "—"}</span><small>{item.phone || "—"}</small></td>
          <td><Status value={item.status} /></td><td>{item.bookingCount}</td>
          <td><Link className="uc13-detail-link" to={`/admin/customers/${item.customerId}`}>Xem chi tiết →</Link></td>
        </tr>)}</tbody>
      </table></div>}
      <Pagination data={result} busy={loading} onChange={page => { setLoading(true); setFilters({ ...filters, page }); }} />
    </>}
  </section>;
}

export function AdminCustomerDetail() {
  const { customerId } = useParams();
  return <CustomerDetail key={customerId} customerId={customerId} />;
}

function CustomerDetail({ customerId }) {
  const [customer, setCustomer] = useState(null);
  const [draft, setDraft] = useState({ fullName: "", email: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [bookings, setBookings] = useState(null);
  const [bookingPage, setBookingPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    getCustomer(customerId, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setCustomer(data); setDraft(contact(data)); setError(""); }
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [customerId, revision]);
  useEffect(() => {
    const controller = new AbortController();
    getCustomerBookings(customerId, bookingPage, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setBookings(data); setHistoryError(""); }
    }).catch(err => { if (!controller.signal.aborted) setHistoryError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [customerId, bookingPage, historyRevision]);
  const changes = customer ? Object.fromEntries(Object.entries(draft).map(([key,value]) => [key,value.trim()]).filter(([key,value]) => value !== (customer[key] || ""))) : {};
  const submit = async event => {
    event.preventDefault(); if (saving || !Object.keys(changes).length) return;
    setSaving(true); setSaveError(""); setNotice("");
    try {
      const result = await updateCustomer(customerId, changes);
      setCustomer(result.customer); setDraft(contact(result.customer)); setEditing(false); setNotice(result.message);
    } catch (err) { setSaveError(err.message || "Không thể lưu thông tin khách hàng"); }
    finally { setSaving(false); }
  };
  return <section className="uc13-page">
    <Link className="uc13-back" to="/admin/customers">← Danh sách khách hàng</Link>
    <header className="uc13-heading"><div><span className="uc13-eyebrow">HỒ SƠ KHÁCH HÀNG</span><h1>{customer?.fullName || "Chi tiết khách hàng"}</h1></div></header>
    {loading && <p role="status">Đang tải thông tin…</p>}
    {error && <p className="uc13-error" role="alert">{error} <button onClick={() => { setLoading(true); setRevision(value => value+1); }}>Thử lại</button></p>}
    {!loading && !error && customer && <>
      {notice && <p className="uc13-success" role="status">{notice}</p>}
      <div className="uc13-profile-grid">
        <aside className="uc13-card uc13-identity"><div className="uc13-avatar" aria-hidden="true">{customer.fullName?.trim().slice(0,1).toLocaleUpperCase() || "K"}</div>
          <h2>{customer.fullName}</h2><p>@{customer.username}</p><Status value={customer.status} />
          <dl><div><dt>Mã khách hàng</dt><dd>#{customer.customerId}</dd></div><div><dt>Vai trò</dt><dd>Khách hàng</dd></div>
            <div><dt>Tổng đơn đặt sân</dt><dd>{bookings?.total ?? "—"}</dd></div></dl>
          <p className="uc13-muted">Username, vai trò và trạng thái chỉ để xem tại đây.</p>
        </aside>
        <div className="uc13-card"><header className="uc13-section-heading"><div><h2>Thông tin liên hệ</h2><p className="uc13-muted">Cập nhật họ tên, email và số điện thoại.</p></div>
          {!editing && <button className="uc13-button secondary" onClick={() => { setEditing(true); setNotice(""); }}>Chỉnh sửa</button>}</header>
          {saveError && <p role="alert" className="uc13-error">{saveError}</p>}
          <form className="uc13-contact-form" onSubmit={submit}>
            {[['fullName','Họ và tên','text',100],['email','Email','email',100],['phone','Số điện thoại','tel',10]].map(([key,label,type,max]) => <label key={key} htmlFor={`customer-${key}`}>{label}
              <input id={`customer-${key}`} type={type} maxLength={max} required readOnly={!editing} disabled={saving}
                pattern={key==='phone'?'0[0-9]{9}':undefined} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />
            </label>)}
            {editing && <div className="uc13-form-actions"><button className="uc13-button" disabled={saving || !Object.keys(changes).length}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</button>
              <button className="uc13-button secondary" type="button" disabled={saving} onClick={() => { setDraft(contact(customer)); setEditing(false); setSaveError(""); }}>Hủy chỉnh sửa</button></div>}
          </form>
        </div>
      </div>
      <section className="uc13-card"><header className="uc13-section-heading"><div><h2>Lịch sử đặt sân</h2><p className="uc13-muted">Dữ liệu chỉ để xem; chỉnh sửa liên hệ không làm thay đổi lịch sử.</p></div>
        <button className="uc13-button secondary" disabled={historyLoading} onClick={() => { setHistoryLoading(true); setHistoryRevision(value => value+1); }}>Làm mới lịch sử</button></header>
        {historyError && <p role="alert" className="uc13-error">{historyError}</p>}
        {historyLoading ? <p role="status">Đang tải lịch sử…</p> : !historyError && bookings && <>
          {bookings.items.length === 0 ? <p>Khách hàng chưa có đơn đặt sân.</p> : <div className="uc13-table"><table>
            <thead><tr><th>Đơn</th><th>Sân</th><th>Ngày</th><th>Khung giờ</th><th>Tổng tiền</th><th>Trạng thái</th></tr></thead>
            <tbody>{bookings.items.map(booking => <tr key={booking.bookingId}><td>#{booking.bookingId}</td><td><strong>{booking.fieldName || `Sân #${booking.fieldId}`}</strong><small>{booking.fieldType}</small></td>
              <td>{booking.bookingDate}</td><td>{booking.startTime}–{booking.endTime}</td><td>{money(booking.totalAmount)}</td><td><Status value={booking.status} /></td></tr>)}</tbody>
          </table></div>}
          <Pagination data={bookings} busy={historyLoading} onChange={page => { setHistoryLoading(true); setBookingPage(page); }} />
        </>}
      </section>
    </>}
  </section>;
}
