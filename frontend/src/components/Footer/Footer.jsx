import { Link } from "react-router-dom";
import "./Footer.css";
import logoIcon from "../../assets/icons/ball.png";

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-main">
          {/* Logo + description */}

          <div className="footer-brand">
            <div className="footer-logo">
             <img src={logoIcon} alt="Logo Sân Bóng Xuân Son" className="navbar-logo-image" />

              <span>Sân Bóng Xuân Son</span>
            </div>

            <p>
              Hệ thống đặt sân bóng trực tuyến thông minh,
              kết nối các sân bóng chất lượng cao đến mọi
              cầu thủ trên toàn quốc.
            </p>
          </div>

          {/* About */}

          <div className="footer-column">
            <h3>Về chúng tôi</h3>

            <Link to="/gioi-thieu">
              Giới thiệu hệ thống
            </Link>

            <Link to="/dieu-khoan">
              Điều khoản sử dụng
            </Link>

            <Link to="/bao-mat">
              Chính sách bảo mật
            </Link>

            <Link to="/tin-tuc">
              Tin tức & sự kiện
            </Link>
          </div>

          {/* Support */}

          <div className="footer-column">
            <h3>Hỗ trợ khách hàng</h3>

            <Link to="/huong-dan">
              Hướng dẫn đặt sân
            </Link>

            <Link to="/thanh-toan">
              Phương thức thanh toán
            </Link>

            <Link to="/faq">
              Câu hỏi thường gặp
            </Link>

            <Link to="/trung-tam-tro-giup">
              Trung tâm trợ giúp
            </Link>
          </div>

          {/* Contact */}

          <div className="footer-column contact-column">
            <h3>Liên hệ</h3>

            <p>Hotline: 1900 1234</p>
            <p>Email: hotro@sanbong.vn</p>
            <p>
              Địa chỉ: Quận 7, TP. Hồ Chí Minh
            </p>
            <p>Hợp tác nhượng quyền</p>
          </div>
        </div>

        <div className="footer-bottom">
          <p>
            © 2026 Sân Bóng. Tất cả quyền được bảo lưu.
          </p>

          <div className="social-icons">
            <a href="#facebook" aria-label="Facebook">
              f
            </a>

            <a href="#youtube" aria-label="Youtube">
              ▶
            </a>

            <a href="#x" aria-label="X">
              x
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;