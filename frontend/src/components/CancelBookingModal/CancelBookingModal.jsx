
import { useEffect, useState } from "react";

import { requestCancellation } from "../../services/cancellation_service";

import "./CancelBookingModal.css";


export default function CancelBookingModal({
  open,
  bookingId,
  cancellationInfo,
  onClose,
  onSuccess,
}) {
  const [reason, setReason] = useState("");
  const [refundAccount, setRefundAccount] = useState({ bankName: "", accountNumber: "", accountHolder: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
      setRefundAccount({ bankName: "", accountNumber: "", accountHolder: "" });
      setError("");
    }
  }, [open, bookingId]);

  if (!open) return null;

  const hasDeposit = Number(cancellationInfo?.depositPaid || 0) > 0;

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const result = await requestCancellation(
        bookingId,
        reason,
        hasDeposit ? {
          bankName: refundAccount.bankName.trim(),
          accountNumber: refundAccount.accountNumber.trim(),
          accountHolder: refundAccount.accountHolder.trim(),
        } : null
      );

      await onSuccess?.(result);
    } catch (err) {
      setError(
        err.message || "Gửi yêu cầu thất bại"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="uc07-modal-overlay">
      <section
        className="uc07-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="uc07-title"
      >
        <h2 id="uc07-title">
          Yêu cầu hủy booking #{bookingId}
        </h2>

        <p>
          Yêu cầu sẽ được ADMIN xem xét.
          Sân chưa được giải phóng cho đến
          khi được duyệt.
        </p>

        {Number(cancellationInfo?.depositPaid || 0) > 0 && (
          <p>
            Tiền cọc đã thu:{" "}
            {Number(
              cancellationInfo.depositPaid
            ).toLocaleString("vi-VN")}
            đ. Hoàn tiền cần được xem xét
            thủ công, không tự động.
          </p>
        )}

        <form onSubmit={submit}>
        <label htmlFor="uc07-reason">
          Lý do hủy
        </label>

        <textarea
          id="uc07-reason"
          value={reason}
          maxLength={500}
          rows={4}
          onChange={(e) =>
            setReason(e.target.value)
          }
          disabled={loading}
        />

        {hasDeposit && (
          <fieldset className="uc07-refund-account" disabled={loading}>
            <legend>Tài khoản nhận hoàn cọc</legend>
            <p>Nhập chính xác thông tin để chủ sân chuyển lại tiền cọc sau khi duyệt hủy.</p>
            <label htmlFor="uc07-bank-name">Ngân hàng</label>
            <input id="uc07-bank-name" name="bankName" type="text" required maxLength={100}
              placeholder="Ví dụ: Vietcombank"
              value={refundAccount.bankName}
              onChange={e => setRefundAccount(prev => ({ ...prev, bankName: e.target.value }))} />
            <label htmlFor="uc07-account-number">Số tài khoản</label>
            <input id="uc07-account-number" name="accountNumber" type="text" required maxLength={34}
              pattern="[A-Za-z0-9]{1,34}" title="Nhập số tài khoản gồm chữ hoặc số, không có khoảng trắng"
              placeholder="Số tài khoản nhận tiền"
              value={refundAccount.accountNumber}
              onChange={e => setRefundAccount(prev => ({ ...prev, accountNumber: e.target.value }))} />
            <label htmlFor="uc07-account-holder">Tên chủ tài khoản</label>
            <input id="uc07-account-holder" name="accountHolder" type="text" required maxLength={100}
              placeholder="Ví dụ: NGUYEN VAN A"
              value={refundAccount.accountHolder}
              onChange={e => setRefundAccount(prev => ({ ...prev, accountHolder: e.target.value }))} />
          </fieldset>
        )}

        {error && (
          <p
            role="alert"
            className="uc07-modal-error"
          >
            {error}
          </p>
        )}

        <div className="uc07-modal-actions">
          <button
            className="uc07-btn-back"
            type="button"
            disabled={loading}
            onClick={onClose}
          >
            Quay lại
          </button>

          <button
            className="uc07-btn-confirm"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Đang gửi..."
              : "Gửi yêu cầu hủy"}
          </button>
        </div>
        </form>
      </section>
    </div>
  );
}
