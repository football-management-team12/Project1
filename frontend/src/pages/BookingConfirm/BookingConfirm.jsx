import {
  useState,
} from "react";

import {
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

import {
  useNavigate,
} from "react-router-dom";

import Navbar from "../../components/Navbar/Navbar";

import {
  createBooking,
} from "../../services/booking_service";

import "./BookingConfirm.css";


const readJson = (
  storage,
  key
) => {
  try {
    const value =
      storage.getItem(key);

    return value
      ? JSON.parse(value)
      : null;
  } catch {
    return null;
  }
};


const formatPrice = (
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


function BookingConfirm() {
  const navigate =
    useNavigate();


  const [
    bookingDraft,
  ] = useState(
    () =>
      readJson(
        sessionStorage,
        "bookingDraft"
      )
  );


  const [
    user,
  ] = useState(
    () =>
      readJson(
        localStorage,
        "user"
      )
  );


  const [
    submitting,
    setSubmitting,
  ] = useState(false);


  const [
    error,
    setError,
  ] = useState("");


  const [
    result,
    setResult,
  ] = useState(null);


  // =========================================================
  // BACK TO BOOKING
  // =========================================================

  const handleBack = () => {
    if (!bookingDraft) {
      navigate(
        "/fields"
      );

      return;
    }


    const params =
      new URLSearchParams({
        fieldId:
          String(
            bookingDraft.FieldID
          ),

        date:
          bookingDraft.BookingDate,
      });


    navigate(
      `/booking?${params.toString()}`
    );
  };


  // =========================================================
  // CONFIRM BOOKING
  // =========================================================

  const handleConfirm =
    async () => {
      if (
        !bookingDraft ||
        !user?.UserID
      ) {
        setError(
          "Bạn cần đăng nhập bằng tài khoản khách hàng trước khi đặt sân."
        );

        return;
      }


      try {
        setSubmitting(true);
        setError("");


        const payload = {
          UserID:
            user.UserID,

          FieldID:
            bookingDraft.FieldID,

          BookingDate:
            bookingDraft.BookingDate,

          StartTime:
            bookingDraft.StartTime,

          EndTime:
            bookingDraft.EndTime,
        };


        const response =
          await createBooking(
            payload
          );


        sessionStorage.removeItem(
          "bookingDraft"
        );


        setResult(
          response
        );
      } catch (requestError) {

        if (
          requestError.status ===
            409 &&
          requestError.code ===
            "BOOKING_CONFLICT"
        ) {
          sessionStorage.removeItem(
            "bookingDraft"
          );


          const params =
            new URLSearchParams({
              fieldId:
                String(
                  bookingDraft.FieldID
                ),

              date:
                bookingDraft.BookingDate,
            });


          navigate(
            `/booking?${params.toString()}`,
            {
              replace: true,

              state: {
                bookingConflict:
                  true,
              },
            }
          );


          return;
        }


        setError(
          requestError.message ||
          "Không thể tạo booking."
        );
      } finally {
        setSubmitting(false);
      }
    };


  // =========================================================
  // SUCCESS
  // =========================================================

  if (result) {
    const booking =
      result.Booking || {};


    return (
      <>
        <Navbar />

        <main className="booking-confirm-page">

          <div className="booking-confirm-container">

            <section className="booking-success-card">

              <CheckCircle2
                size={60}
              />

              <h1>
                Đặt sân thành công
              </h1>

              <p>
                Yêu cầu đặt sân của
                bạn đã được gửi và
                đang chờ xác nhận.
              </p>


              <div className="booking-success-info">

                <div>
                  <span>
                    Mã booking
                  </span>

                  <strong>
                    #
                    {
                      booking
                        .BookingID
                    }
                  </strong>
                </div>


                <div>
                  <span>
                    Sân
                  </span>

                  <strong>
                    {
                      booking
                        .FieldName
                    }
                  </strong>
                </div>


                <div>
                  <span>
                    Ngày
                  </span>

                  <strong>
                    {
                      booking
                        .BookingDate
                    }
                  </strong>
                </div>


                <div>
                  <span>
                    Khung giờ
                  </span>

                  <strong>
                    {
                      booking
                        .StartTime
                    }

                    {" - "}

                    {
                      booking
                        .EndTime
                    }
                  </strong>
                </div>


                <div>
                  <span>
                    Tổng tiền
                  </span>

                  <strong>
                    {
                      formatPrice(
                        booking
                          .TotalAmount
                      )
                    }
                    đ
                  </strong>
                </div>


                <div>
                  <span>
                    Trạng thái
                  </span>

                  <strong className="booking-pending-status">
                    PENDING
                  </strong>
                </div>

              </div>


              <button
                type="button"
                className="booking-confirm-primary"

                onClick={() =>
                  navigate(
                    "/fields"
                  )
                }
              >
                Quay lại danh sách sân
              </button>

            </section>

          </div>

        </main>
      </>
    );
  }


  // =========================================================
  // NO DRAFT
  // =========================================================

  if (!bookingDraft) {
    return (
      <>
        <Navbar />

        <main className="booking-confirm-page">

          <div className="booking-confirm-container">

            <section className="booking-confirm-empty">

              <h1>
                Không có thông tin đặt sân
              </h1>

              <p>
                Phiên đặt sân không
                tồn tại hoặc đã hết.
                Vui lòng chọn lại sân
                và khung giờ.
              </p>


              <button
                type="button"
                className="booking-confirm-primary"

                onClick={() =>
                  navigate(
                    "/fields"
                  )
                }
              >
                Chọn sân
              </button>

            </section>

          </div>

        </main>
      </>
    );
  }


  return (
    <>
      <Navbar />

      <main className="booking-confirm-page">

        <div className="booking-confirm-container">

          <button
            type="button"
            className="booking-confirm-back"

            onClick={
              handleBack
            }
          >
            <ArrowLeft size={18} />

            Chỉnh sửa lựa chọn
          </button>


          <div className="booking-confirm-layout">

            {/* ===============================================
                BOOKING INFORMATION
            =============================================== */}

            <section className="booking-confirm-card">

              <p className="booking-confirm-eyebrow">
                XÁC NHẬN ĐẶT SÂN
              </p>

              <h1>
                Kiểm tra thông tin
              </h1>


              <div className="booking-confirm-details">

                <div>
                  <span>
                    Sân
                  </span>

                  <strong>
                    {
                      bookingDraft
                        .FieldName
                    }
                  </strong>
                </div>


                <div>
                  <span>
                    Loại sân
                  </span>

                  <strong>
                    {
                      bookingDraft
                        .FieldType ||
                      "Chưa cập nhật"
                    }
                  </strong>
                </div>


                <div>
                  <span>
                    Địa điểm
                  </span>

                  <strong>
                    {
                      bookingDraft
                        .Location ||
                      "Chưa cập nhật"
                    }
                  </strong>
                </div>


                <div>
                  <span>
                    Ngày đặt
                  </span>

                  <strong>
                    {
                      bookingDraft
                        .BookingDate
                    }
                  </strong>
                </div>


                <div>
                  <span>
                    Khung giờ
                  </span>

                  <strong>
                    {
                      bookingDraft
                        .StartTime
                    }

                    {" - "}

                    {
                      bookingDraft
                        .EndTime
                    }
                  </strong>
                </div>


                <div>
                  <span>
                    Giá tham khảo
                  </span>

                  <strong className="booking-confirm-price">
                    {
                      formatPrice(
                        bookingDraft
                          .Price
                      )
                    }
                    đ
                  </strong>
                </div>

              </div>


              <p className="booking-price-note">
                Giá cuối cùng được
                Backend xác định lại
                từ cơ sở dữ liệu khi
                tạo booking.
              </p>

            </section>


            {/* ===============================================
                CUSTOMER
            =============================================== */}

            <aside className="booking-customer-card">

              <h2>
                Khách hàng
              </h2>


              {
                user ? (
                  <div className="booking-customer-info">

                    <div>
                      <span>
                        Họ tên
                      </span>

                      <strong>
                        {
                          user.FullName ||
                          "-"
                        }
                      </strong>
                    </div>


                    <div>
                      <span>
                        Email
                      </span>

                      <strong>
                        {
                          user.Email ||
                          "-"
                        }
                      </strong>
                    </div>


                    <div>
                      <span>
                        Số điện thoại
                      </span>

                      <strong>
                        {
                          user.Phone ||
                          "-"
                        }
                      </strong>
                    </div>

                  </div>
                ) : (
                  <div className="booking-login-warning">

                    Bạn chưa đăng nhập.

                    <button
                      type="button"

                      onClick={() =>
                        navigate(
                          "/login"
                        )
                      }
                    >
                      Đăng nhập
                    </button>

                  </div>
                )
              }


              {
                error && (
                  <div className="booking-confirm-error">
                    {error}
                  </div>
                )
              }


              <button
                type="button"

                className="booking-confirm-primary"

                disabled={
                  submitting ||
                  !user?.UserID
                }

                onClick={
                  handleConfirm
                }
              >
                {
                  submitting
                    ? "Đang tạo booking..."
                    : "Xác nhận đặt sân"
                }
              </button>

            </aside>

          </div>

        </div>

      </main>
    </>
  );
}


export default BookingConfirm;