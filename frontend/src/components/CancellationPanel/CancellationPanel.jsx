
import { useEffect, useState } from "react";
import { getCancellationInfo, downloadRefundEvidence } from "../../services/cancellation_service";
import CancelBookingModal from "../CancelBookingModal/CancelBookingModal";
import "./CancellationPanel.css";

export default function CancellationPanel({ bookingId, bookingStatus, onCancelled }) {
  const [info, setInfo] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");

    try {
      setInfo(await getCancellationInfo(bookingId));
    } catch (e) {
      setError(e.message || "Không thể tải UC07");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    setLoading(true);
    setInfo(null);
    setError("");

    getCancellationInfo(bookingId)
      .then((v) => {
        if (active) setInfo(v);
      })
      .catch((e) => {
        if (active) {
          setError(e.message || "Lỗi tải UC07");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [bookingId, bookingStatus]);

  const afterRequest = async (result) => {
    setModalOpen(false);
    setNotice(result.message || "Đã gửi yêu cầu hủy");

    await refresh();
    await onCancelled?.(result);
  };

  if (!bookingId) return null;

  return (
    <section className="uc07-panel">
      <div className="uc07-panel-heading">
        <div>
          <h2>Yêu cầu hủy đặt sân</h2>
          <p>
            ADMIN phải duyệt trước khi booking được hủy.
          </p>
        </div>

        <button
          type="button"
          className="uc07-panel-refresh"
          onClick={refresh}
          disabled={loading}
        >
          Làm mới
        </button>
      </div>

      {loading && (
        <p>Đang kiểm tra...</p>
      )}

      {error && (
        <p
          className="uc07-panel-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          className="uc07-panel-success"
          role="status"
        >
          {notice}
        </p>
      )}

      {info && !loading && (
        <>
          <p className="uc07-panel-status">
            {info.message}
          </p>

          {info.refundStatus === "REFUNDED" && (
            <div className="uc07-panel-success">
              <p role="status">Chủ sân đã hoàn {Number(info.refundedAmount).toLocaleString("vi-VN")}đ tiền cọc cho bạn. Thời gian xác nhận: {info.refundedAt}.</p>
              {info.refundTransactionReference && <p>Mã giao dịch: {info.refundTransactionReference}</p>}
              {info.hasRefundEvidence && <button type="button" className="uc07-panel-refresh"
                onClick={() => downloadRefundEvidence(bookingId).catch(e => setError(e.message))}>Tải biên lai hoàn cọc</button>}
            </div>
          )}
          {info.latestRequest && (
            <div className="uc07-panel-history">
              <strong>
                Yêu cầu gần nhất: {info.latestRequest.status}
              </strong>

              <p>
                Lý do:{" "}
                {info.latestRequest.reason || "Không có"}
              </p>

              {info.latestRequest.reviewNote && (
                <p>
                  Phản hồi ADMIN:{" "}
                  {info.latestRequest.reviewNote}
                </p>
              )}
              {info.latestRequest.refundAccount && (
                <div>
                  <strong>Tài khoản nhận hoàn cọc đã gửi</strong>
                  <p>Ngân hàng: {info.latestRequest.refundAccount.bankName}</p>
                  <p>Số tài khoản: {info.latestRequest.refundAccount.accountNumber}</p>
                  <p>Chủ tài khoản: {info.latestRequest.refundAccount.accountHolder}</p>
                </div>
              )}
            </div>
          )}

          {info.cancellation && (
            <div className="uc07-panel-history">
              <strong>
                Booking đã hủy
              </strong>

              <p>
                Lý do:{" "}
                {info.cancellation.reason || "Không có"}
              </p>

              <p>
                Thời điểm:{" "}
                {info.cancellation.canceledAt}
              </p>

              <p>
                Tiền cọc:{" "}
                {Number(
                  info.depositPaid || 0
                ).toLocaleString("vi-VN")}
                đ ({info.refundStatus})
              </p>
            </div>
          )}

          {info.canCancel &&
            info.latestRequest?.status !== "PENDING_REVIEW" && (
              <button
                type="button"
                className="uc07-panel-cancel"
                onClick={() => setModalOpen(true)}
              >
                Gửi yêu cầu hủy
              </button>
            )}
        </>
      )}

      <CancelBookingModal
        open={modalOpen}
        bookingId={bookingId}
        cancellationInfo={info}
        onClose={() => setModalOpen(false)}
        onSuccess={afterRequest}
      />
    </section>
  );
}
