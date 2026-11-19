import BookingPaymentBadge from "../../components/BookingPaymentBadge/BookingPaymentBadge";
import BookingOperationsPanel from "../../components/BookingOperationsPanel/BookingOperationsPanel";
import { formatBusinessTime } from "../../utils/businessClock";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useLocation } from "react-router-dom";
import { Check, Eye, RefreshCw, X } from "lucide-react";

import SettlementPanel from "../../components/SettlementPanel/SettlementPanel";
import useBookingClock from "../../hooks/useBookingClock";
import useBookingRange from "../../hooks/useBookingRange";
import { vietnamDate } from "../../utils/bookingTime";
import { dateRangeError, formatBookingDate } from "../../utils/bookingDateRange";
import { bookingNeedsCollection, bookingDisplayStatus, bookingBalance } from "../../utils/bookingStatus";
import { confirmDepositRefund, downloadRefundEvidence, getCancellationInfo, decideCancellation, adminCancelBooking } from "../../services/cancellation_service";

import {
  getBookingDetail,
  updateBookingStatus,
} from "../../services/booking_service";

import "./BookingManagement.css";


const LABELS = {
  IN_PROGRESS: ["Đang đá", "booking-status-progress"],
  AWAITING_ARRIVAL: ["Chờ khách đến", "booking-status-ended"],
  NO_SHOW: ["Khách không đến", "booking-status-ended"],
  ENDED: ["Đã kết thúc / hết giờ", "booking-status-ended"],
  PENDING: [
    "Chờ xác nhận",
    "booking-status-pending"
  ],

  CONFIRMED: [
    "Đã xác nhận",
    "booking-status-confirmed"
  ],

  COMPLETED: [
    "Hoàn thành",
    "booking-status-completed"
  ],

  CANCELLED: [
    "Đã hủy",
    "booking-status-cancelled"
  ],
};


const money = (value) =>
  `${Number(value || 0).toLocaleString("vi-VN")}đ`;


function StatusBadge({ status, booking, now }) {
  const lifecycle = booking ? bookingDisplayStatus(booking, now) : status;
  const [label, css] = LABELS[lifecycle] || [lifecycle || "Không xác định", "booking-status-default"];
  return <div className="booking-status-pair">
    <span className={`booking-status-badge ${css}`}>{label}</span>
    {booking && <BookingPaymentBadge booking={booking} />}
  </div>;
}


export default function BookingManagement() {
  const now = useBookingClock();
  const { user, cancellationInbox } = useOutletContext();
  const location = useLocation();

  const isAdmin =
    String(user?.Role || "").toUpperCase() === "ADMIN";

  const [range, setRange] = useState(() => {
    const today = vietnamDate();
    return { from: today, to: today };
  });
  const [dateFilter, setDateFilter] = useState(() => ({ mode: "day", ...range }));
  const dateError = dateRangeError(dateFilter.from, dateFilter.to);
  const { bookings, loading, error: bookingsError, refresh: loadBookings } = useBookingRange(user?.UserID, range);
  const changeDates = next => {
    setDateFilter(next);
    if (!dateRangeError(next.from, next.to)) {
      setRange(previous => previous.from === next.from && previous.to === next.to
        ? previous : { from: next.from, to: next.to });
    }
  };

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [updatingId, setUpdatingId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  // UC07: independent state; no changes to UC09 settlement state.
  const [cancelHistory, setCancelHistory] = useState(null);
  const [cancelHistoryError, setCancelHistoryError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [refundFile, setRefundFile] = useState(null);
  const [refundError, setRefundError] = useState("");
  const cancelRequests = cancellationInbox.requests;
  const cancelRequestsError = cancellationInbox.error;
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewNote, setReviewNote] = useState({});


  // ======================================================
  // SEARCH / FILTER
  // ======================================================

  const filtered = useMemo(() => {
    const word = search.trim().toLowerCase();

    return bookings.filter((row) => {
      const fullText = [
        row.BookingID,
        row.CustomerName,
        row.Phone,
        row.Email,
        row.FieldName,
        row.FieldType,
        row.BookingDate
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!word || fullText.includes(word)) &&
        (!filterStatus || bookingDisplayStatus(row, now) === filterStatus)
      );
    });
  }, [bookings, search, filterStatus, now]);


  const stats = useMemo(() => ({
    total: bookings.length,

    confirmed: bookings.filter(
      (b) => bookingDisplayStatus(b, now) === "CONFIRMED"
    ).length,

    cancelled: bookings.filter(
      (b) => bookingDisplayStatus(b, now) === "CANCELLED"
    ).length,

    completed: bookings.filter(
      (b) => bookingDisplayStatus(b, now) === "COMPLETED"
    ).length,
  }), [bookings, now]);


  // ======================================================
  // UC07 - LOAD ADMIN CANCELLATION REQUESTS
  // ======================================================
  const loadCancelRequests = cancellationInbox.refresh;
  useEffect(() => {
    if (location.hash === "#cancellation-requests") {
      document.getElementById("cancellation-requests")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.hash]);

  const handleReview = async (item, decision) => {
    if (!isAdmin || reviewingId) return;
    const note = (reviewNote[item.requestId] || "").trim();
    if (decision === "REJECTED" && !note) {
      alert("Vui lòng nhập lý do từ chối");
      return;
    }
    const confirmation = decision === "APPROVED"
      ? `Cho phép hủy đơn #${item.bookingId}? Đơn sẽ chuyển sang Đã hủy và sân được mở lại để đặt. Ghi chú không thay đổi quyết định này.`
      : `Không cho phép hủy đơn #${item.bookingId}? Đơn vẫn giữ nguyên, khách không thể gửi lại yêu cầu hủy.`;
    if (!window.confirm(confirmation)) return;
    setReviewingId(item.requestId);
    try {
      await decideCancellation(item.requestId, decision, note);
      await Promise.all([loadBookings(), loadCancelRequests()]);
      if (selectedBooking?.BookingID === item.bookingId) {
        const latest = await getBookingDetail(item.bookingId);
        setSelectedBooking(latest);
        setCancelHistory(await getCancellationInfo(item.bookingId));
      }
    } catch (err) {
      alert(err.message || "Xử lý yêu cầu thất bại");
    } finally {
      setReviewingId(null);
    }
  };

  const handleAdminDirectCancel = async (booking) => {
    if (!isAdmin) return;
    const reason = window.prompt(`ADMIN hủy trực tiếp booking #${booking.BookingID}. Nhập lý do:`, "");
    if (reason === null) return;
    if (!window.confirm(`Xác nhận ADMIN hủy trực tiếp booking #${booking.BookingID}?`)) return;
    setUpdatingId(booking.BookingID);
    try {
      await adminCancelBooking(booking.BookingID, reason);
      await Promise.all([loadBookings(), loadCancelRequests()]);
      if (selectedBooking?.BookingID === booking.BookingID) {
        setSelectedBooking(await getBookingDetail(booking.BookingID));
        setCancelHistory(await getCancellationInfo(booking.BookingID));
      }
    } catch (err) {
      alert(err.message || "Hủy đơn thất bại");
    } finally {
      setUpdatingId(null);
    }
  };

  // ======================================================
  // VIEW BOOKING DETAIL
  // ======================================================

  const viewBooking = useCallback(async (bookingId) => {
    setDetailLoading(true);

    try {
      const detail = await getBookingDetail(bookingId);

      setSelectedBooking(detail);
      setCancelHistory(null);
      setCancelHistoryError("");
      setCopyNotice("");
      setRefundReference("");
      setRefundFile(null);
      setRefundError("");
      if (isAdmin) {
        try { setCancelHistory(await getCancellationInfo(bookingId)); }
        catch (e) { setCancelHistoryError(e.message || "Không tải được lịch sử hủy"); }
      }

    } catch (err) {
      alert(
        err.message || "Không thể xem chi tiết booking"
      );

    } finally {
      setDetailLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    const value = new URLSearchParams(location.search).get("bookingId");
    if (!value || !/^[1-9]\d{0,9}$/.test(value)) return;
    const bookingId = Number(value);
    if (bookingId <= 2147483647) void viewBooking(bookingId);
  }, [location.search, viewBooking]);


  // ======================================================
  // UPDATE BOOKING STATUS
  // ======================================================

  const changeStatus = async (booking, nextStatus) => {
    const label =
      nextStatus === "COMPLETED" ? "Đã kết thúc buổi đá" : LABELS[nextStatus]?.[0] || nextStatus;

    const accepted = window.confirm(
      `Chuyển booking #${booking.BookingID} sang "${label}"?`
    );

    if (!accepted) return;

    setUpdatingId(booking.BookingID);

    try {
      await updateBookingStatus(
        booking.BookingID,
        nextStatus,
        user.UserID
      );

      await loadBookings();

      if (
        selectedBooking?.BookingID === booking.BookingID
      ) {
        setSelectedBooking(
          await getBookingDetail(booking.BookingID)
        );
      }

    } catch (err) {
      alert(
        err.message || "Không thể cập nhật trạng thái"
      );

    } finally {
      setUpdatingId(null);
    }
  };


  // ======================================================
  // UC09 - REFRESH AFTER PAYMENT CONFIRMATION
  // ======================================================

  const onPaid = async () => {
    if (!selectedBooking) return;

    await loadBookings();

    const detail = await getBookingDetail(
      selectedBooking.BookingID
    );

    setSelectedBooking(detail);
  };


  // ======================================================
  // ACTION BUTTONS
  // ======================================================

  const handleRefund = async (booking) => {
    if (!isAdmin || updatingId !== null) return;
    if (!refundReference.trim() || !refundFile) { setRefundError("Nhập mã giao dịch và chọn biên lai chuyển khoản."); return; }
    if (refundFile.size > 2 * 1024 * 1024) { setRefundError("Biên lai tối đa 2 MB."); return; }
    if (!window.confirm("Bạn đã hoàn " + money(cancelHistory?.refundableAmount ?? bookingBalance(booking).netPaid) + " tiền cho đơn #" + booking.BookingID + "?")) return;
    setUpdatingId(booking.BookingID);
    setRefundError("");
    try {
      await confirmDepositRefund(booking.BookingID, refundReference, refundFile);
      await loadBookings();
      if (selectedBooking?.BookingID === booking.BookingID) {
        setSelectedBooking(await getBookingDetail(booking.BookingID));
        setCancelHistory(await getCancellationInfo(booking.BookingID));
      }
    } catch (err) { setRefundError(err.message || "Không thể xác nhận hoàn tiền"); }
    finally { setUpdatingId(null); }
  };

  const copyTransferValue = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopyNotice(`Đã sao chép ${label}.`);
    } catch {
      setCopyNotice("Không thể sao chép tự động. Bạn có thể chọn và sao chép thông tin bên dưới.");
    }
  };

  const actions = (booking, inDetail = false) => {
    const busy =
      updatingId === booking.BookingID;

    if (!inDetail) return <button type="button" className="booking-action-btn booking-action-detail"
      disabled={busy || detailLoading} onClick={() => viewBooking(booking.BookingID)}>Chi tiết</button>;

    return (
      <div className="booking-actions">

        {booking.Status === "PENDING" && (
          <>
            <button
              type="button"
              className="booking-action-btn booking-action-confirm"
              disabled={busy}
              onClick={() =>
                changeStatus(booking, "CONFIRMED")
              }
            >
              Xác nhận
            </button>

            <button
              type="button"
              className="booking-action-btn booking-action-cancel"
              disabled={busy}
              onClick={() =>
                handleAdminDirectCancel(booking)
              }
            >
              Hủy đơn
            </button>
          </>
        )}


        {booking.Status === "CONFIRMED" && now < Date.parse(`${booking.BookingDate}T${booking.StartTime?.slice(0,5)}:00+07:00`) && (
          <>
            <button
              type="button"
              className="booking-action-btn booking-action-cancel"
              disabled={busy}
              onClick={() =>
                handleAdminDirectCancel(booking)
              }
            >
              Hủy đơn
            </button>
          </>
        )}

      </div>
    );
  };


  // ======================================================
  // BOOKING DETAIL FIELDS
  // ======================================================

  const detailFields = selectedBooking ? [
    [
      "Khách hàng",
      selectedBooking.CustomerName ||
        `User #${selectedBooking.UserID}`
    ],
    [
      "Số điện thoại",
      selectedBooking.Phone || "Chưa cập nhật"
    ],
    [
      "Email",
      selectedBooking.Email || "Chưa cập nhật"
    ],
    [
      "Sân",
      selectedBooking.FieldName ||
        `Sân #${selectedBooking.FieldID}`
    ],
    [
      "Loại sân",
      selectedBooking.FieldType || "Chưa cập nhật"
    ],
    [
      "Địa điểm",
      selectedBooking.Location || "Chưa cập nhật"
    ],
    [
      "Ngày đặt",
      selectedBooking.BookingDate
    ],
    [
      "Khung giờ",
      `${selectedBooking.StartTime} - ${selectedBooking.EndTime}`
    ],
    [
      "Tổng tiền",
      money(selectedBooking.TotalAmount)
    ],
    [
      "Đã thu",
      money(bookingBalance(selectedBooking).netPaid)
    ],
    [
      "Còn lại",
      money(bookingBalance(selectedBooking).remaining)
    ]
  ] : [];


  return (
    <>

      {/* HEADER */}

      <div className="title-row">
        <h1>QUẢN LÝ ĐẶT SÂN</h1>

        <button
          className="add-btn"
          type="button"
          disabled={loading}
          onClick={loadBookings}
        >
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>


      {/* STATISTICS */}

      <div className="cards booking-lifecycle-stats">
        {[
          ["Tổng số đơn", stats.total],
          ["Đã xác nhận", stats.confirmed],
          ["Đã hủy", stats.cancelled],
          ["Hoàn thành", stats.completed]
        ].map(([title, count]) => (
          <div className="card" key={title}>
            <p>{title}</p>
            <h2>{loading ? "…" : bookingsError ? "—" : count}</h2>
          </div>
        ))}
      </div>


      {/* FILTER */}

      <div className="filter booking-date-filter">

        <input
          aria-label="Tìm booking"
          placeholder="Mã đơn, khách hàng, sân, SĐT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          aria-label="Lọc trạng thái"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">
            Tất cả trạng thái
          </option>

          {Object.entries(LABELS).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label[0]}
              </option>
            )
          )}
        </select>

        <div className="booking-date-controls">
          <label>Thời gian
            <select aria-label="Chọn kiểu lọc ngày" value={dateFilter.mode}
              onChange={event => changeDates({ ...dateFilter, mode: event.target.value, to: event.target.value === "day" ? dateFilter.from : dateFilter.to })}>
              <option value="day">Một ngày</option>
              <option value="range">Khoảng ngày</option>
            </select>
          </label>
          <label>{dateFilter.mode === "day" ? "Ngày đặt sân" : "Từ ngày"}
            <input type="date" aria-label={dateFilter.mode === "day" ? "Ngày đặt sân" : "Từ ngày"}
              min="1900-01-01" max="9998-12-31" value={dateFilter.from}
              aria-invalid={Boolean(dateError)} aria-describedby={dateError ? "booking-date-error" : undefined}
              onChange={event => changeDates({ ...dateFilter, from: event.target.value, to: dateFilter.mode === "day" ? event.target.value : dateFilter.to })} />
          </label>
          {dateFilter.mode === "range" && <label>Đến ngày
            <input type="date" aria-label="Đến ngày" min="1900-01-01" max="9998-12-31"
              value={dateFilter.to} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? "booking-date-error" : undefined}
              onChange={event => changeDates({ ...dateFilter, to: event.target.value })} />
          </label>}
          <button type="button" className="booking-today-button" onClick={() => {
            const today = vietnamDate(now);
            changeDates({ mode: "day", from: today, to: today });
          }}>Hôm nay</button>
        </div>
      </div>

      {dateError && <p className="booking-filter-error" id="booking-date-error" role="alert">{dateError} Vẫn hiển thị phạm vi hợp lệ gần nhất.</p>}
      <p className="booking-date-summary">Đang xem: <strong>{formatBookingDate(range.from)}{range.from !== range.to ? ` – ${formatBookingDate(range.to)}` : ""}</strong> ·</p>
      {bookingsError && <div className="booking-filter-error" role="alert">{bookingsError} <button type="button" onClick={loadBookings}>Thử lại</button></div>}


      {/* UC07 - Danh sách yêu cầu hủy chờ ADMIN duyệt */}
      {isAdmin && (
        <section id="cancellation-requests" className="uc07-admin-requests" aria-labelledby="cancellation-requests-title">
          <div className="cancellation-requests-heading">
            <h2 id="cancellation-requests-title">
              Yêu cầu hủy chờ duyệt
              <span className="cancellation-requests-count">{cancelRequests.length}</span>
            </h2>
            <button type="button" className="cancellation-btn cancellation-btn-refresh" onClick={loadCancelRequests}>
              <RefreshCw size={16} aria-hidden="true" />
              Làm mới yêu cầu
            </button>
          </div>

          {cancelRequestsError && <p role="alert" className="cancellation-requests-error">{cancelRequestsError}</p>}
          {!cancelRequestsError && cancelRequests.length === 0 && (
            <p className="cancellation-requests-empty">Không có yêu cầu hủy đang chờ.</p>
          )}

          <div className="cancellation-requests-list">
            {cancelRequests.map(item => (
              <article key={item.requestId} className="cancellation-request-card" aria-busy={reviewingId === item.requestId}>
                <div className="cancellation-request-heading">
                  <div className="cancellation-request-customer">
                    <div className="cancellation-request-title">
                      <strong>Booking #{item.bookingId}</strong>
                      <StatusBadge status={item.bookingStatus} />
                    </div>
                    <p>{item.customerName}</p>
                  </div>
                  <button type="button" className="cancellation-btn cancellation-btn-detail" disabled={detailLoading}
                    onClick={() => viewBooking(item.bookingId)}>
                    <Eye size={16} aria-hidden="true" /> Chi tiết
                  </button>
                </div>

                <div className="cancellation-request-info">
                  <div className="cancellation-request-reason">
                    <span className="cancellation-request-label">Lý do hủy</span>
                    <p>{item.reason || "Không cung cấp"}</p>
                    <p className="cancellation-request-time">Gửi lúc: <time dateTime={item.requestedAt}>{formatBusinessTime(item.requestedAt)}</time></p>
                  </div>
                  <div className="cancellation-request-deposit">
                    <span className="cancellation-request-label">Tiền cọc đã thanh toán</span>
                    <strong>{money(item.depositPaid)}</strong>
                    <p>Hoàn tiền được xử lý sau khi duyệt hủy.</p>
                  </div>
                </div>

                <div className="cancellation-request-review">
                  <label className="cancellation-request-note" htmlFor={`cancellation-note-${item.requestId}`}>
                    Ghi chú duyệt / lý do từ chối
                    <textarea id={`cancellation-note-${item.requestId}`} rows={2}
                      placeholder="Nhập ghi chú (bắt buộc khi từ chối)..."
                      value={reviewNote[item.requestId] || ""} disabled={reviewingId !== null}
                      maxLength={500} onChange={e => setReviewNote(p => ({...p,[item.requestId]:e.target.value}))} />
                  </label>
                  <div className="cancellation-request-actions">
                    <button type="button" className="cancellation-btn cancellation-btn-reject" disabled={reviewingId !== null}
                      onClick={() => handleReview(item,"REJECTED")}>
                      <X size={16} aria-hidden="true" /> Không cho phép hủy
                    </button>
                    <button type="button" className="cancellation-btn cancellation-btn-approve" disabled={reviewingId !== null}
                      onClick={() => handleReview(item,"APPROVED")}>
                      <Check size={16} aria-hidden="true" /> Cho phép hủy
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* BOOKING TABLE */}

      <div className="table-box booking-table-box">
        <table>

          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Khách hàng</th>
              <th>Sân</th>
              <th>Ngày</th>
              <th>Khung giờ</th>
              <th>Tổng tiền</th>
              <th>Đã cọc</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>


          <tbody>
            {loading || filtered.length === 0 ? (
              <tr>
                <td
                  className="booking-empty-cell"
                  colSpan="9"
                >
                  {loading
                    ? "Đang tải booking..."
                    : bookingsError ? "Không tải được đơn đặt sân. Vui lòng thử lại." : "Không có đơn đặt sân trong khoảng thời gian đã chọn"}
                </td>
              </tr>

            ) : (
              filtered.map((b) => (
                <tr key={b.BookingID} className={bookingNeedsCollection(b, now) ? "booking-row-unpaid" : ""}>

                  <td>
                    <strong>#{b.BookingID}</strong>
                  </td>

                  <td>
                    <strong>
                      {b.CustomerName || `User #${b.UserID}`}
                    </strong>
                    <br />
                    <small>{b.Phone || b.Email || ""}</small>
                  </td>

                  <td>
                    {b.FieldName || `Sân #${b.FieldID}`}
                    <br />
                    <small>{b.FieldType || ""}</small>
                  </td>

                  <td>{b.BookingDate}</td>

                  <td>
                    {b.StartTime} - {b.EndTime}
                  </td>

                  <td>
                    <strong>{money(b.TotalAmount)}</strong>
                  </td>
                  <td><strong>{money(b.PaidAmount)}</strong>
                    {Number(b.RefundedAmount) > 0 && <div className="deposit-refunded">Đã hoàn {money(b.RefundedAmount)}</div>}
                  </td>

                  <td>
                    <StatusBadge status={b.Status} cancellation={b.CancellationRequest} booking={b} now={now} />
                  </td>

                  <td>{actions(b)}</td>

                </tr>
              ))
            )}
          </tbody>

        </table>
      </div>


      {/* BOOKING DETAIL MODAL */}

      {selectedBooking && (
        <div className="modal">

          <div
            className="modal-content booking-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Chi tiết booking ${selectedBooking.BookingID}`}
          >

            <div className="booking-detail-header">
              <h2>
                Chi tiết đơn #{selectedBooking.BookingID}
              </h2>

              <StatusBadge
                status={selectedBooking.Status}
                cancellation={selectedBooking.CancellationRequest}
                booking={selectedBooking}
                now={now}
                showReason
              />
            </div>


            <div className="booking-detail-grid">
              {detailFields.map(([name, value]) => (
                <div key={name}>
                  <span>{name}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>


            {/* UC07 - Lịch sử hủy, đọc từ SQL Server thông qua API */}
            {isAdmin && cancelHistory?.latestRequest && (
              <section className="uc07-admin-request-history">
                <h3>Lịch sử yêu cầu hủy</h3>
                <p><strong>Kết quả:</strong> {{ REJECTED: "Chủ sân đã từ chối hủy", APPROVED: "Chủ sân đã chấp nhận hủy", PENDING_REVIEW: "Đang chờ chủ sân duyệt" }[cancelHistory.latestRequest.status] || "Đang cập nhật"}</p>
                <p><strong>Lý do khách yêu cầu hủy:</strong> {cancelHistory.latestRequest.reason || "Không cung cấp"}</p>
                {cancelHistory.latestRequest.requestedAt && <p><strong>Thời gian yêu cầu:</strong> {formatBusinessTime(cancelHistory.latestRequest.requestedAt)}</p>}
                {cancelHistory.latestRequest.reviewNote && <p><strong>Phản hồi chủ sân:</strong> {cancelHistory.latestRequest.reviewNote}</p>}
                {cancelHistory.latestRequest.reviewedAt && <p><strong>Thời gian xử lý:</strong> {formatBusinessTime(cancelHistory.latestRequest.reviewedAt)}</p>}
                {cancelHistory.latestRequest.status === "REJECTED" && <p>Yêu cầu hủy bị từ chối; đơn tiếp tục được sử dụng và thanh toán bình thường. Lịch sử này được giữ lại sau khi đơn hoàn thành.</p>}
              </section>
            )}
            {isAdmin && selectedBooking.Status === "CANCELLED" && (
              <section className="uc07-admin-history" style={{padding:16,marginTop:16,border:"1px solid #fecaca",borderRadius:10}}>
                <h3>UC07 – Thông tin hủy booking</h3>
                {cancelHistoryError && <p role="alert">{cancelHistoryError}</p>}
                {cancelHistory?.cancellation ? <>
                  <p><strong>Lý do hủy:</strong> {cancelHistory.cancellation.reason || "Không cung cấp"}</p>
                  <p><strong>Người hủy:</strong> {cancelHistory.cancellation.canceledByName} ({cancelHistory.cancellation.canceledByRole})</p>
                  {cancelHistory.latestRequest && <p><strong>Người yêu cầu:</strong> User #{cancelHistory.latestRequest.requestedByUserId}</p>}
                  <p><strong>Thời gian:</strong> {cancelHistory.cancellation.canceledAt}</p>
                  <p><strong>Tiền cọc:</strong> {money(cancelHistory.depositPaid)}</p>
                  <p><strong>Xử lý tiền cọc:</strong> {cancelHistory.refundStatus === "REFUNDED" ? "Đã hoàn tiền" : cancelHistory.refundStatus === "NOT_REQUIRED" ? "Không cần hoàn tiền" : "Chờ hoàn tiền"}</p>
                  <p>{cancelHistory.refundNote}</p>
                </> : <p>Chưa có bản ghi BookingCancellations cho booking này.</p>}
              </section>
            )}

            {isAdmin && (selectedBooking.AttendanceState !== "NO_SHOW" || Number(cancelHistory?.refundableAmount)>0) && ((cancelHistory?.latestRequest?.status === "APPROVED" && cancelHistory.latestRequest.refundAccount) ||
              (selectedBooking.Status === "CANCELLED" && Number(selectedBooking.TotalPaidAmount) > 0)) && (
              <section className="booking-refund-details">
                <h3>Chuyển khoản hoàn tiền</h3>
                {detailLoading && <p>Đang tải thông tin nhận tiền...</p>}
                {cancelHistoryError && <p role="alert">{cancelHistoryError}</p>}
                {cancelHistory?.latestRequest?.refundAccount ? (
                  <dl className="booking-refund-grid">
                    <div><dt>Ngân hàng</dt><dd>{cancelHistory.latestRequest.refundAccount.bankName}</dd></div>
                    <div><dt>Số tài khoản</dt><dd>{cancelHistory.latestRequest.refundAccount.accountNumber}
                      <button type="button" onClick={() => copyTransferValue(cancelHistory.latestRequest.refundAccount.accountNumber, "số tài khoản")}>Sao chép</button>
                    </dd></div>
                    <div><dt>Chủ tài khoản</dt><dd>{cancelHistory.latestRequest.refundAccount.accountHolder}</dd></div>
                    <div><dt>Số tiền cần hoàn</dt><dd>{money(selectedBooking.RefundedAmount || cancelHistory?.refundableAmount || selectedBooking.TotalPaidAmount)}</dd></div>
                    <div><dt>Nội dung chuyển khoản</dt><dd>HOAN COC {selectedBooking.BookingID}
                      <button type="button" onClick={() => copyTransferValue(`HOAN COC ${selectedBooking.BookingID}`, "nội dung chuyển khoản")}>Sao chép</button>
                    </dd></div>
                  </dl>
                ) : !detailLoading && !cancelHistoryError && <p>Khách chưa cung cấp tài khoản nhận hoàn tiền. Vui lòng liên hệ khách để lấy thông tin chuyển khoản.</p>}
                {copyNotice && <p role="status">{copyNotice}</p>}
                {Number(selectedBooking.RefundedAmount) > 0 ? (
                  <div>
                    <p className="deposit-refunded" role="status">Đã hoàn {money(selectedBooking.RefundedAmount)} tiền cọc. Khách có thể xem thông báo trong đơn đặt sân.</p>
                    {cancelHistory?.refundTransactionReference && <p>Mã giao dịch: {cancelHistory.refundTransactionReference}</p>}
                    {cancelHistory?.hasRefundEvidence && <button type="button" className="booking-action-btn booking-action-detail"
                      onClick={() => downloadRefundEvidence(selectedBooking.BookingID).catch(err => setRefundError(err.message))}>Tải biên lai hoàn tiền</button>}
                    {refundError && <p role="alert" className="booking-refund-error">{refundError}</p>}
                  </div>
                ) : selectedBooking.Status === "CANCELLED" ? (
                  <form className="booking-refund-proof" onSubmit={event => { event.preventDefault(); handleRefund(selectedBooking); }}>
                    <p>Chuyển tiền trong ứng dụng ngân hàng, kiểm tra giao dịch thành công rồi xác nhận bên dưới.</p>
                    <label htmlFor="refund-reference">Mã giao dịch ngân hàng</label>
                    <input id="refund-reference" required minLength={3} maxLength={100} value={refundReference}
                      disabled={updatingId !== null} onChange={event => setRefundReference(event.target.value)} />
                    <label htmlFor="refund-evidence">Biên lai chuyển khoản (PNG, JPEG hoặc PDF, tối đa 2 MB)</label>
                    <input id="refund-evidence" type="file" required accept="image/png,image/jpeg,application/pdf"
                      disabled={updatingId !== null} onChange={event => setRefundFile(event.target.files?.[0] || null)} />
                    {refundError && <p role="alert" className="booking-refund-error">{refundError}</p>}
                    <button type="submit" className="booking-action-btn booking-action-confirm"
                      disabled={updatingId !== null || detailLoading || Boolean(cancelHistoryError)}>
                      {updatingId === selectedBooking.BookingID ? "Đang xác nhận..." : "Xác nhận đã hoàn tiền"}
                    </button>
                  </form>
                ) : <p>Duyệt yêu cầu hủy trước khi hoàn tiền.</p>}
              </section>
            )}

            {/* UC09: Chỉ ADMIN được xác nhận */}
            {isAdmin && <BookingOperationsPanel booking={selectedBooking} onChanged={async () => { await loadBookings(); await viewBooking(selectedBooking.BookingID); cancellationInbox.refresh(); }} />}

            {isAdmin && (
              <>
              <div className="booking-detail-toolbar">
              {actions(selectedBooking, true)}
              <Link className="ui-button ui-button-secondary" to={`/admin/bookings/${selectedBooking.BookingID}/invoice`}>Xem hóa đơn</Link>
              </div>
              <SettlementPanel
                bookingId={selectedBooking.BookingID}
                mode="admin"
                refreshKey={
                  `${selectedBooking.Status}-${selectedBooking.PaidAmount}`
                }
                onPaymentConfirmed={onPaid}
              />
              </>
            )}


            <button
              type="button"
              className="cancel-btn booking-detail-close"
              onClick={() => setSelectedBooking(null)}
            >
              Đóng
            </button>

          </div>
        </div>
      )}

    </>
  );
}
