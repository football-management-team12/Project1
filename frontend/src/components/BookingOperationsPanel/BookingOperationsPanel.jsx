import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api";
import { bookingBalance } from "../../utils/bookingStatus";
import { formatBusinessTime } from "../../utils/businessClock";
import useBookingClock from "../../hooks/useBookingClock";
import "./BookingOperationsPanel.css";

const labels = { CHECKED_IN:"Khách đã đến", NO_SHOW:"Khách không đến · giữ cọc", CANCELLATION_RESTORED:"Đính chính và khôi phục giữ sân", CANCELLATION_DECISION_CORRECTED:"Đính chính quyết định duyệt hủy", CANCELLATION_AUDIT_REUSED:"Lưu bản ghi xử lý trước đó", CANCELLATION_RECORDED:"Ghi nhận hủy đơn" };

export default function BookingOperationsPanel({ booking, onChanged }) {
  const now = useBookingClock();
  const [reason, setReason] = useState("");
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const start = Date.parse(`${booking.BookingDate}T${booking.StartTime?.slice(0,5)}:00+07:00`);
  const end = Date.parse(`${booking.BookingDate}T${booking.EndTime?.slice(0,5)}:00+07:00`);
  const balance = bookingBalance(booking);
  const checkedIn = booking.AttendanceState === "CHECKED_IN";
  useEffect(() => {
    let active = true;
    apiRequest(`/api/bookings/${booking.BookingID}/operations`).then(data => {
      if (active) { setEvents(data.events || []); setError(""); }
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [booking.BookingID, booking.Status, booking.AttendanceState]);

  const operate = async action => {
    if (busy) return;
    if (action !== "check-in" && !reason.trim()) { setError("Vui lòng nhập lý do trước khi cập nhật."); return; }
    const message = action === "approve-rejected-cancellation" ? "Đính chính quyết định từ chối thành cho phép hủy? Đơn sẽ ngừng giữ sân và khoản đã trả chuyển sang chờ hoàn. Quyết định cũ vẫn lưu trong lịch sử." : action === "restore-cancellation" ? "Khôi phục giữ sân cho đơn này? Hệ thống sẽ kiểm tra trùng lịch và hoàn tiền, đồng thời lưu quyết định cũ." : action === "no-show" ? "Xác nhận khách không đến? Đơn sẽ ngừng giữ sân, giữ cọc và không thu thêm phần còn lại." : "Xác nhận khách đã đến sân?";
    if (!window.confirm(message)) return;
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/admin/bookings/${booking.BookingID}/operations/${action}`, { method:"POST", body:JSON.stringify({reason:reason.trim()}) });
      setReason(""); await onChanged();
    } catch (err) { setError(err.message || "Không thể cập nhật"); }
    finally { setBusy(false); }
  };
  return <section className="booking-operations-panel">
    <h3>Khách không đến &amp; đính chính</h3>
    {booking.AttendanceState === "NO_SHOW" && <p>Khách không đến. Không hoàn tiền cọc, không thu thêm phần còn lại.</p>}
    <label>Lý do / ghi chú<textarea value={reason} maxLength={500} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="Bắt buộc khi đánh dấu không đến hoặc khôi phục đơn hủy nhầm" /></label>
    {error && <p role="alert" className="booking-operation-error">{error}</p>}
    <div className="booking-operation-actions">
      {booking.Status === "CONFIRMED" && !checkedIn && <>
        <button type="button" disabled={busy || booking.CancellationRequest?.status === "PENDING_REVIEW" || now < end} onClick={() => operate("no-show")}>Khách không đến</button>
      </>}
      {booking.Status === "CANCELLED" && <button type="button" disabled={busy || balance.refunded > 0 || now >= end} onClick={() => operate("restore-cancellation")}>Đính chính · khôi phục giữ sân</button>}
      {booking.Status === "CONFIRMED" && booking.CancellationRequest?.status === "REJECTED" && <button type="button" disabled={busy || now >= start} onClick={() => operate("approve-rejected-cancellation")}>Đính chính · cho phép hủy</button>}
    </div>
    {booking.Status === "CONFIRMED" && !checkedIn && <small>Chỉ đánh dấu khách không đến khi đã hết giờ đá và phải nhập lý do. Không hoàn tiền cọc; khoản trả trước vượt tiền cọc được xử lý riêng.</small>}
    {booking.Status === "CANCELLED" && <small>Không khôi phục khi đã hoàn tiền, trùng lịch hoặc đã qua thời gian cho phép. Mọi đính chính đều lưu người thực hiện, thời gian và dữ liệu cũ.</small>}
    {events.length > 0 && <div className="booking-operation-history"><h4>Lịch sử thao tác</h4>{events.map(event => <article key={event.eventId}>
      <strong>{labels[event.type] || event.type}{event.lateEntry ? " (ghi nhận bổ sung)" : ""}</strong><p>{formatBusinessTime(event.at)} · {event.actor}{event.actorUserId ? ` (#${event.actorUserId})` : ""}</p>
      {event.reason && <p>{event.reason}</p>}
      {event.details?.previousBookingStatus && <p>Trạng thái trước: {event.details.previousBookingStatus} → {event.details.newBookingStatus}</p>}
    </article>)}</div>}
  </section>;
}
