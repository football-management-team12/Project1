import { useEffect, useRef, useState } from "react";

import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  MapPin,
} from "lucide-react";

import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import Navbar from "../../components/Navbar/Navbar";

import DepositPanel from "../../components/DepositPanel/DepositPanel";

import SettlementPanel from "../../components/SettlementPanel/SettlementPanel";

import {
  getCustomerBookingDetail,
} from "../../services/booking_service";

import "./BookingDetail.css";


const STATUS_META = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  CANCELLED: "Đã hủy",
  COMPLETED: "Hoàn thành",
};


function readUser() {
  try {
    return JSON.parse(
      localStorage.getItem("user") || "null"
    );

  } catch {
    return null;
  }
}


function formatDate(value) {
  if (!value) return "--";

  const date = new Date(
    `${value}T00:00:00`
  );

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("vi-VN").format(date);
}


function DetailRow({
  Icon,
  label,
  children,
}) {
  return (
    <div className="booking-detail-row">
      <Icon size={19} />

      <div>
        <span>{label}</span>
        <strong>{children}</strong>
      </div>
    </div>
  );
}


export default function BookingDetail() {
  const navigate = useNavigate();
  const location = useLocation();

  const focusHandled = useRef(false);

  const { bookingId } = useParams();

  const [user] = useState(readUser);

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const role = String(
    user?.Role || ""
  ).toUpperCase();

  const status = String(
    booking?.Status || ""
  ).toUpperCase();


  // ======================================================
  // REFRESH BOOKING
  // ======================================================

  const refreshBooking = async () => {
    if (!user?.UserID) return;

    const next = await getCustomerBookingDetail(
      user.UserID,
      bookingId
    );

    setBooking(next);
  };


  // ======================================================
  // LOAD BOOKING DETAIL
  // ======================================================

  useEffect(() => {
    if (
      !user?.UserID ||
      !bookingId ||
      role !== "CUSTOMER"
    ) {
      return undefined;
    }

    let active = true;

    setLoading(true);
    setError("");

    getCustomerBookingDetail(
      user.UserID,
      bookingId
    )
      .then((next) => {
        if (active) {
          setBooking(next);
        }
      })
      .catch((err) => {
        if (active) {
          setBooking(null);

          setError(
            err.message || "Không thể tải booking"
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user?.UserID, bookingId, role]);


  // ======================================================
  // KEEP UC06 DEPOSIT SCROLL
  // ======================================================

  useEffect(() => {
    if (
      !location.state?.focusDeposit ||
      !booking ||
      loading ||
      focusHandled.current
    ) {
      return;
    }

    focusHandled.current = true;

    window.requestAnimationFrame(() => {
      document
        .getElementById("booking-deposit-panel")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    });
  }, [location.state, booking, loading]);


  // ======================================================
  // ROLE GUARD
  // ======================================================

  if (role === "ADMIN" || role === "STAFF") {
    return (
      <Navigate
        to="/admin/bookings"
        replace
      />
    );
  }

  if (role !== "CUSTOMER") {
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

      <main className="booking-detail-page">

        <button
          type="button"
          className="booking-detail-back"
          onClick={() => navigate("/bookings")}
        >
          <ArrowLeft size={18} />
          Lịch sử đặt sân
        </button>


        {loading && (
          <section className="booking-detail-state">
            Đang tải chi tiết booking...
          </section>
        )}


        {!loading && error && (
          <section className="booking-detail-state booking-detail-error">
            <h1>Không thể mở booking</h1>

            <p>{error}</p>

            <button
              type="button"
              onClick={() => navigate("/bookings")}
            >
              Quay lại lịch sử
            </button>
          </section>
        )}


        {!loading && !error && booking && (
          <>

            {/* BOOKING HEADER */}

            <section className="booking-detail-header">
              <div>
                <p>BOOKING #{booking.BookingID}</p>

                <h1>
                  {booking.FieldName || `Sân ${booking.FieldID}`}
                </h1>

                <span>
                  {booking.FieldType || "Sân bóng"}
                </span>
              </div>

              <span
                className={
                  `booking-detail-status booking-detail-status-${status.toLowerCase()}`
                }
              >
                {STATUS_META[status] ||
                  status ||
                  "Không xác định"}
              </span>
            </section>


            {/* BOOKING INFORMATION AND UC09 */}

            <div className="booking-detail-grid">

              <section className="booking-detail-card">
                <h2>Thông tin đặt sân</h2>

                <DetailRow
                  Icon={CalendarDays}
                  label="Ngày đặt"
                >
                  {formatDate(booking.BookingDate)}
                </DetailRow>

                <DetailRow
                  Icon={Clock3}
                  label="Khung giờ"
                >
                  {booking.StartTime} - {booking.EndTime}
                </DetailRow>

                <DetailRow
                  Icon={MapPin}
                  label="Địa điểm"
                >
                  {booking.Location || "Chưa cập nhật"}
                </DetailRow>
              </section>


              {/* CUSTOMER CHỈ XEM THANH TOÁN */}

              <SettlementPanel
                bookingId={booking.BookingID}
                mode="customer"
                refreshKey={booking.PaidAmount}
                onRefresh={refreshBooking}
              />

            </div>


            {/* UC06 VẪN GIỮ NGUYÊN */}

            {!(
              ["CANCELLED", "COMPLETED"].includes(status)
            ) && (
              <div id="booking-deposit-panel">
                <DepositPanel
                  bookingId={booking.BookingID}
                  bookingStatus={booking.Status}
                  onPaymentChanged={refreshBooking}
                />
              </div>
            )}


            {/* CUSTOMER INFORMATION */}

            <section className="booking-detail-customer">
              <h2>Thông tin khách hàng</h2>

              <div>
                <p>
                  <span>Họ tên</span>
                  <strong>
                    {booking.CustomerName ||
                      user.FullName ||
                      "--"}
                  </strong>
                </p>

                <p>
                  <span>Email</span>
                  <strong>
                    {booking.Email ||
                      user.Email ||
                      "--"}
                  </strong>
                </p>

                <p>
                  <span>Số điện thoại</span>
                  <strong>
                    {booking.Phone ||
                      user.Phone ||
                      "--"}
                  </strong>
                </p>
              </div>
            </section>

          </>
        )}

      </main>
    </>
  );
}