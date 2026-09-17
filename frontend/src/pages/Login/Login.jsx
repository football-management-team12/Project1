import { useState } from "react";
import { Link } from "react-router-dom";
import {
  UserRound,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowLeft,
} from "lucide-react";

import AuthLayout from "../../components/AuthLayout/AuthLayout";
import loginField from "../../assets/images/football-field.jpg";

import "./Login.css";

function Login() {
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    account: "",
    password: "",
    remember: true,
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

    if (!formData.account.trim()) {
      newErrors.account =
        "Vui lòng nhập tài khoản hoặc số điện thoại.";
    }

    if (!formData.password.trim()) {
      newErrors.password =
        "Vui lòng nhập mật khẩu.";
    } else if (formData.password.length < 6) {
      newErrors.password =
        "Mật khẩu phải có ít nhất 6 ký tự.";
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
      console.log("Login data:", formData);

      /*
        Sau này khi Backend hoàn thành:

        const response = await authService.login({
          account: formData.account,
          password: formData.password,
        });

        console.log(response);
      */

      setServerMessage(
        "Dữ liệu hợp lệ. Sẵn sàng gửi tới Backend."
      );
    } catch (error) {
      setServerMessage(
        error.message || "Đăng nhập thất bại."
      );
    }
  };

  return (
    <AuthLayout
      image={loginField}
      description="Gia nhập cộng đồng Sân Bóng ngay hôm nay để nhận thông báo ưu đãi, đặt sân theo nhóm, tìm kiếm sân trống gần nhất và quản lý lịch trình thi đấu cá nhân tiện lợi."
    >
      <div className="login-card">
        <div className="login-icon">
          <UserRound size={36} />
        </div>

        <h2>Đăng nhập</h2>

        <p className="login-subtitle">
          Chào mừng bạn quay trở lại với Sân Bóng
        </p>

        <form
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="login-form-group">
            <label htmlFor="account">
              Tài khoản hoặc Số điện thoại
            </label>

            <div
              className={`login-input-wrapper ${
                errors.account ? "input-error" : ""
              }`}
            >
              <UserRound size={23} />

              <input
                id="account"
                name="account"
                type="text"
                placeholder="Nhập tài khoản của bạn"
                value={formData.account}
                onChange={handleChange}
              />
            </div>

            {errors.account && (
              <p className="form-error">
                {errors.account}
              </p>
            )}
          </div>

          <div className="login-form-group">
            <label htmlFor="password">
              Mật khẩu
            </label>

            <div
              className={`login-input-wrapper ${
                errors.password ? "input-error" : ""
              }`}
            >
              <LockKeyhole size={21} />

              <input
                id="password"
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
                className="password-toggle"
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

          <div className="login-options">
            <label className="remember-login">
              <input
                type="checkbox"
                name="remember"
                checked={formData.remember}
                onChange={handleChange}
              />

              <span>Ghi nhớ đăng nhập</span>
            </label>

            <Link
              to="/forgot-password"
              className="forgot-password"
            >
              Quên mật khẩu?
            </Link>
          </div>

          {serverMessage && (
            <p className="server-message">
              {serverMessage}
            </p>
          )}

          <button
            type="submit"
            className="login-submit-button"
          >
            Đăng nhập
          </button>
        </form>

        <p className="login-register">
          Chưa có tài khoản?{" "}
          <Link to="/register">
            Đăng ký ngay
          </Link>
        </p>

        <Link
          to="/"
          className="login-back-home"
        >
          <ArrowLeft size={18} />
          Về trang chủ
        </Link>
      </div>
    </AuthLayout>
  );
}

export default Login;