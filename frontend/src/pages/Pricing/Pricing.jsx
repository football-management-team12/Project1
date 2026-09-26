import { useState } from "react";
import {
  CircleDollarSign,
  CupSoda,
  Shirt,
  UserRound,
  Check,
} from "lucide-react";
import { Link } from "react-router-dom";

import Navbar from "../../components/Navbar/Navbar";
import Footer from "../../components/Footer/Footer";

import {
  PRICE_SLOTS,
  formatPrice,
} from "../../utils/pricing";

import "./Pricing.css";

function Pricing() {
  const [fieldType, setFieldType] = useState("7");
  const [dayType, setDayType] = useState("weekday");

  const services = [
    {
      icon: <CircleDollarSign size={19} />,
      title: "Thuê bóng",
      desc: "Bóng động lực chất lượng cao đạt chuẩn thi đấu.",
      price: "30.000đ / trận",
    },
    {
      icon: <CupSoda size={19} />,
      title: "Nước uống",
      desc: "Nước suối được điện giải ướp lạnh sẵn sàng.",
      price: "15.000đ / chai",
    },
    {
      icon: <Shirt size={19} />,
      title: "Áo tập",
      desc: "Áo pitch phân biệt đội màu sắc đa dạng sạch sẽ.",
      price: "20.000đ / bộ",
    },
    {
      icon: <UserRound size={19} />,
      title: "Trọng tài",
      desc: "Trọng tài điều hành trận đấu đúng luật và công bằng.",
      price: "150.000đ / trận",
    },
  ];

  return (
    <>
      <Navbar />

      <main className="pricing-page">
        <section className="pricing-hero">
          <div className="pricing-container">
            <h1>BẢNG GIÁ THUÊ SÂN</h1>
            <p>
              Bảng giá minh bạch theo loại sân và khung giờ
            </p>
          </div>
        </section>

        <section className="pricing-content">
          <div className="pricing-container">
            <div className="pricing-toolbar">
              <div className="pricing-tabs">
                <button
                  className={
                    fieldType === "5"
                      ? "tab-btn active"
                      : "tab-btn"
                  }
                  onClick={() => setFieldType("5")}
                >
                  Sân 5 người
                </button>

                <button
                  className={
                    fieldType === "7"
                      ? "tab-btn active"
                      : "tab-btn"
                  }
                  onClick={() => setFieldType("7")}
                >
                  Sân 7 người
                </button>
              </div>

              <div className="day-tabs">
                <button
                  className={
                    dayType === "weekday"
                      ? "day-btn active"
                      : "day-btn"
                  }
                  onClick={() =>
                    setDayType("weekday")
                  }
                >
                  Ngày thường
                </button>

                <button
                  className={
                    dayType === "weekend"
                      ? "day-btn active"
                      : "day-btn"
                  }
                  onClick={() =>
                    setDayType("weekend")
                  }
                >
                  Cuối tuần
                </button>
              </div>
            </div>

            <div className="price-table-card">
              <div className="price-table-head">
                <div>KHUNG GIỜ</div>
                <div>ĐƠN GIÁ (VND/GIỜ)</div>
                <div>GHI CHÚ</div>
                <div>HÀNH ĐỘNG</div>
              </div>

              {PRICE_SLOTS.map((item, index) => (
                <div
                  className="price-table-row"
                  key={index}
                >
                  <div className="time-col">
                    {item.time}
                  </div>

                  <div className="price-col">
                    {formatPrice(item.price)}đ/giờ
                  </div>

                  <div className="note-col">
                    {item.highlight ? (
                      <span className="peak-badge">
                        {item.note}
                      </span>
                    ) : (
                      item.note
                    )}
                  </div>

                  <div className="action-col">
                    <Link
                      to="/booking"
                      className="book-small-btn"
                    >
                      Đặt sân
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <section className="extra-services">
              <div className="section-title">
                <h2>Dịch vụ bổ sung</h2>

                <p>
                  Các dịch vụ tiện ích đi kèm giúp trận đấu của bạn trọn vẹn và
                  chuyên nghiệp hơn
                </p>
              </div>

              <div className="service-grid">
                {services.map((service, index) => (
                  <div
                    className="service-card"
                    key={index}
                  >
                    <div className="service-icon">
                      {service.icon}
                    </div>

                    <h3>{service.title}</h3>

                    <p>{service.desc}</p>

                    <strong>
                      {service.price}
                    </strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="price-note-box">
              <h3>Lưu ý về bảng giá</h3>

              <div className="note-grid">
                <div className="note-item">
                  <Check size={15} />
                  <span>
                    Giá có thể thay đổi vào ngày lễ.
                  </span>
                </div>

                <div className="note-item">
                  <Check size={15} />
                  <span>
                    Hủy sân đúng thời hạn được hỗ trợ đổi lịch.
                  </span>
                </div>

                <div className="note-item">
                  <Check size={15} />
                  <span>
                    Khách hàng cần đặt cọc để giữ sân.
                  </span>
                </div>

                <div className="note-item">
                  <Check size={15} />
                  <span>
                    Liên hệ quản lý khi cần đặt sân dài hạn.
                  </span>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section className="pricing-cta">
          <div className="pricing-container cta-content">
            <div>
              <h2>
                Bạn đã chọn được khung giờ phù hợp?
              </h2>

              <p>
                Nhanh tay đặt lịch để chắc chắn sở hữu sân cỏ đẹp nhất vào khung
                giờ vàng tuần này.
              </p>
            </div>

            <div className="cta-buttons">
              <Link
                to="/booking"
                className="cta-book-btn"
              >
                Đặt sân ngay
              </Link>

              <a
                href="#contact"
                className="cta-contact-btn"
              >
                Liên hệ tư vấn
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

export default Pricing;
