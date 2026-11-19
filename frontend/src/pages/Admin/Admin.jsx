import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  CalendarDays,
  TrendingUp,
  CircleX,
  Star,
  RefreshCw,
  Clock,
  BarChart3,
} from "lucide-react";
import { apiRequest } from "../../services/api";
import { getReportSummary } from "../../services/report_service";
import { getAdminReviews } from "../../services/review_service";
import { vietnamDate } from "../../utils/bookingTime";
import useBookingClock from "../../hooks/useBookingClock";
import "./Dashboard.css";

const money = (value) => `${Number(value).toLocaleString("vi-VN")} đ`;
const count = (value) => Number(value).toLocaleString("vi-VN");
const statuses = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};
const initial = { loading: true, data: null, error: "" };

function previousDays(day, amount) {
  const date = new Date(`${day}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() - amount);
  return vietnamDate(date.getTime());
}

function ResourceState({ resource, empty, children }) {
  if (resource.loading)
    return (
      <p className="dash-state" role="status">
        Đang tải dữ liệu…
      </p>
    );
  if (resource.error)
    return (
      <p className="dash-state dash-error" role="alert">
        {resource.error} Hãy bấm Làm mới để thử lại.
      </p>
    );
  if (empty) return <p className="dash-state">Chưa có dữ liệu.</p>;
  return children;
}

function RevenueChart({ rows }) {
  const values = rows.map((row) => Number(row.revenue));
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const y = (value) => 190 - ((value - min) / span) * 150;
  return (
    <>
      <svg
        className="dash-chart"
        viewBox="0 0 700 240"
        role="img"
        aria-label="Doanh thu thuần 7 ngày, gồm cả khoản âm và bằng không"
      >
        <line x1="15" x2="685" y1={y(0)} y2={y(0)} stroke="#b6cdbf" />
        {rows.map((row, index) => {
          const value = Number(row.revenue);
          const x = index * 98 + 23;
          return (
            <g key={row.date}>
              <rect
                x={x}
                y={Math.min(y(value), y(0))}
                width="64"
                height={Math.max(Math.abs(y(value) - y(0)), 2)}
                rx="4"
                fill={value < 0 ? "#d75b55" : "#07935f"}
              />
              <text
                x={x + 32}
                y={value < 0 ? y(value) + 17 : y(value) - 9}
                textAnchor="middle"
              >
                {count(value)}
              </text>
              <text x={x + 32} y="225" textAnchor="middle">
                {row.date.slice(8)}/{row.date.slice(5, 7)}
              </text>
              <title>
                {row.date}: {money(value)}
              </title>
            </g>
          );
        })}
      </svg>
      <details>
        <summary>Xem số liệu doanh thu</summary>
        <div className="dash-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Doanh thu thuần</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{money(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export default function Admin() {
  const { user, isAdmin, cancellationInbox } = useOutletContext();
  const now = useBookingClock();
  const today = vietnamDate(now);
  const [revision, setRevision] = useState(0);
  const [schedule, setSchedule] = useState(initial);
  const [week, setWeek] = useState(initial);
  const [daily, setDaily] = useState(initial);
  const [reviews, setReviews] = useState(initial);
  // Key responses by date/role so a previous day or account never appears as current.
  const key = `${today}:${isAdmin}:${user?.UserID}`;
  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const load = (setter, request) =>
      request()
        .then((data) => {
          if (!controller.signal.aborted)
            setter({ key, data, error: "", loading: false });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setter({
              key,
              data: null,
              error: error.message || "Không tải được dữ liệu",
              loading: false,
            });
        });
    const refresh = () => {
      load(setSchedule, () =>
        apiRequest(`/api/management/dashboard/schedule?date=${today}`, options),
      );
      if (isAdmin) {
        load(setWeek, () =>
          getReportSummary(
            { from: previousDays(today, 6), to: today },
            options,
          ),
        );
        load(setDaily, () =>
          getReportSummary({ from: today, to: today }, options),
        );
        load(setReviews, () =>
          getAdminReviews({ status: "unanswered", pageSize: 3 }, options),
        );
      }
    };
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") refresh();
    }, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [today, isAdmin, user?.UserID, key, revision]);
  const current = (state) => (state.key === key ? state : initial);
  const scheduleState = current(schedule);
  const weekState = current(week);
  const dailyState = current(daily);
  const reviewState = current(reviews);
  const pending = cancellationInbox?.requests || [];
  const cancelError = cancellationInbox?.error;
  const metrics = [
    {
      label: "Lượt đặt sân hôm nay",
      icon: CalendarDays,
      value: scheduleState.data?.total,
      error: scheduleState.error,
      to: "/admin/bookings",
      hint: "Theo ngày đặt sân, gồm mọi trạng thái",
    },
    ...(isAdmin
      ? [
          {
            label: "Doanh thu thuần hôm nay",
            icon: TrendingUp,
            value: dailyState.data?.revenue,
            error: dailyState.error,
            to: "/admin/reports",
            currency: true,
            hint: "Tiền thực nhận − đã hoàn, theo ngày đá",
          },
          {
            label: "Yêu cầu hủy chờ duyệt",
            icon: CircleX,
            value:
              cancellationInbox && !cancellationInbox.loading
                ? pending.length
                : null,
            error: cancelError,
            to: "/admin/bookings#cancellation-requests",
            hint: "Tất cả yêu cầu đang chờ",
          },
          {
            label: "Đánh giá chưa phản hồi",
            icon: Star,
            value: reviewState.data?.unansweredCount,
            error: reviewState.error,
            to: "/admin/reviews?status=unanswered",
            hint: "Tất cả đánh giá chưa có phản hồi",
          },
        ]
      : []),
  ];
  return (
    <section className="dash-page">
      <header className="dash-heading">
        <div>
          <p>
            Xin chào,{" "}
            <strong>
              {user?.FullName || user?.Email || "Tài khoản quản lý"}
            </strong>
            !
          </p>
          <h1>Tổng quan hoạt động</h1>
        </div>
        <div className="dash-toolbar">
          <span>
            <CalendarDays size={18} />
            {new Intl.DateTimeFormat("vi-VN", {
              dateStyle: "full",
              timeZone: "Asia/Ho_Chi_Minh",
            }).format(new Date(now))}
          </span>
          <button
            type="button"
            onClick={() => {
              setRevision((value) => value + 1);
              cancellationInbox?.refresh();
            }}
          >
            <RefreshCw size={16} />
            Làm mới
          </button>
        </div>
      </header>
      <div className={`dash-metrics ${isAdmin ? "" : "is-staff"}`}>
        {metrics.map(
          ({ label, icon: Icon, value, error, to, hint, currency }) => (
            <Link className="dash-metric" to={to} key={label}>
              <span className="dash-metric-icon">
                <Icon size={26} />
              </span>
              <div>
                <h2>{label}</h2>
                <strong>
                  {error
                    ? "Không tải được"
                    : value == null
                      ? "…"
                      : currency
                        ? money(value)
                        : count(value)}
                </strong>
                <small>{hint}</small>
              </div>
            </Link>
          ),
        )}
      </div>
      <div className={`dash-middle ${isAdmin ? "" : "is-staff"}`}>
        <section className="dash-card">
          <header>
            <h2>
              <CalendarDays size={21} />
              Lịch đặt sân hôm nay
            </h2>
            <Link to="/admin/bookings">
              Xem tất cả
            </Link>
          </header>
          <ResourceState
            resource={scheduleState}
            empty={scheduleState.data?.items.length === 0}
          >
            <div className="dash-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Khung giờ</th>
                    <th>Sân bóng</th>
                    <th>Khách hàng</th>
                    <th>Trạng thái đơn</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleState.data?.items.map((item) => (
                    <tr key={item.bookingId}>
                      <td className="dash-time">
                        {item.startTime}–{item.endTime}
                      </td>
                      <td>{item.fieldName || "Sân đã lưu trữ"}</td>
                      <td>
                        <strong>{item.customerName || "Khách hàng"}</strong>
                        <small>{item.phone || "—"}</small>
                      </td>
                      <td>
                        <span
                          className={`dash-status ${item.status.toLowerCase()}`}
                        >
                          {statuses[item.status] || item.status}
                        </span>
                      </td>
                      <td>
                        <Link
                          to={`/admin/bookings?bookingId=${item.bookingId}`}
                        >
                          Chi tiết
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ResourceState>
        </section>
        {isAdmin && (
          <section className="dash-card">
            <header>
              <h2>
                <Clock size={21} />
                Cần xử lý
              </h2>
              <span className="dash-muted">Hủy đơn &amp; đánh giá</span>
            </header>
            {cancelError ? (
              <p role="alert" className="dash-error">
                Không tải được yêu cầu hủy. Hãy làm mới.
              </p>
            ) : cancellationInbox?.loading ? (
              <p role="status" className="dash-state">
                Đang tải yêu cầu hủy…
              </p>
            ) : pending.length === 0 ? (
              <p className="dash-note">Không có yêu cầu hủy đang chờ.</p>
            ) : (
              <div className="dash-tasks">
                {pending.slice(0, 3).map((item) => (
                  <article
                    className="dash-task cancellation"
                    key={item.requestId}
                  >
                    <CircleX size={20} />
                    <div>
                      <strong>Yêu cầu hủy đơn #{item.bookingId}</strong>
                      <p>{item.customerName || "Khách hàng"}</p>
                      <small>{item.reason}</small>
                    </div>
                    <Link
                      to={`/admin/bookings?bookingId=${item.bookingId}#cancellation-requests`}
                    >
                      Xem yêu cầu
                    </Link>
                  </article>
                ))}
              </div>
            )}
            <ResourceState resource={reviewState} empty={false}>
              {reviewState.data?.items.length === 0 ? (
                <p className="dash-note">Không có đánh giá chờ phản hồi.</p>
              ) : (
                <div className="dash-tasks">
                  {reviewState.data?.items.map((item) => (
                    <article className="dash-task review" key={item.reviewId}>
                      <Star size={20} />
                      <div>
                        <strong>
                          {item.fieldName} · {item.rating}/5 sao
                        </strong>
                        <p>{item.customerName || "Khách hàng"}</p>
                        <small>{item.comment}</small>
                      </div>
                      <Link
                        to={`/admin/reviews?status=unanswered#review-${item.reviewId}`}
                      >
                        Xem đánh giá
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </ResourceState>
          </section>
        )}
      </div>
      {isAdmin && (
        <div className="dash-bottom">
          <section className="dash-card">
            <header>
              <h2>
                <BarChart3 size={21} />
                Doanh thu 7 ngày gần nhất
              </h2>
              <Link to="/admin/reports">
                Xem báo cáo
              </Link>
            </header>
            <ResourceState resource={weekState} empty={false}>
              {weekState.data && (
                <RevenueChart rows={weekState.data.dailyRevenue} />
              )}
            </ResourceState>
          </section>
          <section className="dash-card">
            <header>
              <h2>
                <Clock size={21} />
                Mức sử dụng sân hôm nay
              </h2>
            </header>
            <ResourceState
              resource={dailyState}
              empty={dailyState.data?.fieldUtilization.length === 0}
            >
              <div className="dash-utilization">
                {dailyState.data?.fieldUtilization.map((field) => (
                  <div key={field.fieldId}>
                    <strong>
                      {field.fieldName}
                      {field.isArchived ? " (đã lưu trữ)" : ""}
                    </strong>
                    <div
                      className="dash-progress"
                      role="meter"
                      aria-label={field.fieldName}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={field.utilizationPercent}
                    >
                      <span
                        style={{
                          width: `${Math.max(0, Math.min(100, field.utilizationPercent))}%`,
                        }}
                      />
                    </div>
                    <small>
                      {field.utilizationPercent}% · {field.bookedHours}/24 giờ
                    </small>
                  </div>
                ))}
              </div>
            </ResourceState>
          </section>
        </div>
      )}
    </section>
  );
}
