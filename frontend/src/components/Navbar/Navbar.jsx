import { NavLink, Link } from "react-router-dom";
import "./Navbar.css";
import logoIcon from "../../assets/icons/ball.png";


function Navbar() {
  return (
    <header className="navbar">
      <div className="navbar-container">

        {/* Logo */}
        <Link to="/" className="navbar-brand">
          <img src={logoIcon} alt="Logo Sân Bóng Xuân Son" className="navbar-logo-image" />
          <span>Sân Bóng Xuân Son</span>
        </Link>

        {/* Menu */}
        <nav className="navbar-menu">
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive ? "navbar-link active" : "navbar-link"
            }
          >
            Trang chủ
          </NavLink>

          <NavLink
            to="/fields"
            className={({ isActive }) =>
              isActive ? "navbar-link active" : "navbar-link"
            }
          >
            Danh sách sân
          </NavLink>

          <NavLink
            to="/booking"
            className={({ isActive }) =>
              isActive ? "navbar-link active" : "navbar-link"
            }
          >
            Lịch đặt
          </NavLink>

          <a href="#pricing" className="navbar-link">
            Bảng giá
          </a>
          
          <NavLink
            to="/about"
            className={({ isActive }) =>
              isActive ? "navbar-link active" : "navbar-link"
            }
          >
            Giới thiệu
          </NavLink>

          <a href="#contact" className="navbar-link">
            Liên hệ
          </a>
        </nav>

        {/* Auth */}
        <div className="navbar-auth">
          <Link to="/login" className="login-link">
            Đăng nhập
          </Link>

          <Link to="/register" className="register-btn">
            Đăng ký
          </Link>
        </div>

      </div>
    </header>
  );
}

export default Navbar;