
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Check, Eye, RefreshCw, X } from "lucide-react";

import SettlementPanel from "../../components/SettlementPanel/SettlementPanel";
import { confirmDepositRefund, downloadRefundEvidence, getCancellationInfo, getAdminCancellationRequests, decideCancellation, adminCancelBooking } from "../../services/cancellation_service";

import {
  getAllBookings,
  getBookingDetail,
  updateBookingStatus,
} from "../../services/booking_service";

import "./BookingManagement.css";


const LABELS = {
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


function StatusBadge({ status }) {
  const [label, css] =
    LABELS[String(status || "").toUpperCase()] ||
    [status || "Không xác định", "booking-status-default"];

  return (
    <span className={`booking-status-badge ${css}`}>
      {label}
    </span>
  );
}


export default function BookingManagement() {
  const { user } = useOutletContext();

  const isAdmin =
    String(user?.Role || "").toUpperCase() === "ADMIN";

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

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
  const [cancelRequests, setCancelRequests] = useState([]);
  const [cancelRequestsError, setCancelRequestsError] = useState("");
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewNote, setReviewNote] = useState({});


  // ======================================================
  // LOAD BOOKINGS
  // ======================================================

  const loadBookings = async () => {
    if (!user?.UserID) return;

    setLoading(true);

    try {
      const result = await getAllBookings(user.UserID);

      setBookings(
        Array.isArray(result?.Bookings)
          ? result.Bookings
          : []
      );

    } catch (err) {
      alert(
        err.message || "Không thể tải danh sách đặt sân"
      );

    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (!user?.UserID) return undefined;

    let active = true;

    setLoading(true);

    getAllBookings(user.UserID)
      .then((result) => {
        if (active) {
          setBookings(
            Array.isArray(result?.Bookings)
              ? result.Bookings
              : []
          );
        }
      })
      .catch((err) => {
        if (active) {
          alert(
            err.message || "Không tải được booking"
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.UserID]);


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
        (!filterStatus || row.Status === filterStatus)
      );
    });
  }, [bookings, search, filterStatus]);


  const stats = useMemo(() => ({
    total: bookings.length,

    pending: bookings.filter(
      (b) => b.Status === "PENDING"
    ).length,

    confirmed: bookings.filter(
      (b) => b.Status === "CONFIRMED"
    ).length,

    completed: bookings.filter(
      (b) => b.Status === "COMPLETED"
    ).length,

  }), [bookings]);


  // ======================================================
  // UC07 - LOAD ADMIN CANCELLATION REQUESTS
  // ======================================================
  const loadCancelRequests = async () => {
    if (!isAdmin) return;
    try {
      setCancelRequestsError("");
      const response = await getAdminCancellationRequests("PENDING_REVIEW");
      setCancelRequests(response.requests || []);
    } catch (err) {
      setCancelRequestsError(err.message || "Không tải được yêu cầu hủy");
    }
  };

  useEffect(() => {
    if (isAdmin) loadCancelRequests();
  }, [isAdmin, user?.UserID]);

  const handleReview = async (item, decision) => {
    if (!isAdmin || reviewingId) return;
    const note = (reviewNote[item.requestId] || "").trim();
    if (decision === "REJECTED" && !note) {
      alert("Vui lòng nhập lý do từ chối");
      return;
    }
    if (!window.confirm(`${decision === "APPROVED" ? "Duyệt" : "Từ chối"} yêu cầu hủy booking #${item.bookingId}?`)) return;
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

  const viewBooking = async (bookingId) => {
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
  };


  // ======================================================
  // UPDATE BOOKING STATUS
  // ======================================================

  const changeStatus = async (booking, nextStatus) => {
    const label =
      LABELS[nextStatus]?.[0] || nextStatus;

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
    if (!window.confirm("Bạn đã hoàn " + money(booking.PaidAmount) + " tiền cọc cho đơn #" + booking.BookingID + "?")) return;
    setUpdatingId(booking.BookingID);
    setRefundError("");
    try {
      await confirmDepositRefund(booking.BookingID, refundReference, refundFile);
      await loadBookings();
      if (selectedBooking?.BookingID === booking.BookingID) {
        setSelectedBooking(await getBookingDetail(booking.BookingID));
        setCancelHistory(await getCancellationInfo(booking.BookingID));
      }
    } catch (err) { setRefundError(err.message || "Không thể xác nhận hoàn cọc"); }
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

  const actions = (booking) => {
    const busy =
      updatingId === booking.BookingID;

    return (
      <div className="booking-actions">
        {isAdmin && booking.Status === "CANCELLED" && Number(booking.PaidAmount) > 0 && !Number(booking.RefundedAmount) && (
          <button type="button" className="booking-action-btn booking-action-confirm"
            onClick={() => viewBooking(booking.BookingID)} disabled={busy || detailLoading}>Hoàn cọc</button>
        )}

        <button
          type="button"
          className="booking-action-btn booking-action-detail"
          disabled={busy || detailLoading}
          onClick={() => viewBooking(booking.BookingID)}
        >
          Chi tiết
        </button>


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


        {booking.Status === "CONFIRMED" && (
          <>
            <button
              type="button"
              className="booking-action-btn booking-action-complete"
              disabled={busy}
              onClick={() =>
                changeStatus(booking, "COMPLETED")
              }
            >
              Hoàn thành
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
      money(selectedBooking.PaidAmount)
    ],
    [
      "Còn lại",
      money(selectedBooking.RemainingAmount)
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

      <div className="cards">
        {[
          ["Tổng số đơn", stats.total],
          ["Chờ xác nhận", stats.pending],
          ["Đã xác nhận", stats.confirmed],
          ["Hoàn thành", stats.completed]
        ].map(([title, count]) => (
          <div className="card" key={title}>
            <p>{title}</p>
            <h2>{count}</h2>
          </div>
        ))}
      </div>


      {/* FILTER */}

      <div className="filter">

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

      </div>


      {/* UC07 - Danh sách yêu cầu hủy chờ ADMIN duyệt */}
      {isAdmin && (
        <section className="uc07-admin-requests" aria-labelledby="cancellation-requests-title">
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
                    <p className="cancellation-request-time">Gửi lúc: <time dateTime={item.requestedAt}>{item.requestedAt?.replace("T", " ")}</time></p>
                  </div>
                  <div className="cancellation-request-deposit">
                    <span className="cancellation-request-label">Tiền cọc đã thanh toán</span>
                    <strong>{money(item.depositPaid)}</strong>
                    <p>Hoàn cọc được xử lý sau khi duyệt hủy.</p>
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
                      <X size={16} aria-hidden="true" /> Từ chối
                    </button>
                    <button type="button" className="cancellation-btn cancellation-btn-approve" disabled={reviewingId !== null}
                      onClick={() => handleReview(item,"APPROVED")}>
                      <Check size={16} aria-hidden="true" /> Duyệt hủy
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
                    : "Không có booking"}
                </td>
              </tr>

            ) : (
              filtered.map((b) => (
                <tr key={b.BookingID}>

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
                    <StatusBadge status={b.Status} />
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
                  <p><strong>Xử lý tiền cọc:</strong> {cancelHistory.refundStatus === "REFUNDED" ? "Đã hoàn tiền cọc" : cancelHistory.refundStatus === "NOT_REQUIRED" ? "Không cần hoàn cọc" : "Chờ hoàn cọc"}</p>
                  <p>{cancelHistory.refundNote}</p>
                </> : <p>Chưa có bản ghi BookingCancellations cho booking này.</p>}
              </section>
            )}

            {isAdmin && (cancelHistory?.latestRequest?.refundAccount ||
              (selectedBooking.Status === "CANCELLED" && Number(selectedBooking.PaidAmount) > 0)) && (
              <section className="booking-refund-details">
                <h3>Chuyển khoản hoàn tiền cọc</h3>
                {detailLoading && <p>Đang tải thông tin nhận tiền...</p>}
                {cancelHistoryError && <p role="alert">{cancelHistoryError}</p>}
                {cancelHistory?.latestRequest?.refundAccount ? (
                  <dl className="booking-refund-grid">
                    <div><dt>Ngân hàng</dt><dd>{cancelHistory.latestRequest.refundAccount.bankName}</dd></div>
                    <div><dt>Số tài khoản</dt><dd>{cancelHistory.latestRequest.refundAccount.accountNumber}
                      <button type="button" onClick={() => copyTransferValue(cancelHistory.latestRequest.refundAccount.accountNumber, "số tài khoản")}>Sao chép</button>
                    </dd></div>
                    <div><dt>Chủ tài khoản</dt><dd>{cancelHistory.latestRequest.refundAccount.accountHolder}</dd></div>
                    <div><dt>Số tiền hoàn cọc</dt><dd>{money(selectedBooking.RefundedAmount || selectedBooking.PaidAmount)}</dd></div>
                    <div><dt>Nội dung chuyển khoản</dt><dd>HOAN COC {selectedBooking.BookingID}
                      <button type="button" onClick={() => copyTransferValue(`HOAN COC ${selectedBooking.BookingID}`, "nội dung chuyển khoản")}>Sao chép</button>
                    </dd></div>
                  </dl>
                ) : !detailLoading && !cancelHistoryError && <p>Khách chưa cung cấp tài khoản nhận hoàn cọc. Vui lòng liên hệ khách để lấy thông tin chuyển khoản.</p>}
                {copyNotice && <p role="status">{copyNotice}</p>}
                {Number(selectedBooking.RefundedAmount) > 0 ? (
                  <div>
                    <p className="deposit-refunded" role="status">Đã hoàn {money(selectedBooking.RefundedAmount)} tiền cọc. Khách có thể xem thông báo trong đơn đặt sân.</p>
                    {cancelHistory?.refundTransactionReference && <p>Mã giao dịch: {cancelHistory.refundTransactionReference}</p>}
                    {cancelHistory?.hasRefundEvidence && <button type="button" className="booking-action-btn booking-action-detail"
                      onClick={() => downloadRefundEvidence(selectedBooking.BookingID).catch(err => setRefundError(err.message))}>Tải biên lai hoàn cọc</button>}
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
                      {updatingId === selectedBooking.BookingID ? "Đang xác nhận..." : "Đã hoàn tiền cọc"}
                    </button>
                  </form>
                ) : <p>Duyệt yêu cầu hủy trước khi hoàn tiền cọc.</p>}
              </section>
            )}

            {/* UC09: Chỉ ADMIN được xác nhận */}

            {isAdmin && (
              <SettlementPanel
                bookingId={selectedBooking.BookingID}
                mode="admin"
                refreshKey={
                  `${selectedBooking.Status}-${selectedBooking.PaidAmount}`
                }
                onPaymentConfirmed={onPaid}
              />
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
