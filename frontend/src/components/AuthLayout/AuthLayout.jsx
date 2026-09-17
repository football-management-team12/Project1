import Navbar from "../Navbar/Navbar";
import "./AuthLayout.css";

function AuthLayout({
  children,
  description,
  image,
}) {
  return (
    <div className="auth-page">
      <Navbar />

      <main className="auth-main">
        <section className="auth-banner">
          <div className="auth-banner-content">
            <h1>
              Đặt sân bóng dễ dàng
              <br />
              Trải nghiệm tuyệt vời
            </h1>

            <p>{description}</p>

            <img
              src={image}
              alt="Sân bóng"
              className="auth-field-image"
            />
          </div>
        </section>

        <section className="auth-form-section">
          {children}
        </section>
      </main>
    </div>
  );
}

export default AuthLayout;