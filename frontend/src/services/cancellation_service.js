
import { apiRequest, API_BASE_URL, getAccessToken } from "./api";

const id = (value) => encodeURIComponent(value);

// Xem điều kiện hủy và yêu cầu gần nhất
export const getCancellationInfo = (bookingId) =>
  apiRequest(
    `/api/bookings/${id(bookingId)}/cancellation`
  );

// CUSTOMER gửi yêu cầu hủy
export const requestCancellation = (
  bookingId,
  reason = "",
  refundAccount = null
) =>
  apiRequest(
    `/api/bookings/${id(bookingId)}/cancellation-requests`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: reason.trim(),
        refundAccount,
      }),
    }
  );

// ADMIN xem danh sách yêu cầu
export const getAdminCancellationRequests = (
  status = "PENDING_REVIEW"
) =>
  apiRequest(
    `/api/admin/cancellation-requests?status=${id(status)}`
  );

// ADMIN duyệt hoặc từ chối
export const decideCancellation = (
  requestId,
  decision,
  note = ""
) =>
  apiRequest(
    `/api/admin/cancellation-requests/${id(requestId)}/decision`,
    {
      method: "POST",
      body: JSON.stringify({
        decision,
        note,
      }),
    }
  );

// ADMIN hủy booking trực tiếp
export const adminCancelBooking = (
  bookingId,
  reason = ""
) =>
  apiRequest(
    `/api/bookings/${id(bookingId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({
        reason,
      }),
    }
  );

export const confirmDepositRefund = async (bookingId, transactionReference, file) => {
  const encoded = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Không đọc được biên lai"));
    reader.readAsDataURL(file);
  });
  return apiRequest(`/api/bookings/${id(bookingId)}/deposit-refund`, {
    method: "POST",
    body: JSON.stringify({ transactionReference: transactionReference.trim(), evidenceBase64: encoded,
      evidenceMimeType: file.type, evidenceFileName: file.name }),
  });
};

export const downloadRefundEvidence = async (bookingId) => {
  const response = await fetch(`${API_BASE_URL}/api/bookings/${id(bookingId)}/deposit-refund/evidence`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!response.ok) throw new Error("Không tải được biên lai hoàn cọc");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const extension = { "image/png": "png", "image/jpeg": "jpg", "application/pdf": "pdf" }[blob.type] || "bin";
  link.href = url;
  link.download = `bien-lai-hoan-coc-${bookingId}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
