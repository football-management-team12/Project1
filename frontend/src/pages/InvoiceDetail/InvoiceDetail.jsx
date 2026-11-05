import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar/Navbar";
import SettlementPanel from "../../components/SettlementPanel/SettlementPanel";
import { getBookingInvoice, getInvoice } from "../../services/invoice_service";
import "./InvoiceDetail.css";

const money = (value) => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND",
}).format(value ?? 0);
const statuses = { UNPAID: "Chưa thanh toán", PARTIALLY_PAID: "Đã thanh toán một phần", PAID: "Đã thanh toán đủ", UNKNOWN: "Chưa có trạng thái thanh toán" };

export default function InvoiceDetail({ adminView = false }) {
  const { invoiceId, bookingId } = useParams();
  const [revision, setRevision] = useState(0);
  let user = null;
  try { user = JSON.parse(localStorage.getItem("user") || "null"); } catch { /* ProtectedRoute handles invalid storage. */ }
  if (!adminView && user?.Role?.trim().toUpperCase() === "ADMIN") {
    return <Navigate replace to={invoiceId
      ? `/admin/invoices/${invoiceId}`
      : `/admin/bookings/${bookingId}/invoice`} />;
  }
  return <InvoiceView key={`${invoiceId || ""}:${bookingId || ""}:${revision}`}
    invoiceId={invoiceId} bookingId={bookingId} adminView={adminView}
    onRefresh={() => setRevision((value) => value + 1)} />;
}

function InvoiceView({ invoiceId, bookingId, onRefresh, adminView }) {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  let user = null;
  try { user = JSON.parse(localStorage.getItem("user") || "null"); } catch { /* Auth guard handles invalid storage. */ }
  const isAdmin = user?.Role?.toUpperCase() === "ADMIN";

  useEffect(() => {
    let active = true;
    const request = invoiceId ? getInvoice(invoiceId) : getBookingInvoice(bookingId);
    request.then((data) => { if (active) setInvoice(data); })
      .catch((err) => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [invoiceId, bookingId]);

  return <>{!adminView && <Navbar />}<section className={`invoice-page${adminView ? " invoice-page-admin" : ""}`}>
    <Link className="ui-button ui-button-secondary invoice-back" to={isAdmin ? "/admin/bookings" : "/bookings"}>← Danh sách đặt sân</Link>
    <h1>Chi tiết hóa đơn</h1>
    {loading && <p role="status">Đang tải hóa đơn...</p>}
    {!loading && error && <section role="alert">
      <h2>{error.status === 404 ? "Chưa có hóa đơn hoặc hóa đơn không tồn tại" : "Không thể mở hóa đơn"}</h2>
      <p>{error.message}</p>
      <button className="ui-button" onClick={onRefresh}>Thử lại</button>
    </section>}
    {!loading && !error && !invoice && <p>Chưa có thông tin hóa đơn.</p>}
    {!loading && invoice && <>
      <section className="invoice-card">
        <h2>{invoice.isProvisional ? "Hóa đơn tạm thời" : `Hóa đơn #${invoice.invoiceId}`} · Booking #{invoice.bookingId}</h2>
        <p className={`invoice-status invoice-status-${invoice.paymentStatus?.toLowerCase()}`}>{statuses[invoice.paymentStatus] || invoice.paymentStatus}</p>
        {invoice.isProvisional && <p>
          Đã ghi nhận đặt cọc thành công.
          {" "}Hóa đơn tạm thời chưa có mã hóa đơn chính thức.
        </p>}
        {invoice.remainingAmount > 0 && invoice.bookingStatus !== "CANCELLED" && <p className="invoice-balance-notice" role="status">
          {isAdmin ? "Khách hàng còn phải thanh toán " : "Vui lòng thanh toán số tiền còn lại "}
          <strong>{money(invoice.remainingAmount)}</strong>{isAdmin ? "." : " trực tiếp cho chủ sân."}
          {" "}{isAdmin ? "Chỉ xác nhận sau khi thực tế nhận đủ tiền theo điều kiện UC09." : "Trạng thái sẽ cập nhật khi chủ sân xác nhận đã thu đủ tiền."}
        </p>}
        <dl>
          <dt>Sân</dt><dd>{invoice.field.fieldName || (invoice.field.fieldId ? `Sân ${invoice.field.fieldId}` : "Chưa cập nhật")} · {invoice.field.fieldType || "--"}</dd>
          <dt>Địa điểm</dt><dd>{invoice.field.location || "Chưa cập nhật"}</dd>
          <dt>Ngày đặt</dt><dd>{invoice.bookingDate}</dd>
          <dt>Khung giờ</dt><dd>{invoice.startTime} – {invoice.endTime}</dd>
          <dt>Trạng thái booking</dt><dd>{invoice.bookingStatus}</dd>
          {!invoice.isProvisional && <><dt>Ngày lập hóa đơn</dt><dd>{invoice.createdDate || "--"}</dd></>}
          <dt>Tổng tiền</dt><dd>{money(invoice.totalAmount)}</dd>
          <dt>Đã đặt cọc</dt><dd>{money(invoice.depositAmount)}</dd>
          <dt>Đã thanh toán</dt><dd>{money(invoice.paidAmount)}</dd>
          <dt>Còn phải thanh toán</dt><dd><strong>{money(invoice.remainingAmount)}</strong></dd>
          <dt>Đã hoàn cọc (UC07)</dt><dd>{money(invoice.refundedAmount)}</dd>
        </dl>
        {invoice.bookingStatus === "CANCELLED" && <p>Booking đã hủy. Số tiền trên phản ánh lịch sử thu tiền; tiền hoàn được hiển thị riêng.</p>}
      </section>
      {invoice.remainingAmount > 0 && invoice.bookingStatus !== "CANCELLED" && <>
        <h2>Thanh toán phần còn lại (UC09)</h2>
        <SettlementPanel bookingId={invoice.bookingId} mode={isAdmin ? "admin" : "customer"}
          onPaymentConfirmed={onRefresh} onRefresh={onRefresh} />
      </>}
    </>}
  </section></>;
}
