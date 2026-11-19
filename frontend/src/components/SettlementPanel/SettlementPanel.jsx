import { useEffect, useState } from "react";

import {
  confirmFinalPayment,
  getSettlement,
} from "../../services/settlement_service";

import "./SettlementPanel.css";
import { businessNow } from "../../utils/businessClock";


const money = (value) =>
  `${Number(value || 0).toLocaleString("vi-VN")}đ`;


export default function SettlementPanel({
  bookingId,
  mode = "customer",
  refreshKey = "",
  onPaymentConfirmed,
  onRefresh,
}) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");


  // Lấy thông tin thanh toán mỗi khi mở booking.
  useEffect(() => {
    let active = true;

    setInfo(null);
    setError("");
    setLoading(true);

    getSettlement(bookingId)
      .then((data) => {
        if (active) {
          setInfo(data);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err.message || "Không thể tải thanh toán"
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [bookingId, refreshKey]);

  useEffect(() => {
    if (mode !== "admin" || !info?.confirmAvailableAt || info.canConfirm) return;
    const remaining = Date.parse(info.confirmAvailableAt) - businessNow();
    if (remaining <= 0) return;
    let active = true;
    const timer = setTimeout(() => {
      getSettlement(bookingId).then(data => { if (active) setInfo(data); })
        .catch(err => { if (active) setError(err.message); });
    }, Math.min(remaining + 100, 2147483647));
    return () => { active = false; clearTimeout(timer); };
  }, [bookingId, mode, info]);


  // Làm mới số tiền và trạng thái.
  const reload = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getSettlement(bookingId);

      setInfo(data);

      if (onRefresh) {
        await onRefresh();
      }

    } catch (err) {
      setError(
        err.message || "Không thể làm mới"
      );

    } finally {
      setLoading(false);
    }
  };


  // Admin xác nhận đã nhận tiền.
  const confirm = async () => {
    if (!info?.canConfirm || saving) {
      return;
    }

    const accepted = window.confirm(
      `Đã nhận đủ ${money(info.remainingAmount)} từ khách tại sân?`
    );

    if (!accepted) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await confirmFinalPayment(bookingId);

      const updated = await getSettlement(bookingId);

      setInfo(updated);

      if (onPaymentConfirmed) {
        await onPaymentConfirmed();
      }

    } catch (err) {
      setError(
        err.message || "Xác nhận thất bại"
      );

    } finally {
      setSaving(false);
    }
  };


  return (
    <section
      className="settlement-panel"
      aria-label="Thanh toán tại sân"
    >
      <div className="settlement-head">
        <h3>Thanh toán tại sân</h3>

        {info && (
          <span
            className={
              `settlement-status ${
                info.status === "PAID" ? "is-paid" : ""
              }`
            }
          >
            {({PAID:"Đã thanh toán đủ",RETAINED_DEPOSIT:"Khách không đến · giữ cọc",REFUNDED:"Đã hoàn tiền",REFUND_PENDING:"Chờ hoàn tiền"})[info.status] || "Chưa thanh toán đủ"}
          </span>
        )}
      </div>


      {loading && (
        <p role="status">
          Đang tải thông tin thanh toán...
        </p>
      )}

      {error && (
        <p
          className="settlement-error"
          role="alert"
        >
          {error}
        </p>
      )}


      {info && (
        <>
          <div className="settlement-numbers">
            <p>
              <span>Tổng tiền</span>
              <strong>{money(info.totalAmount)}</strong>
            </p>

            <p>
              <span>Đã cọc (VietQR UC06)</span>
              <strong>{money(info.depositAmount)}</strong>
            </p>

            <p>
              <span>Đã thu tất cả</span>
              <strong>{money(info.paidAmount)}</strong>
            </p>

            <p className="settlement-remaining">
              <span>Còn lại</span>
              <strong>{money(info.remainingAmount)}</strong>
            </p>
          </div>


          {info.status === "PAID" ? (
            <p className="settlement-help">
              Chủ sân đã xác nhận thu đủ tiền.
            </p>

          ) : mode === "customer" ? (
            <p className="settlement-help">
              Bạn thanh toán phần còn lại trực tiếp
              cho chủ sân sau khi đá. Trạng thái sẽ
              cập nhật khi Admin xác nhận.
            </p>

          ) : (
            <p className="settlement-help">
              Chỉ xác nhận khi bạn thực tế đã nhận đủ tiền.
              Thu đủ tiền không tự xác nhận khách đã kết thúc buổi đá.
            </p>
          )}


          {mode === "admin" && info.canConfirm && (
            <button
              type="button"
              className="settlement-confirm"
              onClick={confirm}
              disabled={saving || loading}
            >
              {saving
                ? "Đang xác nhận..."
                : "Xác nhận đã thu đủ"}
            </button>
          )}


          {mode === "admin" &&
            !info.canConfirm &&
            info.status !== "PAID" && (
              <p className="settlement-help">
                Chỉ xác nhận thu đủ từ giờ bắt đầu đá và khi thực tế đã nhận đủ tiền.
              </p>
            )}
        </>
      )}


      <button
        type="button"
        className="settlement-refresh"
        onClick={reload}
        disabled={loading || saving}
      >
        Làm mới trạng thái thanh toán
      </button>
    </section>
  );
}
