import { Link } from "react-router-dom";

import Navbar from "../../components/Navbar/Navbar";
import Footer from "../../components/Footer/Footer";
import FieldCard from "../../components/FieldCard/FieldCard";

import "./Home.css";

// Nếu bạn có ảnh local thì thay các URL bên dưới
// bằng:
// import heroImage from "../../assets/images/hero-stadium.jpg";

const fields = [
  {
    image:
      "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=900&q=80",
    name: "Sân bóng Sport Link ABC",
    address:
      "Lô C12, Khu đô thị mới Phú Mỹ Hưng, Quận 7, TP. HCM",
    price: "350.000đ",
    type: "Sân 7 Người",
  },
  {
    image:
      "https://images.unsplash.com/photo-1553778263-73a83bab9b0c?auto=format&fit=crop&w=900&q=80",
    name: "Sân bóng Victory XYZ",
    address:
      "Đường số 4, Thảo Điền, Quận 2, TP. Thủ Đức",
    price: "280.000đ",
    type: "Sân 5 Người",
  },
  {
    image:
      "https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=900&q=80",
    name: "Sân vận động Arena 789",
    address:
      "Phước Long B, Quận 9, TP. Thủ Đức, HCM",
    price: "650.000đ",
    type: "Sân 11 Người",
  },
];

function CheckIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function QualityIcon() {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M8.5 12.5 7 21l5-3 5 3-1.5-8.5" />
    </svg>
  );
}

function PriceIcon() {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
      <path d="M7 14h5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ArrowNext() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function Home() {
  return (
    <div className="home">
      <Navbar />

      {/* ================= HERO ================= */}

      <section className="hero">
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-badge">
              <span></span>
              HƠN 100+ SÂN CỎ ĐÃ SẴN SÀNG
            </div>

            <h1>
              Đặt sân bóng dễ dàng
              <br />
              Trải nghiệm tuyệt vời
            </h1>

            <p>
              Hệ thống tìm kiếm và đặt sân trực tuyến
              thông minh. Hỗ trợ thanh toán nhanh chóng,
              an toàn và đảm bảo lịch chính xác 100%
              không bị trùng lặp.
            </p>

            <Link
              to="/san-bong"
              className="hero-button"
            >
              Đặt sân ngay
            </Link>
          </div>

          <div className="hero-image-wrapper">
            <img
              src="https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=85"
              alt="Sân bóng đá"
              className="hero-image"
            />
          </div>
        </div>
      </section>

      {/* ================= WHY US ================= */}

      <section className="why-section">
        <div className="section-heading">
          <h2>Tại sao lại lựa chọn chúng tôi ?</h2>

          <p>
            Mang đến giải pháp quản lý và đặt sân tiện
            lợi nhất cho cộng đồng đam mê túc cầu.
          </p>
        </div>

        <div className="benefit-grid">
          <div className="benefit-card">
            <div className="benefit-icon">
              <QualityIcon />
            </div>

            <h3>Sân cỏ chất lượng</h3>

            <p>
              Hệ thống sân cỏ nhận tạo đạt chuẩn quốc tế,
              trang bị đèn LED chiếu sáng hiện đại và hệ
              thống lưới bao an toàn tuyệt đối.
            </p>
          </div>

          <div className="benefit-card">
            <div className="benefit-icon">
              <PriceIcon />
            </div>

            <h3>Giá cả hợp lý</h3>

            <p>
              Giá cả cạnh tranh kèm nhiều ưu đãi vào giờ
              thấp điểm. Bảng giá minh bạch, cam kết không
              phát sinh phụ phí ẩn.
            </p>
          </div>

          <div className="benefit-card">
            <div className="benefit-icon">
              <ClockIcon />
            </div>

            <h3>Đặt sân nhanh chóng</h3>

            <p>
              Đặt lịch chỉ với vài thao tác đơn giản. Xác
              nhận lịch đặt ngay lập tức qua SMS/Email giúp
              tiết kiệm tối đa thời gian.
            </p>
          </div>
        </div>
      </section>

      {/* ================= FEATURED FIELDS ================= */}

      <section className="featured-section">
        <div className="featured-container">
          <div className="featured-header">
            <div>
              <h2>Các sân bóng nổi bật</h2>

              <p>
                Những sân bóng được đánh giá cao nhất và
                có lượt đặt thường xuyên từ các câu lạc bộ.
              </p>
            </div>

            <div className="slider-buttons">
              <button
                type="button"
                aria-label="Sân trước"
              >
                <ArrowLeft />
              </button>

              <button
                type="button"
                aria-label="Sân tiếp theo"
              >
                <ArrowNext />
              </button>
            </div>
          </div>

          <div className="field-grid">
            {fields.map((field, index) => (
              <FieldCard
                key={index}
                image={field.image}
                name={field.name}
                address={field.address}
                price={field.price}
                type={field.type}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ================= STEPS ================= */}

      <section className="steps-section">
        <div className="section-heading">
          <h2>4 bước đặt sân đơn giản</h2>

          <p>
            Quy trình nhanh gọn giúp bạn ra sân bóng một
            cách thuận tiện nhất.
          </p>
        </div>

        <div className="steps-container">
          <div className="step-item">
            <div className="step-number">
              1
            </div>

            <h3>Chọn sân</h3>

            <p>
              Tìm kiếm và chọn sân phù hợp vị trí
              của bạn
            </p>
          </div>

          <div className="step-arrow">
            <ArrowRight />
          </div>

          <div className="step-item">
            <div className="step-number">
              2
            </div>

            <h3>Chọn thời gian</h3>

            <p>
              Lựa chọn khung giờ vàng còn trống
              trên lịch đặt
            </p>
          </div>

          <div className="step-arrow">
            <ArrowRight />
          </div>

          <div className="step-item">
            <div className="step-number">
              3
            </div>

            <h3>Xác nhận</h3>

            <p>
              Kiểm tra thông tin chi tiết hóa đơn
              đặt sân
            </p>
          </div>

          <div className="step-arrow">
            <ArrowRight />
          </div>

          <div className="step-item last">
            <div className="step-number active">
              4
            </div>

            <h3>Thanh toán</h3>

            <p>
              Nhận mã đặt sân và sẵn sàng ra sân
              tranh tài
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default Home;