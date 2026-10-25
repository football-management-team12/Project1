import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

import SettlementPanel from "../../components/SettlementPanel/SettlementPanel";

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
  // VIEW BOOKING DETAIL
  // ======================================================

  const viewBooking = async (bookingId) => {
    setDetailLoading(true);

    try {
      const detail = await getBookingDetail(bookingId);

      setSelectedBooking(detail);

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

  const actions = (booking) => {
    const busy =
      updatingId === booking.BookingID;

    return (
      <div className="booking-actions">

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
                changeStatus(booking, "CANCELLED")
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
                changeStatus(booking, "CANCELLED")
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
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>


          <tbody>
            {loading || filtered.length === 0 ? (
              <tr>
                <td
                  className="booking-empty-cell"
                  colSpan="8"
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