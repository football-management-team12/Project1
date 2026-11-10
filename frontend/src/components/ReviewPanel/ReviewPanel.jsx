import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { getBookingReview, submitBookingReview } from "../../services/review_service";
import "./Reviews.css";

export default function ReviewPanel({ bookingId }) {
  const group = useId();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getBookingReview(bookingId, { signal: controller.signal })
      .then(setInfo)
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [bookingId, revision]);

  const submit = async event => {
    event.preventDefault();
    if (saving || !info?.canReview || !rating || !comment.trim()) return;
    setSaving(true); setError("");
    try {
      const review = await submitBookingReview(bookingId, rating, comment.trim());
      setInfo(previous => ({ ...previous, canReview: false, review }));
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Không thể gửi đánh giá");
      // A concurrent tab may have posted already; show the actual saved review.
      if (err.code === "REVIEW_ALREADY_EXISTS") {
        try { setInfo(await getBookingReview(bookingId)); } catch { /* Keep the original error. */ }
      }
    } finally { setSaving(false); }
  };

  return <section className="uc10-panel" id="booking-review-panel" aria-labelledby={`review-title-${group}`}>
    <header className="uc10-heading">
      <div><span className="uc10-eyebrow">TRẢI NGHIỆM CỦA BẠN</span><h2 id={`review-title-${group}`}>Đánh giá sân bóng</h2></div>
      <span className="uc10-heading-icon" aria-hidden="true">★</span>
    </header>
    <p className="uc10-muted">Chia sẻ trải nghiệm sau trận đấu. Mỗi đơn được gửi một đánh giá.</p>
    {loading && <p role="status">Đang tải đánh giá…</p>}
    {error && <p className="uc10-error" role="alert">{error}</p>}
    {success && <p className="uc10-success" role="status">Cảm ơn bạn! Đánh giá đã được gửi thành công.</p>}
    {!loading && !info && <button type="button" className="uc10-button secondary" onClick={() => {
      setLoading(true); setError(""); setRevision(value => value + 1);
    }}>Thử tải lại</button>}
    {!loading && info?.review && <div className="uc10-saved">
      <span className="uc10-eyebrow">ĐÁNH GIÁ CỦA BẠN</span>
      <p className="uc10-stars-display" aria-label={`${info.review.rating} trên 5 sao`}>{"★".repeat(info.review.rating)}<span>{"☆".repeat(5 - info.review.rating)}</span></p>
      <p className="uc10-comment">{info.review.comment}</p>
      <p className="uc10-muted">Đánh giá đã được lưu. Bạn không thể gửi thêm cho đơn này.</p>
    </div>}
    {!loading && info?.canReview && <form className="uc10-form" onSubmit={submit}>
      <fieldset disabled={saving}>
        <legend>Trải nghiệm của bạn thế nào?</legend>
        <div className="uc10-rating">
          {[1, 2, 3, 4, 5].map(value => <label key={value} className={value <= rating ? "selected" : ""}>
            <input type="radio" name={`rating-${group}`} value={value} checked={rating === value}
              onChange={() => setRating(value)} required aria-label={`${value} sao`} />
            <span aria-hidden="true">★</span>
          </label>)}
          <span className="uc10-rating-label">{rating ? `${rating}/5 sao` : "Chọn số sao"}</span>
        </div>
        <label className="uc10-comment-label" htmlFor={`comment-${group}`}>Nhận xét của bạn</label>
        <textarea id={`comment-${group}`} value={comment} onChange={e => setComment(e.target.value)}
          maxLength={1000} required rows={4} placeholder="Mặt sân, ánh sáng, dịch vụ… có đáp ứng mong đợi của bạn?" />
        <div className="uc10-form-note"><span>Nhận xét sẽ hiển thị trong đánh giá của sân.</span><span>{comment.length}/1000</span></div>
      </fieldset>
      <button className="uc10-button" type="submit" disabled={saving || !rating || !comment.trim()}>
        {saving ? "Đang gửi…" : "Gửi đánh giá"}
      </button>
    </form>}
    {!loading && info && !info.canReview && !info.review && <p>Chỉ đơn đã hoàn thành mới được đánh giá.</p>}
    {info?.fieldId && <Link className="uc10-link" to={`/fields/${info.fieldId}/reviews`}>Xem tất cả đánh giá của sân →</Link>}
  </section>;
}
