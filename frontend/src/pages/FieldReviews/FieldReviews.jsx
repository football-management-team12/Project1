import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar/Navbar";
import { getFieldReviews } from "../../services/review_service";
import "../../components/ReviewPanel/Reviews.css";
import ReviewReply from "../../components/ReviewPanel/ReviewReply";

function ReviewList({ fieldId }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => getFieldReviews(fieldId, page, { signal: controller.signal })
      .then(next => { if (!controller.signal.aborted) { setData(next); setError(""); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    load();
    const visibleLoad = () => { if (document.visibilityState !== "hidden") load(); };
    const timer = window.setInterval(visibleLoad, 30000);
    window.addEventListener("focus", visibleLoad);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", visibleLoad); };
  }, [fieldId, page, revision]);
  const changePage = next => { setLoading(true); setError(""); setPage(next); };
  return <>
    <span className="uc10-eyebrow">GÓC NHÌN TỪ NGƯỜI CHƠI</span>
    <h1>{data?.fieldName ? `Đánh giá ${data.fieldName}` : "Đánh giá sân bóng"}</h1>
    <p className="uc10-muted">Nhận xét từ khách hàng có đơn đặt sân đã hoàn thành.</p>
    {error && <div role="alert" className="uc10-error">{error} <button className="uc10-button secondary" type="button"
      onClick={() => { setError(""); setLoading(true); setRevision(value => value + 1); }}>Thử lại</button></div>}
    {loading && <p role="status">Đang tải đánh giá…</p>}
    {!loading && !error && data && <>
      <div className="uc10-summary"><strong>{data.averageRating === null ? "—" : Number(data.averageRating).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}</strong>
        <div><b>trên 5 sao</b><p className="uc10-muted">{data.total} đánh giá từ khách đã đặt sân</p></div></div>
      <section className="uc10-review-list" aria-label="Danh sách đánh giá">
        {data.items.length === 0 ? <p className="uc10-muted">Chưa có đánh giá ở trang này.</p> : data.items.map(review =>
          <article key={review.reviewId} className="uc10-review">
            <header><strong>{review.reviewerName}</strong><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("vi-VN")}</time></header>
            <p className="uc10-stars-display" aria-label={`${review.rating} trên 5 sao`}>{"★".repeat(review.rating)}<span>{"☆".repeat(5-review.rating)}</span></p>
            <p className="uc10-comment">{review.comment}</p>
            <ReviewReply reply={review.reply} />
          </article>)}
      </section>
      {data.totalPages > 1 && <nav className="uc10-pagination" aria-label="Phân trang đánh giá">
        <button type="button" className="uc10-button secondary" disabled={page<=1} onClick={() => changePage(page-1)}>Trang trước</button>
        <span>Trang {page}/{data.totalPages}</span>
        <button type="button" className="uc10-button secondary" disabled={page>=data.totalPages} onClick={() => changePage(page+1)}>Trang sau</button>
      </nav>}
    </>}
  </>;
}

export default function FieldReviews() {
  const { fieldId } = useParams();
  return <div className="uc10-page"><Navbar /><main className="uc10-page-main">
    <Link className="uc10-link" to="/fields">← Danh sách sân</Link>
    <div style={{ marginTop: 28 }}><ReviewList key={fieldId} fieldId={fieldId} /></div>
  </main></div>;
}
