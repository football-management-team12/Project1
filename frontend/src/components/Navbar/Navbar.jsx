import {
  useEffect,
  useState,
} from "react";

import {
  Link,
  NavLink,
  useNavigate,
} from "react-router-dom";

import {
  LogOut,
  UserRound,
} from "lucide-react";

import logoIcon
  from "../../assets/icons/ball.png";

import {
  getStoredUser,
  logoutUser,
} from "../../services/auth_service";

import "./Navbar.css";


function Navbar() {

  const navigate =
    useNavigate();


  const [
    user,
    setUser,
  ] =
    useState(null);


  // =========================================================
  // LOAD USER
  // =========================================================

  const loadUser = () => {

    setUser(
      getStoredUser()
    );
  };


  // =========================================================
  // AUTH CHANGE
  // =========================================================

  useEffect(() => {

    loadUser();


    const handleAuthChanged =
      () => {

        loadUser();
      };


    window.addEventListener(
      "auth-changed",
      handleAuthChanged
    );


    return () => {

      window.removeEventListener(
        "auth-changed",
        handleAuthChanged
      );
    };

  }, []);


  // =========================================================
  // LOGOUT
  // =========================================================

  const handleLogout = () => {

    logoutUser();


    setUser(
      null
    );


    navigate(
      "/",
      {
        replace:
          true,
      }
    );
  };


  // =========================================================
  // DISPLAY NAME
  // =========================================================

  const displayName =
    user?.FullName
    ||
    user?.Username
    ||
    user?.Email
    ||
    "Tài khoản";


  return (

    <header className="navbar">

      <div className="navbar-container">


        {/* LOGO */}

        <Link
          to="/"
          className="navbar-brand"
        >

          <img
            src={logoIcon}
            alt="Logo Sân Bóng Xuân Son"
            className="navbar-logo-image"
          />

          <span>
            Sân Bóng Xuân Son
          </span>

        </Link>


        {/* MENU */}

        <nav className="navbar-menu">

          <NavLink
            to="/"
            className={
              ({ isActive }) =>
                isActive
                  ? "navbar-link active"
                  : "navbar-link"
            }
          >
            Trang chủ
          </NavLink>


          <NavLink
            to="/fields"
            className={
              ({ isActive }) =>
                isActive
                  ? "navbar-link active"
                  : "navbar-link"
            }
          >
            Danh sách sân
          </NavLink>


          <NavLink
            to="/bookings"
            className={
              ({ isActive }) =>
                isActive
                  ? "navbar-link active"
                  : "navbar-link"
            }
          >
            Lịch đặt
          </NavLink>


          <NavLink
            to="/pricing"
            className={
              ({ isActive }) =>
                isActive
                  ? "navbar-link active"
                  : "navbar-link"
            }
          >
            Bảng giá
          </NavLink>


          <NavLink
            to="/about"
            className={
              ({ isActive }) =>
                isActive
                  ? "navbar-link active"
                  : "navbar-link"
            }
          >
            Giới thiệu
          </NavLink>


          <a
            href="#contact"
            className="navbar-link"
          >
            Liên hệ
          </a>

        </nav>


        {/* AUTH */}

        {
          user
            ? (

              <div className="navbar-user-area">


                {/* CLICK USER -> PROFILE */}

                <Link
                  to="/profile"
                  className="navbar-user-info"
                  title="Thông tin cá nhân"
                >

                  <div className="navbar-user-avatar">

                    <UserRound
                      size={18}
                    />

                  </div>


                  <div className="navbar-user-content">

                    <span className="navbar-user-label">
                      Đã đăng nhập
                    </span>

                    <span className="navbar-user-name">
                      {displayName}
                    </span>

                  </div>

                </Link>


                <button
                  type="button"
                  className="navbar-logout-button"
                  onClick={
                    handleLogout
                  }
                >

                  <LogOut
                    size={17}
                  />

                  <span>
                    Đăng xuất
                  </span>

                </button>

              </div>

            )
            : (

              <div className="navbar-auth">

                <Link
                  to="/login"
                  className="login-link"
                >
                  Đăng nhập
                </Link>


                <Link
                  to="/register"
                  className="register-btn"
                >
                  Đăng ký
                </Link>

              </div>

            )
        }

      </div>

    </header>
  );
}


export default Navbar;