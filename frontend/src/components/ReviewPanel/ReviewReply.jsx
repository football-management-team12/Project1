export default function ReviewReply({ reply }) {
  if (!reply) return null;
  return <aside className="uc10-owner-reply">
    <strong>Phản hồi từ chủ sân</strong>
    <p className="uc10-comment">{reply.comment}</p>
    <small>{new Date(reply.updatedAt).toLocaleString("vi-VN")}</small>
  </aside>;
}
