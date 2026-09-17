import { Link } from "react-router-dom";
import "./Navbar.css";

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function Navbar() {
  return (
    <header className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <span className="logo-icon">⚽</span>
          <span>Sân Bóng</span>
        </Link>

        <nav className="navbar-menu">
          <Link to="/" className="navbar-link active">
            Trang chủ
          </Link>

          <Link to="/san-bong" className="navbar-link">
            Sân bóng
          </Link>

          <Link to="/lich-dat" className="navbar-link">
            Lịch đặt
          </Link>

          <Link to="/bang-gia" className="navbar-link">
            Bảng giá
          </Link>

          <Link to="/lien-he" className="navbar-link">
            Liên hệ
          </Link>
        </nav>

        <div className="navbar-right">
          <div className="search-box">
            <input
              type="text"
              placeholder="Tìm kiếm sân bóng"
            />
            <SearchIcon />
          </div>

          <Link to="/dang-nhap" className="login-link">
            Đăng nhập
          </Link>

          <Link to="/dang-ky" className="register-button">
            Đăng ký
          </Link>
        </div>
      </div>
    </header>
  );
}

export default Navbar;