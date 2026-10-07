import {
  useEffect,
  useState,
} from "react";

import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  MapPin,
  ReceiptText,
} from "lucide-react";

import {
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";

import Navbar
  from "../../components/Navbar/Navbar";

import {
  getCustomerBookingDetail,
} from "../../services/booking_service";

import "./BookingDetail.css";


const STATUS_META = {

  PENDING:
    "Chờ xác nhận",

  CONFIRMED:
    "Đã xác nhận",

  CANCELLED:
    "Đã hủy",

  COMPLETED:
    "Hoàn thành",

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


function BookingDetail() {

  const navigate =
    useNavigate();


  const {
    bookingId,
  } = useParams();


  const [
    user,
  ] = useState(
    readUser
  );


  const [
    booking,
    setBooking,
  ] = useState(
    null
  );


  const [
    loading,
    setLoading,
  ] = useState(
    true
  );


  const [
    error,
    setError,
  ] = useState(
    ""
  );


  const role =
    String(
      user?.Role || ""
    )
      .trim()
      .toUpperCase();


  useEffect(
    () => {

      if (
        !user?.UserID ||
        !bookingId ||
        role !== "CUSTOMER"
      ) {

        return;

      }


      let active =
        true;


      const loadDetail =
        async () => {

          try {

            setLoading(
              true
            );


            setError(
              ""
            );


            const result =
              await getCustomerBookingDetail(
                user.UserID,
                bookingId
              );


            if (!active) {

              return;

            }


            setBooking(
              result
            );

          } catch (
            requestError
          ) {

            if (!active) {

              return;

            }


            console.error(
              "LOAD CUSTOMER BOOKING DETAIL ERROR:",
              requestError
            );


            setBooking(
              null
            );


            setError(

              requestError.message ||
              "Không thể tải chi tiết booking."

            );

          } finally {

            if (active) {

              setLoading(
                false
              );

            }

          }

        };


      loadDetail();


      return () => {

        active =
          false;

      };

    },
    [
      user?.UserID,
      bookingId,
      role,
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


  const normalizedStatus =
    String(
      booking?.Status || ""
    )
      .trim()
      .toUpperCase();


  return (

    <>

      <Navbar />


      <main className="booking-detail-page">

        <button
          type="button"
          className="booking-detail-back"
          onClick={
            () =>
              navigate(
                "/bookings"
              )
          }
        >

          <ArrowLeft
            size={
              18
            }
          />

          Lịch sử đặt sân

        </button>


        {
          loading && (

            <section className="booking-detail-state">
              Đang tải chi tiết booking...
            </section>

          )
        }


        {
          !loading &&
          error && (

            <section className="booking-detail-state booking-detail-error">

              <h1>
                Không thể mở booking
              </h1>


              <p>
                {error}
              </p>


              <button
                type="button"
                onClick={
                  () =>
                    navigate(
                      "/bookings"
                    )
                }
              >
                Quay lại lịch sử
              </button>

            </section>

          )
        }


        {
          !loading &&
          !error &&
          booking && (

            <>

              <section className="booking-detail-header">

                <div>

                  <p>

                    BOOKING #

                    {
                      booking.BookingID
                    }

                  </p>


                  <h1>

                    {
                      booking.FieldName ||
                      `Sân ${booking.FieldID}`
                    }

                  </h1>


                  <span>

                    {
                      booking.FieldType ||
                      "Sân bóng"
                    }

                  </span>

                </div>


                <span
                  className={`booking-detail-status booking-detail-status-${normalizedStatus.toLowerCase()}`}
                >

                  {
                    STATUS_META[
                      normalizedStatus
                    ] ||
                    normalizedStatus ||
                    "Không xác định"
                  }

                </span>

              </section>


              <div className="booking-detail-grid">

                <section className="booking-detail-card">

                  <h2>
                    Thông tin đặt sân
                  </h2>


                  <div className="booking-detail-row">

                    <CalendarDays
                      size={
                        19
                      }
                    />


                    <div>

                      <span>
                        Ngày đặt
                      </span>


                      <strong>

                        {
                          formatDate(
                            booking.BookingDate
                          )
                        }

                      </strong>

                    </div>

                  </div>


                  <div className="booking-detail-row">

                    <Clock3
                      size={
                        19
                      }
                    />


                    <div>

                      <span>
                        Khung giờ
                      </span>


                      <strong>

                        {
                          booking.StartTime
                        }

                        {" - "}

                        {
                          booking.EndTime
                        }

                      </strong>

                    </div>

                  </div>


                  <div className="booking-detail-row">

                    <MapPin
                      size={
                        19
                      }
                    />


                    <div>

                      <span>
                        Địa điểm
                      </span>


                      <strong>

                        {
                          booking.Location ||
                          "Chưa cập nhật"
                        }

                      </strong>

                    </div>

                  </div>

                </section>


                <section className="booking-detail-card">

                  <h2>
                    Thanh toán
                  </h2>


                  <div className="booking-detail-row">

                    <ReceiptText
                      size={
                        19
                      }
                    />


                    <div>

                      <span>
                        Tổng tiền
                      </span>


                      <strong className="booking-detail-money">

                        {
                          formatMoney(
                            booking.TotalAmount
                          )
                        }

                        đ

                      </strong>

                    </div>

                  </div>


                  <div className="booking-detail-payment">

                    <span>
                      Trạng thái thanh toán
                    </span>


                    <strong>

                      {
                        booking.PaymentStatus ||
                        "Chưa có thông tin thanh toán"
                      }

                    </strong>


                    {
                      !booking.PaymentStatus && (

                        <small>
                          Chức năng thanh toán sẽ được tích hợp ở PAYMENT-01.
                        </small>

                      )
                    }

                  </div>

                </section>

              </div>


              <section className="booking-detail-customer">

                <h2>
                  Thông tin khách hàng
                </h2>


                <div>

                  <p>

                    <span>
                      Họ tên
                    </span>


                    <strong>

                      {
                        booking.CustomerName ||
                        user.FullName ||
                        "--"
                      }

                    </strong>

                  </p>


                  <p>

                    <span>
                      Email
                    </span>


                    <strong>

                      {
                        booking.Email ||
                        user.Email ||
                        "--"
                      }

                    </strong>

                  </p>


                  <p>

                    <span>
                      Số điện thoại
                    </span>


                    <strong>

                      {
                        booking.Phone ||
                        user.Phone ||
                        "--"
                      }

                    </strong>

                  </p>

                </div>

              </section>

            </>

          )
        }

      </main>

    </>

  );

}


export default BookingDetail;