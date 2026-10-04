import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useOutletContext,
} from "react-router-dom";

import {
  getAllBookings,
  getBookingDetail,
  updateBookingStatus,
} from "../../services/booking_service";
import "./BookingManagement.css";
const BOOKING_STATUS = {
  PENDING: {
    label: "Chờ xác nhận",
    className:
      "booking-status-pending",
  },

  CONFIRMED: {
    label: "Đã xác nhận",
    className:
      "booking-status-confirmed",
  },

  CANCELLED: {
    label: "Đã hủy",
    className:
      "booking-status-cancelled",
  },

  COMPLETED: {
    label: "Hoàn thành",
    className:
      "booking-status-completed",
  },
};

function BookingManagement() {
  const { user } =
    useOutletContext();

  const [bookings, setBookings] =
    useState([]);

  const [
    bookingLoading,
    setBookingLoading,
  ] = useState(true);

  const [
    bookingSearch,
    setBookingSearch,
  ] = useState("");

  const [
    bookingStatus,
    setBookingStatus,
  ] = useState("");

  const [
    updatingBookingID,
    setUpdatingBookingID,
  ] = useState(null);

  const [
    selectedBooking,
    setSelectedBooking,
  ] = useState(null);

  const [
    bookingDetailLoading,
    setBookingDetailLoading,
  ] = useState(false);

  const loadBookings = async () => {
    if (!user?.UserID) {
      return;
    }

    try {
      setBookingLoading(true);

      const result =
        await getAllBookings(
          user.UserID
        );

      setBookings(
        Array.isArray(
          result?.Bookings
        )
          ? result.Bookings
          : []
      );
    } catch (error) {
      console.error(
        "LOAD BOOKINGS ERROR:",
        error
      );

      alert(
        error.message ||
        "Không thể tải danh sách đặt sân"
      );
    } finally {
      setBookingLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.UserID) {
      return undefined;
    }

    let active = true;

    getAllBookings(user.UserID)
      .then((result) => {
        if (!active) {
          return;
        }

        setBookings(
          Array.isArray(
            result?.Bookings
          )
            ? result.Bookings
            : []
        );
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        console.error(
          "LOAD BOOKINGS ERROR:",
          error
        );

        alert(
          error.message ||
          "Không thể tải danh sách đặt sân"
        );
      })
      .finally(() => {
        if (active) {
          setBookingLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user?.UserID]);

  const bookingStats =
    useMemo(() => ({
      total:
        bookings.length,

      pending:
        bookings.filter(
          (booking) =>
            booking.Status ===
            "PENDING"
        ).length,

      confirmed:
        bookings.filter(
          (booking) =>
            booking.Status ===
            "CONFIRMED"
        ).length,

      completed:
        bookings.filter(
          (booking) =>
            booking.Status ===
            "COMPLETED"
        ).length,
    }), [bookings]);

  const filteredBookings =
    useMemo(() => {
      const keyword =
        bookingSearch
          .trim()
          .toLowerCase();

      return bookings.filter(
        (booking) => {
          const searchable = [
            booking.BookingID,

            booking.CustomerName,

            booking.Phone,

            booking.Email,

            booking.FieldName,

            booking.FieldType,

            booking.BookingDate,
          ]
            .filter(
              (value) =>
                value !== null &&
                value !== undefined
            )
            .join(" ")
            .toLowerCase();

          const matchKeyword =
            !keyword ||
            searchable.includes(
              keyword
            );

          const matchStatus =
            !bookingStatus ||
            booking.Status ===
              bookingStatus;

          return (
            matchKeyword &&
            matchStatus
          );
        }
      );
    }, [
      bookings,
      bookingSearch,
      bookingStatus,
    ]);

  const formatPrice = (value) =>
    Number(
      value || 0
    ).toLocaleString("vi-VN");

  const handleBookingStatus =
    async (
      booking,
      newStatus
    ) => {
      if (!user?.UserID) {
        alert(
          "Không xác định được tài khoản quản lý booking"
        );

        return;
      }

      const statusMeta =
        BOOKING_STATUS[newStatus];

      const label =
        statusMeta?.label ||
        newStatus;

      const confirmed =
        window.confirm(
          `Bạn có chắc muốn chuyển đơn #${booking.BookingID} sang "${label}"?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setUpdatingBookingID(
          booking.BookingID
        );

        await updateBookingStatus(
          booking.BookingID,

          newStatus,

          user.UserID
        );

        await loadBookings();

        if (
          selectedBooking?.BookingID ===
          booking.BookingID
        ) {
          const updatedDetail =
            await getBookingDetail(
              booking.BookingID
            );

          setSelectedBooking(
            updatedDetail
          );
        }

        alert(
          "Cập nhật trạng thái đơn thành công"
        );
      } catch (error) {
        console.error(
          "UPDATE BOOKING STATUS ERROR:",
          error
        );

        alert(
          error.message ||
          "Không thể cập nhật trạng thái đơn"
        );
      } finally {
        setUpdatingBookingID(null);
      }
    };

  const handleViewBooking =
    async (bookingID) => {
      try {
        setBookingDetailLoading(
          true
        );

        const detail =
          await getBookingDetail(
            bookingID
          );

        setSelectedBooking(detail);
      } catch (error) {
        console.error(
          "GET BOOKING DETAIL ERROR:",
          error
        );

        alert(
          error.message ||
          "Không thể tải chi tiết booking"
        );
      } finally {
        setBookingDetailLoading(
          false
        );
      }
    };

  const renderBookingStatus = (
    statusValue
  ) => {
    const normalized =
      String(statusValue || "")
        .trim()
        .toUpperCase();

    const meta =
      BOOKING_STATUS[
        normalized
      ] || {
        label:
          normalized ||
          "Không xác định",

        className:
          "booking-status-default",
      };

    return (
      <span
        className={`booking-status-badge ${meta.className}`}
      >
        {meta.label}
      </span>
    );
  };

  const renderBookingActions = (
    booking
  ) => {
    const busy =
      updatingBookingID ===
      booking.BookingID;

    return (
      <div className="booking-actions">
        <button
          type="button"
          className="booking-action-btn booking-action-detail"
          disabled={
            busy ||
            bookingDetailLoading
          }
          onClick={() =>
            handleViewBooking(
              booking.BookingID
            )
          }
        >
          Chi tiết
        </button>

        {booking.Status ===
          "PENDING" && (
          <>
            <button
              type="button"
              className="booking-action-btn booking-action-confirm"
              disabled={busy}
              onClick={() =>
                handleBookingStatus(
                  booking,

                  "CONFIRMED"
                )
              }
            >
              {busy
                ? "Đang xử lý..."
                : "Xác nhận"}
            </button>

            <button
              type="button"
              className="booking-action-btn booking-action-cancel"
              disabled={busy}
              onClick={() =>
                handleBookingStatus(
                  booking,

                  "CANCELLED"
                )
              }
            >
              Hủy đơn
            </button>
          </>
        )}

        {booking.Status ===
          "CONFIRMED" && (
          <>
            <button
              type="button"
              className="booking-action-btn booking-action-complete"
              disabled={busy}
              onClick={() =>
                handleBookingStatus(
                  booking,

                  "COMPLETED"
                )
              }
            >
              {busy
                ? "Đang xử lý..."
                : "Hoàn thành"}
            </button>

            <button
              type="button"
              className="booking-action-btn booking-action-cancel"
              disabled={busy}
              onClick={() =>
                handleBookingStatus(
                  booking,

                  "CANCELLED"
                )
              }
            >
              Hủy đơn
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="title-row">
        <h1>
          QUẢN LÝ ĐẶT SÂN
        </h1>

        <button
          type="button"
          className="add-btn"
          disabled={bookingLoading}
          onClick={loadBookings}
        >
          {bookingLoading
            ? "Đang tải..."
            : "↻ Làm mới"}
        </button>
      </div>

      <div className="cards">
        <div className="card">
          <p>
            Tổng số đơn
          </p>

          <h2>
            {bookingStats.total}
          </h2>
        </div>

        <div className="card">
          <p>
            Chờ xác nhận
          </p>

          <h2>
            {bookingStats.pending}
          </h2>
        </div>

        <div className="card">
          <p>
            Đã xác nhận
          </p>

          <h2>
            {bookingStats.confirmed}
          </h2>
        </div>

        <div className="card">
          <p>
            Hoàn thành
          </p>

          <h2>
            {bookingStats.completed}
          </h2>
        </div>
      </div>

      <div className="filter">
        <input
          placeholder="🔍 Mã đơn, tên khách hàng, sân, SĐT..."
          value={bookingSearch}
          onChange={(event) =>
            setBookingSearch(
              event.target.value
            )
          }
        />

        <select
          value={bookingStatus}
          onChange={(event) =>
            setBookingStatus(
              event.target.value
            )
          }
        >
          <option value="">
            Tất cả trạng thái
          </option>

          <option value="PENDING">
            Chờ xác nhận
          </option>

          <option value="CONFIRMED">
            Đã xác nhận
          </option>

          <option value="CANCELLED">
            Đã hủy
          </option>

          <option value="COMPLETED">
            Hoàn thành
          </option>
        </select>
      </div>

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
            {bookingLoading ? (
              <tr>
                <td
                  colSpan="8"
                  className="booking-empty-cell"
                >
                  Đang tải danh sách booking...
                </td>
              </tr>
            ) : filteredBookings.length ===
              0 ? (
              <tr>
                <td
                  colSpan="8"
                  className="booking-empty-cell"
                >
                  Không có booking
                </td>
              </tr>
            ) : (
              filteredBookings.map(
                (booking) => (
                  <tr
                    key={
                      booking.BookingID
                    }
                  >
                    <td>
                      <strong>
                        #{booking.BookingID}
                      </strong>
                    </td>

                    <td>
                      <strong>
                        {booking.CustomerName ||
                          `User #${booking.UserID}`}
                      </strong>

                      {booking.Phone && (
                        <>
                          <br />

                          <small>
                            {booking.Phone}
                          </small>
                        </>
                      )}

                      {!booking.Phone &&
                        booking.Email && (
                          <>
                            <br />

                            <small>
                              {booking.Email}
                            </small>
                          </>
                        )}
                    </td>

                    <td>
                      {booking.FieldName ||
                        `Sân #${booking.FieldID}`}

                      {booking.FieldType && (
                        <>
                          <br />

                          <small>
                            {booking.FieldType}
                          </small>
                        </>
                      )}
                    </td>

                    <td>
                      {booking.BookingDate}
                    </td>

                    <td>
                      {booking.StartTime}

                      {" - "}

                      {booking.EndTime}
                    </td>

                    <td>
                      <strong>
                        {formatPrice(
                          booking.TotalAmount
                        )}
                        đ
                      </strong>
                    </td>

                    <td>
                      {renderBookingStatus(
                        booking.Status
                      )}
                    </td>

                    <td>
                      {renderBookingActions(
                        booking
                      )}
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

      {selectedBooking && (
        <div className="modal">
          <div className="modal-content booking-detail-modal">
            <div className="booking-detail-header">
              <h2>
                Chi tiết đơn #
                {selectedBooking.BookingID}
              </h2>

              {renderBookingStatus(
                selectedBooking.Status
              )}
            </div>

            <div className="booking-detail-grid">
              <div>
                <span>
                  Khách hàng
                </span>

                <strong>
                  {selectedBooking.CustomerName ||
                    `User #${selectedBooking.UserID}`}
                </strong>
              </div>

              <div>
                <span>
                  Số điện thoại
                </span>

                <strong>
                  {selectedBooking.Phone ||
                    "Chưa cập nhật"}
                </strong>
              </div>

              <div>
                <span>Email</span>

                <strong>
                  {selectedBooking.Email ||
                    "Chưa cập nhật"}
                </strong>
              </div>

              <div>
                <span>Sân</span>

                <strong>
                  {selectedBooking.FieldName ||
                    `Sân #${selectedBooking.FieldID}`}
                </strong>
              </div>

              <div>
                <span>
                  Loại sân
                </span>

                <strong>
                  {selectedBooking.FieldType ||
                    "Chưa cập nhật"}
                </strong>
              </div>

              <div>
                <span>
                  Địa điểm
                </span>

                <strong>
                  {selectedBooking.Location ||
                    "Chưa cập nhật"}
                </strong>
              </div>

              <div>
                <span>
                  Ngày đặt
                </span>

                <strong>
                  {selectedBooking.BookingDate}
                </strong>
              </div>

              <div>
                <span>
                  Khung giờ
                </span>

                <strong>
                  {selectedBooking.StartTime}

                  {" - "}

                  {selectedBooking.EndTime}
                </strong>
              </div>

              <div>
                <span>
                  Tổng tiền
                </span>

                <strong>
                  {formatPrice(
                    selectedBooking.TotalAmount
                  )}
                  đ
                </strong>
              </div>
            </div>

            <button
              type="button"
              className="cancel-btn booking-detail-close"
              onClick={() =>
                setSelectedBooking(null)
              }
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default BookingManagement;