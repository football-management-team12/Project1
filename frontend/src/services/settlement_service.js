import { apiRequest } from "./api";

// Customer hoặc Admin xem số tiền còn lại.
export const getSettlement = (bookingId) =>
  apiRequest(
    `/api/bookings/${encodeURIComponent(bookingId)}/settlement`
  );

// Chỉ Admin xác nhận đã thu đủ tiền.
export const confirmFinalPayment = (bookingId) =>
  apiRequest(
    `/api/admin/bookings/${encodeURIComponent(bookingId)}/confirm-final-payment`,
    {
      method: "POST",
    }
  );