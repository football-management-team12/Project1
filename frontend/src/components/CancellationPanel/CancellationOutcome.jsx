import "./CancellationPanel.css";
import { formatBusinessTime } from "../../utils/businessClock";

export default function CancellationOutcome({ request, bookingId }) {
  if (!request) return null;
  const message = {
    PENDING_REVIEW: "Yêu cầu hủy đang chờ chủ sân xét duyệt. Đơn đặt sân chưa được hủy.",
    REJECTED: "Yêu cầu hủy đã bị từ chối. Tại thời điểm xét duyệt, đơn được giữ nguyên. Bạn không thể gửi lại yêu cầu hủy cho đơn này.",
    APPROVED: "Yêu cầu hủy đã được chấp nhận. Đơn đặt sân đã hủy thành công.",
  }[request.status];
  if (!message) return null;
  return <div role="status" className={`uc07-outcome uc07-outcome-${request.status.toLowerCase()}`}>
    <strong>Lịch sử yêu cầu hủy đơn #{bookingId}</strong>
    <p>{message}</p>
    {request.reviewNote && <p>Phản hồi chủ sân: {request.reviewNote}</p>}
    {request.reviewedAt && <p>Thời gian xử lý: {formatBusinessTime(request.reviewedAt)}</p>}
  </div>;
}
