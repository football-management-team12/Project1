import Navbar from "../../components/Navbar/Navbar";
import Footer from "../../components/Footer/Footer";

import aboutHero from "../../assets/images/football-field.jpg";
import fieldOverview from "../../assets/images/football-field.jpg";
import gallery1 from "../../assets/images/football-field.jpg";
import gallery2 from "../../assets/images/football-field.jpg";
import gallery3 from "../../assets/images/football-field.jpg";

import {
  Award,
  Lightbulb,
  ShieldCheck,
  Clock3,
  Check,
} from "lucide-react";

import "./About.css";

function About() {
  return (
    <>
      <Navbar />

      <main className="about-page">
        {/* HERO */}
        <section className="about-hero">
          <div className="about-container about-hero-content">
            <div className="about-hero-text">
              <div className="about-badge">
                <span></span>
                VỀ CHÚNG TÔI
              </div>

              <h1>
                Kiến tạo không gian <br />
                Đam mê sân cỏ
              </h1>

              <p>
                Chúng tôi tự hào là đơn vị tiên phong cung cấp tổ hợp sân bóng
                đá nhân tạo hiện đại, quy chuẩn và tích hợp công nghệ đặt sân
                trực tuyến nhanh chóng nhất hiện nay.
              </p>
            </div>

            <div className="about-hero-image">
              <img src={aboutHero} alt="Sân bóng hiện đại" />
            </div>
          </div>
        </section>

        {/* SPORTS COMPLEX */}
        <section className="about-section">
          <div className="about-container">
            <div className="section-heading">
              <h2>Mô hình tổ hợp thể thao hiện đại</h2>
              <p>
                Tất cả sân thành phần được quy hoạch đồng bộ tại một địa điểm
                duy nhất, tối ưu trải nghiệm tập luyện.
              </p>
            </div>

            <div className="sports-model-card">
              <div className="sports-model-text">
                <h3>Một hệ thống - Đa dạng lựa chọn</h3>

                <p>
                  Khác biệt với các mô hình sân đơn lẻ, chúng tôi vận hành một
                  cụm tổ hợp gồm nhiều sân thành phần chất lượng cao, tập trung
                  chủ yếu vào quy chuẩn sân 7 người - kích thước vàng được ưa
                  chuộng nhất cho các trận đấu phong trào lẫn bán chuyên.
                </p>

                <p>
                  Mô hình tập trung này giúp các đội bóng dễ dàng giao lưu chéo,
                  tổ chức giải đấu quy mô nội bộ, đồng thời thu hút trọng tài,
                  dịch vụ hậu cần chuẩn chỉ mà không phải di chuyển xa.
                </p>
              </div>

              <div className="sports-model-image">
                <img src={fieldOverview} alt="Mô hình sân bóng" />
              </div>
            </div>

            {/* MISSION */}
            <div className="about-values-grid">
              <div className="value-card">
                <div className="value-icon">
                  <Check size={16} />
                </div>
                <h3>Sứ mệnh</h3>
                <p>
                  Thúc đẩy phong trào thể thao lành mạnh bằng cách mang lại
                  không gian tập luyện chuyên nghiệp, an toàn và dễ tiếp cận
                  nhất cho mọi người.
                </p>
              </div>

              <div className="value-card">
                <div className="value-icon">
                  <Lightbulb size={16} />
                </div>
                <h3>Tầm nhìn</h3>
                <p>
                  Trở thành biểu tượng của hệ thống sân bóng phong trào kiểu
                  mẫu, dẫn đầu về ứng dụng công nghệ quản lý và chuẩn hóa cơ sở
                  vật chất.
                </p>
              </div>

              <div className="value-card">
                <div className="value-icon">
                  <Check size={16} />
                </div>
                <h3>Giá trị cốt lõi</h3>
                <p>
                  Minh bạch trong bảng giá, cam kết chất lượng mặt sân tối đa,
                  tận tâm trong phục vụ và luôn đặt sự hài lòng của cầu thủ lên
                  hàng đầu.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ADVANTAGES */}
        <section className="advantages-section">
          <div className="about-container">
            <div className="section-heading center">
              <h2>Ưu thế vượt trội của hệ thống</h2>
              <p>
                Từng chi tiết nhỏ đều được đầu tư bài bản để đảm bảo những trận
                cầu thăng hoa nhất.
              </p>
            </div>

            <div className="advantages-grid">
              <div className="advantage-card">
                <div className="advantage-icon">
                  <Award size={18} />
                </div>
                <h3>Mặt cỏ nhân tạo cao cấp</h3>
                <p>
                  Sử dụng sợi cỏ chất lượng từ đối tác uy tín, độ đàn hồi cực
                  tốt, hạn chế tối đa chấn thương cho cầu thủ khi tranh chấp
                  bóng.
                </p>
              </div>

              <div className="advantage-card">
                <div className="advantage-icon">
                  <Lightbulb size={18} />
                </div>
                <h3>Chiếu sáng chống chói</h3>
                <p>
                  Hệ thống đèn LED hiện đại phân bổ ánh sáng đều khắp mặt sân,
                  cường độ tiêu chuẩn và không gây chói mắt khi người chơi đánh
                  đầu.
                </p>
              </div>

              <div className="advantage-card">
                <div className="advantage-icon">
                  <ShieldCheck size={18} />
                </div>
                <h3>Bãi đỗ xe an toàn & rộng rãi</h3>
                <p>
                  Khu vực giữ xe máy và ô tô thông thoáng, có camera giám sát và
                  nhân viên túc trực liên tục đảm bảo an ninh cho cầu thủ và cổ
                  động viên.
                </p>
              </div>

              <div className="advantage-card">
                <div className="advantage-icon">
                  <Check size={18} />
                </div>
                <h3>Phòng thay đồ tiện nghi</h3>
                <p>
                  Phòng thay đồ và khu vực vệ sinh sạch sẽ, cung cấp nước uống
                  miễn phí và khăn lau tiện lợi cho người tham gia tập luyện.
                </p>
              </div>

              <div className="advantage-card">
                <div className="advantage-icon">
                  <Clock3 size={18} />
                </div>
                <h3>Đặt sân 100% trực tuyến</h3>
                <p>
                  Hệ thống cập nhật thời gian thực, đặt lịch nhanh gọn trong 30
                  giây, cam kết không bị trùng giờ, đảm bảo quyền lợi tối ưu.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* GALLERY */}
        <section className="gallery-section">
          <div className="about-container">
            <div className="section-heading">
              <h2>Thư viện hình ảnh thực tế</h2>
              <p>
                Bầu không khí sôi động và sắc nét từ những trận cầu rực lửa trên
                hệ thống sân bóng của chúng tôi.
              </p>
            </div>

            <div className="gallery-grid">
              <img src={gallery1} alt="Cỏ sân bóng" />
              <img src={gallery2} alt="Khung thành sân bóng" />
              <img src={gallery3} alt="Toàn cảnh sân bóng" />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="about-cta">
          <div className="about-container about-cta-content">
            <h2>Sẵn sàng cho trận cầu đỉnh cao?</h2>

            <p>
              Đặt sân nhanh chóng ngay hôm nay để nhận được những khung giờ vàng
              đẹp nhất và tận hưởng dịch vụ thể thao hàng đầu.
            </p>

            <div className="cta-actions">

              <a href="/fields" className="cta-primary">
                Đặt sân ngay
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

export default About;