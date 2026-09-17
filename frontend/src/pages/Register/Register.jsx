import { useState } from "react";
import { Link } from "react-router-dom";

import {
  UserRound,
  Mail,
  Phone,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowLeft,
} from "lucide-react";

import AuthLayout from "../../components/AuthLayout/AuthLayout";
import registerField from "../../assets/images/football-field.jpg";

import "./Register.css";

function Register() {
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    phone: "",
    password: "",
    agreeTerms: true,
  });

  const [errors, setErrors] = useState({});

  const [serverMessage, setServerMessage] = useState("");

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: "",
    }));

    setServerMessage("");
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.username.trim()) {
      newErrors.username = "Vui lòng nhập tên tài khoản.";
    } else if (formData.username.trim().length < 4) {
      newErrors.username = "Tên tài khoản phải có ít nhất 4 ký tự.";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Vui lòng nhập email.";
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    ) {
      newErrors.email = "Email không đúng định dạng.";
    }

    if (!formData.phone.trim()) {
      newErrors.phone = "Vui lòng nhập số điện thoại.";
    } else if (!/^0\d{9}$/.test(formData.phone)) {
      newErrors.phone =
        "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.";
    }

    if (!formData.password) {
      newErrors.password = "Vui lòng nhập mật khẩu.";
    } else if (formData.password.length < 6) {
      newErrors.password =
        "Mật khẩu phải có ít nhất 6 ký tự.";
    }

    if (!formData.agreeTerms) {
      newErrors.agreeTerms =
        "Bạn cần đồng ý với Điều khoản dịch vụ.";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setServerMessage("");

    const isValid = validateForm();

    if (!isValid) {
      return;
    }

    try {
      console.log("Register data:", formData);

      /*
        Sau này khi Backend hoàn thành:

        const response = await authService.register({
          username: formData.username,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
        });

        console.log(response);
      */

      setServerMessage(
        "Dữ liệu hợp lệ. Sẵn sàng gửi tới Backend."
      );
    } catch (error) {
      setServerMessage(
        error.message || "Đăng ký thất bại."
      );
    }
  };

  return (
    <AuthLayout
      image={registerField}
      description="Trở thành thành viên để được tích điểm đổi quà ra sân, tìm đồng đội ghép đội nhanh chóng và tận hưởng mọi đặc quyền dành riêng cho thành viên Sân Bóng."
    >
      <div className="register-card">
        <div className="register-icon">
          <UserRound size={36} />
        </div>

        <h2>Đăng ký</h2>

        <p className="register-subtitle">
          Đăng ký ngay tài khoản Sân Bóng mới
        </p>

        <form
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="register-form-group">
            <label htmlFor="username">
              Tài khoản
            </label>

            <div
              className={`register-input-wrapper ${
                errors.username ? "input-error" : ""
              }`}
            >
              <UserRound size={23} />

              <input
                id="username"
                name="username"
                type="text"
                placeholder="Tên đăng nhập của bạn"
                value={formData.username}
                onChange={handleChange}
              />
            </div>

            {errors.username && (
              <p className="form-error">
                {errors.username}
              </p>
            )}
          </div>

          <div className="register-form-group">
            <label htmlFor="email">
              Email
            </label>

            <div
              className={`register-input-wrapper ${
                errors.email ? "input-error" : ""
              }`}
            >
              <Mail size={20} />

              <input
                id="email"
                name="email"
                type="email"
                placeholder="example@gmail.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            {errors.email && (
              <p className="form-error">
                {errors.email}
              </p>
            )}
          </div>

          <div className="register-form-group">
            <label htmlFor="phone">
              Số điện thoại
            </label>

            <div
              className={`register-input-wrapper ${
                errors.phone ? "input-error" : ""
              }`}
            >
              <Phone size={20} />

              <input
                id="phone"
                name="phone"
                type="tel"
                placeholder="Nhập số điện thoại"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            {errors.phone && (
              <p className="form-error">
                {errors.phone}
              </p>
            )}
          </div>

          <div className="register-form-group">
            <label htmlFor="register-password">
              Mật khẩu
            </label>

            <div
              className={`register-input-wrapper ${
                errors.password ? "input-error" : ""
              }`}
            >
              <LockKeyhole size={21} />

              <input
                id="register-password"
                name="password"
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
              />

              <button
                type="button"
                className="register-password-toggle"
                onClick={() =>
                  setShowPassword(!showPassword)
                }
                aria-label={
                  showPassword
                    ? "Ẩn mật khẩu"
                    : "Hiện mật khẩu"
                }
              >
                {showPassword ? (
                  <EyeOff size={19} />
                ) : (
                  <Eye size={19} />
                )}
              </button>
            </div>

            {errors.password && (
              <p className="form-error">
                {errors.password}
              </p>
            )}
          </div>

          <label className="register-terms">
            <input
              type="checkbox"
              name="agreeTerms"
              checked={formData.agreeTerms}
              onChange={handleChange}
            />

            <span>
              Tôi đồng ý với Điều khoản dịch vụ
            </span>
          </label>

          {errors.agreeTerms && (
            <p className="form-error terms-error">
              {errors.agreeTerms}
            </p>
          )}

          {serverMessage && (
            <p className="server-message">
              {serverMessage}
            </p>
          )}

          <button
            type="submit"
            className="register-submit-button"
          >
            Đăng ký tài khoản
          </button>
        </form>

        <p className="register-login-link">
          Đã có tài khoản?{" "}
          <Link to="/login">
            Đăng nhập ngay
          </Link>
        </p>

        <Link
          to="/"
          className="register-back-home"
        >
          <ArrowLeft size={18} />
          Về trang chủ
        </Link>
      </div>
    </AuthLayout>
  );
}

export default Register;