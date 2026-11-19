import { bookingBalance } from "../../utils/bookingStatus";
import "./BookingPaymentBadge.css";

export default function BookingPaymentBadge({ booking }) {
  const balance = bookingBalance(booking);
  const text = booking?.AttendanceState === "NO_SHOW" ? (balance.netPaid > Number(booking.PaidAmount || 0) ? "Giữ cọc · chờ hoàn phần dư" : "Giữ cọc · không thu thêm") : !balance.valid ? "Chưa xác định thanh toán" : balance.refunded > 0 && balance.netPaid === 0 ? "Đã hoàn tiền" : booking?.Status === "CANCELLED" ? (balance.netPaid > 0 ? "Chờ hoàn tiền" : "Không cần thanh toán") : balance.fullyPaid ? "Đã thu đủ" : "Chưa thu đủ";
  return <span className={`booking-payment-badge ${balance.fullyPaid ? "is-paid" : "is-unpaid"}`}>{text}</span>;
}
