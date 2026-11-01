import { useEffect, useMemo, useState } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import { getFields } from "../../services/field_service";
import {
  getManagedField, createManagedField, updateManagedField,
  setManagedFieldStatus, deleteManagedField,
  addManagedPrice, updateManagedPrice, deleteManagedPrice
} from "../../services/field_admin_service";
import "./FieldManagement.css";

const emptyField = { FieldName: "", FieldType: "5 player", Location: "", Image: "", Status: "AVAILABLE" };
const emptyPrice = { StartTime: "06:00", EndTime: "07:30", Price: "" };
const money = (v) => `${Number(v || 0).toLocaleString("vi-VN")}đ`;

export default function FieldManagement() {
  const { isAdmin } = useOutletContext();
  const [fields, setFields] = useState([]);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingId, setEditingId] = useState(null); // "new" or FieldID
  const [form, setForm] = useState({...emptyField});
  const [prices, setPrices] = useState([]);
  const [priceId, setPriceId] = useState(null);
  const [priceForm, setPriceForm] = useState({...emptyPrice});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    try {
      const result = await getFields();
      setFields(Array.isArray(result) ? result : []);
      setError("");
    } catch (err) {
      setError(err.message || "Không tải được danh sách sân");
    }
  }

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin]);

  const grouped = useMemo(() => {
    const fieldsById = new Map();
    for (const row of fields) {
      if (!fieldsById.has(row.FieldID)) fieldsById.set(row.FieldID, { ...row, slots: [] });
      if (row.StartTime != null) {
        fieldsById.get(row.FieldID).slots.push(row);
      }
    }
    return [...fieldsById.values()];
  }, [fields]);

  const visible = grouped.filter((row) =>
    (!filter || [row.FieldName, row.Location].join(" ").toLowerCase().includes(filter.toLowerCase())) &&
    (!typeFilter || row.FieldType === typeFilter) &&
    (!statusFilter || row.Status === statusFilter)
  );

  async function perform(action) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await action();
      setMessage(result?.message || "Thao tác thành công");
      await refresh();
      return result;
    } catch (err) {
      setError(err.message || "Thao tác thất bại");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function openNew() {
    setEditingId("new");
    setForm({...emptyField});
    setPrices([]);
    setPriceId(null);
    setPriceForm({...emptyPrice});
  }

  async function openField(id) {
    setBusy(true);
    setError("");
    try {
      const detail = await getManagedField(id);
      setEditingId(id);
      setForm({
        FieldName: detail.FieldName || "",
        FieldType: detail.FieldType || "",
        Location: detail.Location || "",
        Image: detail.Image || "",
        Status: detail.Status || "AVAILABLE"
      });
      setPrices(detail.Prices || []);
      setPriceId(null);
      setPriceForm({...emptyPrice});
    } catch (err) {
      setError(err.message || "Không lấy được chi tiết sân");
    } finally {
      setBusy(false);
    }
  }

  async function saveField(event) {
    event.preventDefault();
    const data = {...form};
    const result = await perform(() => editingId === "new"
      ? createManagedField({...data, Prices: []})
      : updateManagedField(editingId, {
          FieldName: data.FieldName, FieldType: data.FieldType,
          Location: data.Location, Image: data.Image
        }));
    if (result) {
      setEditingId(null);
      if (editingId === "new") {
        setMessage("Đã tạo sân mới. Chọn Sửa / Giá để thiết lập khung giờ.");
      }
    }
  }

  async function changeStatus(field) {
    const next = field.Status === "AVAILABLE" ? "MAINTENANCE" : "AVAILABLE";
    if (!window.confirm(`Chuyển sân "${field.FieldName}" sang ${next}?`)) return;
    await perform(() => setManagedFieldStatus(field.FieldID, next));
  }

  async function removeField(field) {
    if (!window.confirm(`Xóa hoặc ngừng hoạt động sân "${field.FieldName}"? Sân đã có lịch sử booking sẽ được bảo toàn.`)) return;
    await perform(() => deleteManagedField(field.FieldID));
  }

  async function savePrice(event) {
    event.preventDefault();
    const payload = {...priceForm, Price: Number(priceForm.Price)};
    if (!(payload.Price > 0)) {
      setError("Giá phải lớn hơn 0");
      return;
    }
    const result = await perform(() => priceId == null
      ? addManagedPrice(editingId, payload)
      : updateManagedPrice(editingId, priceId, payload));
    if (result) {
      setPrices(result.field?.Prices || []);
      setPriceId(null);
      setPriceForm({...emptyPrice});
    }
  }

  async function removePrice(id) {
    if (!window.confirm("Xóa khung giá này?")) return;
    const result = await perform(() => deleteManagedPrice(editingId, id));
    if (result) setPrices(result.field?.Prices || []);
  }

  if (!isAdmin) return <Navigate to="/admin/bookings" replace />;

  return (
    <>
      <div className="title-row">
        <h1>QUẢN LÝ SÂN BÓNG</h1>
        <button type="button" className="add-btn" disabled={busy} onClick={openNew}>+ Thêm sân mới</button>
      </div>

      <div className="cards">
        <div className="card"><p>Tổng số sân</p><h2>{grouped.length}</h2></div>
        <div className="card"><p>Đang hoạt động</p><h2>{grouped.filter(f => f.Status === "AVAILABLE").length}</h2></div>
        <div className="card"><p>Đang bảo trì</p><h2>{grouped.filter(f => f.Status !== "AVAILABLE").length}</h2></div>
      </div>

      <div className="uc15-toolbar">
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Tìm tên sân, địa điểm..." aria-label="Tìm sân" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Loại sân">
          <option value="">Tất cả loại sân</option>
          {[...new Set(grouped.map(f => f.FieldType))].filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Trạng thái">
          <option value="">Tất cả trạng thái</option>
          <option value="AVAILABLE">AVAILABLE</option>
          <option value="MAINTENANCE">MAINTENANCE</option>
        </select>
        <button type="button" disabled={busy} onClick={refresh}>Làm mới</button>
      </div>

      {error && <p className="uc15-error" role="alert">{error}</p>}
      {message && <p className="uc15-success" role="status">{message}</p>}

      <div className="table-box">
        <table>
          <thead><tr><th>Sân</th><th>Loại</th><th>Địa điểm</th><th>Giá / khung giờ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={6}>Không tìm thấy sân</td></tr>}
            {visible.map(field => (
              <tr key={field.FieldID}>
                <td><strong>{field.FieldName}</strong><small> #{field.FieldID}</small></td>
                <td>{field.FieldType}</td><td>{field.Location}</td>
                <td>{field.slots.length ? field.slots.map((s,i) =>
                  <div key={i} className="uc15-price-row">{String(s.StartTime).slice(0,5)} - {String(s.EndTime).slice(0,5)}: <strong>{money(s.Price)}</strong></div>)
                  : "Chưa có khung giá"}</td>
                <td><span className={field.Status === "AVAILABLE" ? "status available" : "status maintenance"}>{field.Status}</span></td>
                <td><div className="uc15-actions">
                  <button type="button" className="edit-btn" disabled={busy} onClick={() => openField(field.FieldID)}>Sửa / Giá</button>
                  <button type="button" disabled={busy} onClick={() => changeStatus(field)}>{field.Status === "AVAILABLE" ? "Bảo trì" : "Mở sân"}</button>
                  <button type="button" className="uc15-danger" disabled={busy} onClick={() => removeField(field)}>Xóa</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingId !== null && <div className="modal">
        <div className="modal-content uc15-modal" role="dialog" aria-modal="true" aria-label="Thông tin sân bóng">
          <h2>{editingId === "new" ? "Thêm sân mới" : `Chỉnh sửa sân #${editingId}`}</h2>
          <form className="uc15-form" onSubmit={saveField}>
            <label>Tên sân<input required maxLength={150} value={form.FieldName} onChange={e => setForm({...form,FieldName:e.target.value})} /></label>
            <label>Loại sân<input required maxLength={50} value={form.FieldType} onChange={e => setForm({...form,FieldType:e.target.value})} /></label>
            <label>Địa điểm<input required maxLength={255} value={form.Location} onChange={e => setForm({...form,Location:e.target.value})} /></label>
            <label>Đường dẫn ảnh<input maxLength={500} value={form.Image} onChange={e => setForm({...form,Image:e.target.value})} /></label>
            {editingId === "new" && <label>Trạng thái<select value={form.Status} onChange={e => setForm({...form,Status:e.target.value})}><option value="AVAILABLE">AVAILABLE</option><option value="MAINTENANCE">MAINTENANCE</option></select></label>}
            <div className="uc15-actions">
              <button className="save-btn" type="submit" disabled={busy}>Lưu sân</button>
              <button type="button" disabled={busy} onClick={() => setEditingId(null)}>Đóng</button>
            </div>
          </form>

          {editingId !== "new" && <>
            <h3>Quản lý khung giờ / bảng giá</h3>
            <div className="uc15-prices">
              {prices.length === 0 && <p>Chưa có khung giá</p>}
              {prices.map(p => <div className="uc15-price-entry" key={p.PriceID}>
                <span>{p.StartTime} - {p.EndTime} · <strong>{money(p.Price)}</strong></span>
                <div className="uc15-actions">
                  <button type="button" disabled={busy} onClick={() => {setPriceId(p.PriceID);setPriceForm({StartTime:p.StartTime,EndTime:p.EndTime,Price:p.Price});}}>Sửa</button>
                  <button type="button" className="uc15-danger" disabled={busy} onClick={() => removePrice(p.PriceID)}>Xóa</button>
                </div>
              </div>)}
            </div>
            <form className="uc15-form" onSubmit={savePrice}>
              <h4>{priceId == null ? "Thêm khung giá" : "Sửa khung giá"}</h4>
              <label>Giờ bắt đầu<input type="time" required value={priceForm.StartTime} onChange={e => setPriceForm({...priceForm,StartTime:e.target.value})} /></label>
              <label>Giờ kết thúc<input type="time" required value={priceForm.EndTime} onChange={e => setPriceForm({...priceForm,EndTime:e.target.value})} /></label>
              <label>Giá (VNĐ)<input type="number" min="1" step="1" required value={priceForm.Price} onChange={e => setPriceForm({...priceForm,Price:e.target.value})} /></label>
              <div className="uc15-actions">
                <button className="save-btn" disabled={busy}>Lưu khung giá</button>
                {priceId != null && <button type="button" onClick={() => {setPriceId(null);setPriceForm({...emptyPrice});}}>Bỏ sửa</button>}
              </div>
            </form>
          </>}
        </div>
      </div>}
    </>
  );
}
