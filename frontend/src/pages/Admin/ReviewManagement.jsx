import { useState } from "react";
import useReviewInbox from "../../hooks/useReviewInbox";
import { saveReviewReply } from "../../services/review_service";
import ReviewReply from "../../components/ReviewPanel/ReviewReply";
import "../../components/ReviewPanel/Reviews.css";
import "./ReviewManagement.css";

export default function ReviewManagement() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [rating, setRating] = useState("");
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const { data, error, loading, updatedAt, refresh } = useReviewInbox({ page, status, rating });
  const submit = async (event, review) => {
    event.preventDefault();
    const comment = (drafts[review.reviewId] ?? review.reply?.comment ?? "").trim();
    if (!comment || saving !== null) return;
    setSaving(review.reviewId); setNotice(""); setSaveError("");
    try {
      await saveReviewReply(review.reviewId, comment);
      setNotice("Đã lưu phản hồi. Khách hàng có thể xem phản hồi cùng đánh giá.");
      setDrafts(previous => { const next = { ...previous }; delete next[review.reviewId]; return next; });
      window.dispatchEvent(new Event("reviews-updated"));
    } catch (err) { setSaveError(err.message || "Không thể lưu phản hồi"); }
    finally { setSaving(null); }
  };
  return <section className="uc10-admin">
    <header className="uc10-admin-heading"><div><span className="uc10-eyebrow">LẮNG NGHE NGƯỜI CHƠI</span><h1>Đánh giá & phản hồi</h1>
      <p className="uc10-muted">Tự cập nhật mỗi 30 giây và khi quay lại cửa sổ. Nội dung đang soạn được giữ nguyên.</p></div>
      <button className="uc10-button secondary" type="button" onClick={refresh}>Làm mới</button></header>
    <div className="uc10-admin-stats"><div><span>Tổng đánh giá</span><strong>{data?.totalReviews ?? "—"}</strong></div>
      <div><span>Chờ phản hồi</span><strong>{data?.unansweredCount ?? "—"}</strong></div>
      <div><span>Cập nhật gần nhất</span><strong className="uc10-admin-time">{updatedAt ? new Date(updatedAt).toLocaleTimeString("vi-VN") : "—"}</strong></div></div>
    <div className="uc10-admin-filters"><label>Trạng thái<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
      <option value="all">Tất cả</option><option value="unanswered">Chưa phản hồi</option><option value="answered">Đã phản hồi</option></select></label>
      <label>Điểm đánh giá<select value={rating} onChange={e => { setRating(e.target.value); setPage(1); }}>
        <option value="">Tất cả số sao</option>{[5,4,3,2,1].map(value => <option key={value} value={value}>{value} sao</option>)}</select></label></div>
    {(error || saveError) && <p className="uc10-error" role="alert">{saveError || error}</p>}
    {notice && <p className="uc10-success" role="status">{notice}</p>}
    {loading && <p role="status">Đang tải đánh giá…</p>}
    {!loading && data?.items.length === 0 && <div className="uc10-panel"><p>Chưa có đánh giá phù hợp với bộ lọc.</p>
      {page > 1 && <button className="uc10-button secondary" onClick={() => setPage(1)}>Về trang đầu</button>}</div>}
    {data?.items.map(review => <article className="uc10-panel uc10-admin-review" key={review.reviewId}>
      <header><div><span className="uc10-eyebrow">{review.fieldName} · Đơn #{review.bookingId}</span><h2>{review.customerName || "Khách hàng"}</h2></div>
        <span className={`uc10-reply-status ${review.reply ? "answered" : ""}`}>{review.reply ? "Đã phản hồi" : "Chờ phản hồi"}</span></header>
      <p className="uc10-stars-display" aria-label={`${review.rating} trên 5 sao`}>{"★".repeat(review.rating)}<span>{"☆".repeat(5-review.rating)}</span></p>
      <p className="uc10-comment">{review.comment}</p>
      <p className="uc10-muted">{new Date(review.createdAt).toLocaleString("vi-VN")}</p>
      <ReviewReply reply={review.reply} />
      <form className="uc10-form" onSubmit={event => submit(event, review)}>
        <label className="uc10-comment-label" htmlFor={`reply-${review.reviewId}`}>{review.reply ? "Cập nhật phản hồi" : "Phản hồi khách hàng"}</label>
        <textarea id={`reply-${review.reviewId}`} value={drafts[review.reviewId] ?? review.reply?.comment ?? ""}
          onChange={e => setDrafts(previous => ({ ...previous, [review.reviewId]: e.target.value }))}
          maxLength={1000} required rows={3} disabled={saving === review.reviewId} placeholder="Cảm ơn khách hàng, giải đáp hoặc ghi nhận góp ý…" />
        <div className="uc10-form-note"><span>Phản hồi được hiển thị công khai cùng đánh giá.</span><span>{(drafts[review.reviewId] ?? review.reply?.comment ?? "").length}/1000</span></div>
        <button className="uc10-button" type="submit" disabled={saving !== null || !(drafts[review.reviewId] ?? review.reply?.comment ?? "").trim()}>
          {saving === review.reviewId ? "Đang lưu…" : review.reply ? "Cập nhật phản hồi" : "Gửi phản hồi"}</button>
      </form>
    </article>)}
    {data && data.totalPages > 1 && <nav className="uc10-pagination" aria-label="Phân trang đánh giá">
      <button className="uc10-button secondary" disabled={page<=1} onClick={() => setPage(page-1)}>Trang trước</button><span>Trang {page}/{data.totalPages}</span>
      <button className="uc10-button secondary" disabled={page>=data.totalPages} onClick={() => setPage(page+1)}>Trang sau</button></nav>}
  </section>;
}
