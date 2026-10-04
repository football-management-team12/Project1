import { useState } from "react";

import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import "../../pages/Admin/Admin.css";

const MANAGER_ROLES = ["ADMIN", "STAFF"];

const getStoredUser = () => {
  try {
    const rawUser = localStorage.getItem("user");

    if (!rawUser) {
      return null;
    }

    const savedUser = JSON.parse(rawUser);

    return savedUser?.UserID
      ? savedUser
      : null;
  } catch {
    return null;
  }
};

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user] = useState(getStoredUser);

  const role = String(user?.Role || "")
    .trim()
    .toUpperCase();

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (!MANAGER_ROLES.includes(role)) {
    return (
      <Navigate
        to="/fields"
        replace
      />
    );
  }

  const isAdmin = role === "ADMIN";

  const isActive = (path) => {
    if (path === "/admin") {
      return location.pathname === "/admin";
    }

    return (
      location.pathname === path ||
      location.pathname.startsWith(`${path}/`)
    );
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("bookingDraft");

    window.dispatchEvent(
      new Event("auth-changed")
    );

    navigate("/", {
      replace: true,
    });
  };

  return (
    <div className="admin-container">
      <aside className="sidebar">
        <h2>⚽ SÂN BÓNG</h2>

        <ul>
          <li
            className={
              isActive("/admin")
                ? "active"
                : ""
            }
            onClick={() =>
              navigate("/admin")
            }
          >
            Tổng quan
          </li>

          {isAdmin && (
            <li
              className={
                isActive("/admin/fields")
                  ? "active"
                  : ""
              }
              onClick={() =>
                navigate("/admin/fields")
              }
            >
              Quản lý sân bóng
            </li>
          )}

          <li
            className={
              isActive("/admin/bookings")
                ? "active"
                : ""
            }
            onClick={() =>
              navigate("/admin/bookings")
            }
          >
            Quản lý đặt sân
          </li>

          {isAdmin && (
            <>
              <li>Quản lý khách hàng</li>

              <li>Quản lý nhân viên</li>

              <li>Hóa đơn & thanh toán</li>

              <li>Thống kê & báo cáo</li>

              <li>Cài đặt</li>
            </>
          )}
        </ul>

        <div
          className="logout"
          onClick={handleLogout}
        >
          ↪ Đăng xuất
        </div>
      </aside>

      <main className="admin-content">
        <div className="top-header">
          <input
            placeholder="🔍 Tìm kiếm nhanh..."
          />

          <div className="admin-user">
            <span>🔔</span>

            <div>
              <b>
                {user?.FullName ||
                  user?.Email ||
                  "Tài khoản quản lý"}
              </b>

              <small>
                {role === "STAFF"
                  ? "Nhân viên"
                  : "Quản trị viên"}
              </small>
            </div>
          </div>
        </div>

        <Outlet
          context={{
            user,
            role,
            isAdmin,
          }}
        />
      </main>
    </div>
  );
}

export default AdminLayout;

