import {
  useState,
} from "react";

import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import "../../pages/Admin/Admin.css";
import useReviewInbox from "../../hooks/useReviewInbox";


const MANAGER_ROLES = [
  "ADMIN",
  "STAFF",
];


const getStoredUser = () => {

  try {

    const rawUser =
      localStorage.getItem(
        "user"
      );


    if (!rawUser) {
      return null;
    }


    const savedUser =
      JSON.parse(
        rawUser
      );


    return savedUser?.UserID
      ? savedUser
      : null;

  } catch {

    return null;
  }
};


function AdminLayout() {

  const navigate =
    useNavigate();


  const location =
    useLocation();


  const [user] =
    useState(
      getStoredUser
    );


  const role =
    String(
      user?.Role || ""
    )
      .trim()
      .toUpperCase();

  const { data: reviewInbox } = useReviewInbox({ enabled: role === "ADMIN", pageSize: 1, status: "unanswered" });


  if (!user) {

    return (

      <Navigate
        to="/login"
        replace
      />
    );
  }


  if (
    !MANAGER_ROLES.includes(
      role
    )
  ) {

    return (

      <Navigate
        to="/fields"
        replace
      />
    );
  }


  const isAdmin =
    role === "ADMIN";


  const isActive = (
    path
  ) => {

    if (
      path === "/admin"
    ) {

      return (
        location.pathname
        === "/admin"
      );
    }


    return (

      location.pathname === path
      ||
      location.pathname.startsWith(
        `${path}/`
      )
    );
  };


  const handleLogout = () => {

    localStorage.removeItem(
      "user"
    );


    localStorage.removeItem(
      "accessToken"
    );


    localStorage.removeItem(
      "bookingDraft"
    );


    sessionStorage.removeItem(
      "bookingDraft"
    );


    window.dispatchEvent(
      new Event(
        "auth-changed"
      )
    );


    navigate(
      "/",
      {
        replace:
          true,
      }
    );
  };


  return (

    <div className="admin-container">

      <aside className="sidebar">

        <h2>
          ⚽ SÂN BÓNG
        </h2>


        <ul>

          <li
            className={
              isActive(
                "/admin"
              )
                ? "active"
                : ""
            }
            onClick={
              () =>
                navigate(
                  "/admin"
                )
            }
          >
            Tổng quan
          </li>


          {
            isAdmin
            &&
            (

              <li
                className={
                  isActive(
                    "/admin/fields"
                  )
                    ? "active"
                    : ""
                }
                onClick={
                  () =>
                    navigate(
                      "/admin/fields"
                    )
                }
              >
                Quản lý sân bóng
              </li>
            )
          }


          <li
            className={
              isActive(
                "/admin/bookings"
              )
                ? "active"
                : ""
            }
            onClick={
              () =>
                navigate(
                  "/admin/bookings"
                )
            }
          >
            Quản lý đặt sân
          </li>


          {
            isAdmin
            &&
            (
              <>

                <li>
                  Quản lý khách hàng
                </li>

                <li className={isActive("/admin/invoices") || isActive("/admin/invoice-management") ? "active" : ""}
                  onClick={() => navigate("/admin/invoices")}>
                  Hóa đơn & thanh toán
                </li>

                <li>
                  Thống kê & báo cáo
                </li>

                <li className={isActive("/admin/reviews") ? "active" : ""} onClick={() => navigate("/admin/reviews")}
                  role="link" tabIndex={0} onKeyDown={event => { if (event.key === "Enter") navigate("/admin/reviews"); }}>
                  Đánh giá & phản hồi {reviewInbox?.unansweredCount > 0 && <span aria-label={`${reviewInbox.unansweredCount} đánh giá chưa phản hồi`}
                    style={{marginLeft:8,background:"#fce9af",color:"#765000",borderRadius:12,padding:"2px 7px",fontSize:12}}>{reviewInbox.unansweredCount}</span>}
                </li>

                <li>
                  Cài đặt
                </li>

              </>
            )
          }

        </ul>


        <div
          className="logout"
          onClick={
            handleLogout
          }
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

            <span>
              🔔
            </span>


            <button type="button" className="admin-profile-button" onClick={() => navigate("/admin/profile")}
              aria-label="Mở thông tin cá nhân">
              <div>
              <b>
                {
                  user?.FullName
                  ||
                  user?.Email
                  ||
                  "Tài khoản quản lý"
                }
              </b>


              <small>

                {
                  role === "STAFF"
                    ? "Nhân viên"
                    : "Quản trị viên"
                }

              </small>
              <small className="admin-profile-link">Thông tin cá nhân ↗</small>
            </div>
            </button>

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
