export function bookingBalance(booking) {
  const total = Number(booking?.TotalAmount);
  const paid = Number(booking?.TotalPaidAmount ?? booking?.PaidAmount);
  const refunded = Number(booking?.RefundedAmount || 0);
  const valid = booking?.TotalAmount != null && Number.isFinite(total) && total >= 0 && Number.isFinite(paid) && paid >= 0 && Number.isFinite(refunded) && refunded >= 0 && refunded <= paid;
  const netPaid = paid - refunded;
  return { total, paid, refunded, netPaid, remaining: valid ? (booking?.Status === "CANCELLED" ? 0 : Math.max(total - netPaid, 0)) : null, valid, fullyPaid: valid && netPaid >= total };
}

export function bookingDisplayStatus(booking, now = Date.now()) {
  if (booking?.AttendanceState === "NO_SHOW") return "NO_SHOW";
  const status = String(booking?.Status || "").trim().toUpperCase();
  if (status === "CANCELLED" || status === "PENDING") return status;
  if (status === "CONFIRMED" || status === "COMPLETED") {
    const start = Date.parse(`${booking.BookingDate}T${String(booking.StartTime || "").slice(0,5)}:00+07:00`);
    const end = Date.parse(`${booking.BookingDate}T${String(booking.EndTime || "").slice(0,5)}:00+07:00`);
    if (Number.isFinite(end) && now >= end) return bookingBalance(booking).fullyPaid ? "COMPLETED" : "ENDED";
    if (Number.isFinite(start) && now >= start) return "IN_PROGRESS";
    return "CONFIRMED";
  }
  return status;
}

export function bookingNeedsCollection(booking, now = Date.now()) {
  const lifecycle = bookingDisplayStatus(booking, now);
  const balance = bookingBalance(booking);
  return ["AWAITING_ARRIVAL", "IN_PROGRESS", "ENDED"].includes(lifecycle) && balance.valid && !balance.fullyPaid;
}
