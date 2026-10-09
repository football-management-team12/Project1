import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CalendarDays,
  Clock3,
  MapPin,
  RefreshCw,
} from "lucide-react";

import {
  Navigate,
  useNavigate,
} from "react-router-dom";

import Navbar
  from "../../components/Navbar/Navbar";

import {
  getCustomerBookings,
} from "../../services/booking_service";

import "./BookingHistory.css";


const STATUS_META = {

  PENDING: {
    label:
      "Chờ xác nhận",

    className:
      "booking-history-status-pending",
  },


  CONFIRMED: {
    label:
      "Đã xác nhận",

    className:
      "booking-history-status-confirmed",
  },


  CANCELLED: {
    label:
      "Đã hủy",

    className:
      "booking-history-status-cancelled",
  },


  COMPLETED: {
    label:
      "Hoàn thành",

    className:
      "booking-history-status-completed",
  },

};


const readUser = () => {

  try {

    const rawUser =
      localStorage.getItem(
        "user"
      );


    return rawUser
      ? JSON.parse(
          rawUser
        )
      : null;

  } catch {

    return null;

  }

};


const formatMoney = (
  value
) => {

  return new Intl.NumberFormat(
    "vi-VN"
  ).format(
    Number(
      value || 0
    )
  );

};


const formatDate = (
  value
) => {

  if (!value) {

    return "--";

  }


  const date =
    new Date(
      `${value}T00:00:00`
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return value;

  }


  return new Intl.DateTimeFormat(
    "vi-VN"
  ).format(
    date
  );

};


function BookingHistory() {

  const navigate =
    useNavigate();


  const [
    user,
  ] = useState(
    readUser
  );


  const [
    bookings,
    setBookings,
  ] = useState([]);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    error,
    setError,
  ] = useState("");


  const [
    statusFilter,
    setStatusFilter,
  ] = useState("");


  const role =
    String(
      user?.Role || ""
    )
      .trim()
      .toUpperCase();


  const loadBookings =
    async () => {

      if (!user?.UserID) {

        return;

      }


      try {

        setLoading(
          true
        );


        setError(
          ""
        );


        const result =
          await getCustomerBookings(
            user.UserID,
            {
              status:
                statusFilter,
            }
          );


        setBookings(

          Array.isArray(
            result?.Bookings
          )
            ? result.Bookings
            : []

        );

      } catch (
        requestError
      ) {

        console.error(
          "LOAD CUSTOMER BOOKINGS ERROR:",
          requestError
        );


        setBookings([]);


        setError(

          requestError.message ||
          "Không thể tải lịch sử đặt sân."

        );

      } finally {

        setLoading(
          false
        );

      }

    };


  useEffect(
    () => {

      if (
        !user?.UserID ||
        role !== "CUSTOMER"
      ) {

        return;

      }


      loadBookings();

    },
    [
      user?.UserID,
      role,
      statusFilter,
    ]
  );


  const counts =
    useMemo(
      () => {

        const result = {

          total:
            bookings.length,

          pending:
            0,

          confirmed:
            0,

          completed:
            0,

          cancelled:
            0,

        };


        bookings.forEach(
          (
            booking
          ) => {

            const status =
              String(
                booking.Status ||
                ""
              )
                .trim()
                .toUpperCase();


            if (
              status ===
              "PENDING"
            ) {

              result.pending +=
                1;

            }


            if (
              status ===
              "CONFIRMED"
            ) {

              result.confirmed +=
                1;

            }


            if (
              status ===
              "COMPLETED"
            ) {

              result.completed +=
                1;

            }


            if (
              status ===
              "CANCELLED"
            ) {

              result.cancelled +=
                1;

            }

          }
        );


        return result;

      },
      [
        bookings,
      ]
    );


  if (
    role === "ADMIN" ||
    role === "STAFF"
  ) {

    return (

      <Navigate
        to="/admin/bookings"
        replace
      />

    );

  }


  if (
    role !== "CUSTOMER"
  ) {

    return (

      <Navigate
        to="/fields"
        replace
      />

    );

  }


  return (

    <>

      <Navbar />


      <main className="booking-history-page">

        <section className="booking-history-header">

          <div>

            <p className="booking-history-kicker">
              LỊCH SỬ BOOKING
            </p>


            <h1>
              Lịch sử đặt sân
            </h1>


            <p>
              Theo dõi các đơn đặt sân,
              thời gian thi đấu và trạng
              thái xác nhận của bạn.
            </p>

          </div>


          <button
            type="button"
            className="booking-history-refresh"
            onClick={
              loadBookings
            }
            disabled={
              loading
            }
          >

            <RefreshCw
              size={
                17
              }
            />

            Làm mới

          </button>

        </section>


        <section className="booking-history-stats">

          <div>

            <span>
              Tổng đơn
            </span>

            <strong>
              {counts.total}
            </strong>

          </div>


          <div>

            <span>
              Chờ xác nhận
            </span>

            <strong>
              {counts.pending}
            </strong>

          </div>


          <div>

            <span>
              Đã xác nhận
            </span>

            <strong>
              {counts.confirmed}
            </strong>

          </div>


          <div>

            <span>
              Hoàn thành
            </span>

            <strong>
              {counts.completed}
            </strong>

          </div>

        </section>


        <section className="booking-history-toolbar">

          <label>

            Trạng thái

            <select
              value={
                statusFilter
              }
              onChange={
                (
                  event
                ) =>
                  setStatusFilter(
                    event.target.value
                  )
              }
            >

              <option value="">
                Tất cả
              </option>


              <option value="PENDING">
                Chờ xác nhận
              </option>


              <option value="CONFIRMED">
                Đã xác nhận
              </option>


              <option value="COMPLETED">
                Hoàn thành
              </option>


              <option value="CANCELLED">
                Đã hủy
              </option>

            </select>

          </label>

        </section>


        {
          loading && (

            <section className="booking-history-state">
              Đang tải lịch sử đặt sân...
            </section>

          )
        }


        {
          !loading &&
          error && (

            <section className="booking-history-state booking-history-error">

              <h2>
                Không thể tải lịch sử
              </h2>


              <p>
                {error}
              </p>


              <button
                type="button"
                onClick={
                  loadBookings
                }
              >
                Thử lại
              </button>

            </section>

          )
        }


        {
          !loading &&
          !error &&
          bookings.length === 0 && (

            <section className="booking-history-state">

              <h2>
                Chưa có đơn đặt sân
              </h2>


              <p>
                Chọn sân và khung giờ để
                tạo booking đầu tiên.
              </p>


              <button
                type="button"
                onClick={
                  () =>
                    navigate(
                      "/fields"
                    )
                }
              >
                Xem danh sách sân
              </button>

            </section>

          )
        }


        {
          !loading &&
          !error &&
          bookings.length > 0 && (

            <section className="booking-history-list">

              {
                bookings.map(
                  (
                    booking
                  ) => {

                    const status =
                      String(
                        booking.Status ||
                        ""
                      )
                        .trim()
                        .toUpperCase();


                    const meta =
                      STATUS_META[
                        status
                      ] || {

                        label:
                          status ||
                          "Không xác định",

                        className:
                          "booking-history-status-default",

                      };


                    return (

                      <article
                        key={
                          booking.BookingID
                        }
                        className="booking-history-card"
                      >

                        <div className="booking-history-card-top">

                          <div>

                            <span className="booking-history-id">

                              Booking #

                              {
                                booking.BookingID
                              }

                            </span>


                            <h2>

                              {
                                booking.FieldName ||
                                `Sân ${booking.FieldID}`
                              }

                            </h2>


                            <p>

                              {
                                booking.FieldType ||
                                "Sân bóng"
                              }

                            </p>

                          </div>


                          <span
                            className={`booking-history-status ${meta.className}`}
                          >

                            {
                              meta.label
                            }

                          </span>

                        </div>


                        <div className="booking-history-info">

                          <div>

                            <CalendarDays
                              size={
                                18
                              }
                            />


                            <span>

                              {
                                formatDate(
                                  booking.BookingDate
                                )
                              }

                            </span>

                          </div>


                          <div>

                            <Clock3
                              size={
                                18
                              }
                            />


                            <span>

                              {
                                booking.StartTime
                              }

                              {" - "}

                              {
                                booking.EndTime
                              }

                            </span>

                          </div>


                          <div>

                            <MapPin
                              size={
                                18
                              }
                            />


                            <span>

                              {
                                booking.Location ||
                                "Chưa cập nhật địa điểm"
                              }

                            </span>

                          </div>

                        </div>


                        <div className="booking-history-card-bottom">

                          <div>

                            <span>
                              Tổng tiền
                            </span>


                            <strong>

                              {
                                formatMoney(
                                  booking.TotalAmount
                                )
                              }

                              đ

                            </strong>

                          </div>


                          <div>

                            <span>
                              Thanh toán
                            </span>


                            <strong>

                              {
                                booking.PaymentStatus ||
                                "Chưa có thông tin"
                              }

                            </strong>

                          </div>


                          <button
                            type="button"
                            onClick={
                              () =>
                                navigate(
                                  `/bookings/${booking.BookingID}`
                                )
                            }
                          >
                            Xem chi tiết
                          </button>

                        </div>

                      </article>

                    );

                  }
                )
              }

            </section>

          )
        }

      </main>

    </>

  );

}


export default BookingHistory;