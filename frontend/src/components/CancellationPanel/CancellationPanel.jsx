
import { useEffect, useState } from "react";
import { getCancellationInfo, downloadRefundEvidence } from "../../services/cancellation_service";
import CancelBookingModal from "../CancelBookingModal/CancelBookingModal";
import CancellationOutcome from "./CancellationOutcome";
import { cancellationDeadlinePassed } from "../../utils/cancellationDeadline";
import useBookingClock from "../../hooks/useBookingClock";
import { formatBusinessTime } from "../../utils/businessClock";
import "./CancellationPanel.css";

export default function CancellationPanel({ bookingId, bookingStatus, bookingDate, startTime, onCancelled }) {
  const now = useBookingClock();
  const deadlinePassed = cancellationDeadlinePassed(bookingDate, startTime, now);
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
    let timer;

    setLoading(true);
    setInfo(null);
    setError("");

    const poll = () => getCancellationInfo(bookingId)
      .then((v) => {
        if (active) { setInfo(v); setError(""); }
      })
      .catch((e) => {
        if (active) {
          setError(e.message || "Lỗi tải UC07");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          timer = window.setTimeout(poll, 10_000);
        }
      });
    poll();

    return () => {
      active = false;
      window.clearTimeout(timer);
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

      {notice && !["APPROVED", "REJECTED"].includes(info?.latestRequest?.status) && (
        <p
          className="uc07-panel-success"
          role="status"
        >
          {notice}
        </p>
      )}

      {info && !loading && (
        <>
          <CancellationOutcome request={info.latestRequest} bookingId={bookingId} />
          {deadlinePassed && !["CANCELLED", "COMPLETED"].includes(bookingStatus) && <p className="uc07-panel-error" role="status">Đã hết hạn hủy sân. Bạn chỉ có thể gửi yêu cầu trước giờ bắt đầu ít nhất 2 tiếng.</p>}
          {!info.latestRequest && !deadlinePassed && <p className="uc07-panel-status">
            {info.message}
          </p>}

          {info.refundStatus === "REFUNDED" && (
            <div className="uc07-panel-success">
              <p role="status">Chủ sân đã hoàn {Number(info.refundedAmount).toLocaleString("vi-VN")}đ cho bạn. Thời gian xác nhận: {formatBusinessTime(info.refundedAt)}.</p>
              {info.refundTransactionReference && <p>Mã giao dịch: {info.refundTransactionReference}</p>}
              {info.hasRefundEvidence && <button type="button" className="uc07-panel-refresh"
                onClick={() => downloadRefundEvidence(bookingId).catch(e => setError(e.message))}>Tải biên lai hoàn tiền</button>}
            </div>
          )}
          {info.latestRequest && (
            <div className="uc07-panel-history">
              <strong>
                Yêu cầu gần nhất: {{ PENDING_REVIEW: "Đang chờ duyệt", APPROVED: "Đã chấp nhận hủy", REJECTED: "Đã từ chối hủy" }[info.latestRequest.status] || "Đang cập nhật"}
              </strong>

              <p>
                Lý do khách yêu cầu hủy:{" "}
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
                  <strong>Tài khoản nhận hoàn tiền đã gửi</strong>
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
                {formatBusinessTime(info.cancellation.canceledAt)}
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

          {info.canCancel && !deadlinePassed &&
            !["PENDING_REVIEW", "REJECTED", "APPROVED"].includes(info.latestRequest?.status) && (
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
