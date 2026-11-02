import { useState } from "react";

import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  UserRound,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowLeft,
} from "lucide-react";

import AuthLayout from "../../components/AuthLayout/AuthLayout";
import {
  loginUser,
} from "../../services/auth_service";

import loginField from "../../assets/images/football-field.jpg";

import "./Login.css";


function Login() {
  const navigate = useNavigate();

  const [searchParams] =
    useSearchParams();

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [formData, setFormData] =
    useState({
      account: "",
      password: "",
      remember: true,
    });

  const [errors, setErrors] =
    useState({});

  const [serverMessage, setServerMessage] =
    useState("");


  // =========================================================
  // HANDLE INPUT CHANGE
  // =========================================================

  const handleChange = (event) => {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: "",
    }));

    setServerMessage("");
  };


  // =========================================================
  // VALIDATE
  // =========================================================

  const validateForm = () => {
    const newErrors = {};

    if (!formData.account.trim()) {
      newErrors.account =
        "Vui lòng nhập tài khoản hoặc số điện thoại.";
    }

    if (!formData.password.trim()) {
      newErrors.password =
        "Vui lòng nhập mật khẩu.";
    } else if (
      formData.password.length < 6
    ) {
      newErrors.password =
        "Mật khẩu phải có ít nhất 6 ký tự.";
    }

    setErrors(newErrors);

    return (
      Object.keys(newErrors).length === 0
    );
  };


  // =========================================================
  // LOGIN
  // =========================================================

  const handleSubmit = async (event) => {
  event.preventDefault();

  if (loading) {
    return;
  }


  setServerMessage("");


  if (!validateForm()) {
    return;
  }


  try {

    setLoading(
      true
    );


    const {
      user,
    } =
      await loginUser(
        formData.account.trim(),
        formData.password
      );


    if (!user?.UserID) {

      setServerMessage(
        "Không nhận được thông tin người dùng."
      );

      return;
    }


    setServerMessage(
      "Đăng nhập thành công."
    );


    // =====================================================
    // ROLE
    // =====================================================

    const role =
      String(
        user.Role || ""
      )
        .trim()
        .toUpperCase();


    // =====================================================
    // REDIRECT URL
    // =====================================================

    const redirectTo =
      searchParams.get(
        "redirect"
      );


    const safeRedirect =
      redirectTo &&
      redirectTo.startsWith("/") &&
      !redirectTo.startsWith("//")
        ? redirectTo
        : null;


    const redirectIsAdmin =
      safeRedirect ===
        "/admin" ||
      safeRedirect?.startsWith(
        "/admin/"
      );


    const canAccessAdmin =
      role === "ADMIN" ||
      role === "STAFF";


    if (
      safeRedirect &&
      !(
        redirectIsAdmin &&
        !canAccessAdmin
      )
    ) {

      navigate(
        safeRedirect,
        {
          replace:
            true,
        }
      );

      return;
    }


    // =====================================================
    // DEFAULT ROLE REDIRECT
    // =====================================================

    if (
      role === "ADMIN"
    ) {

      navigate(
        "/admin",
        {
          replace:
            true,
        }
      );

      return;
    }


    if (
      role === "STAFF"
    ) {

      navigate(
        "/admin/bookings",
        {
          replace:
            true,
        }
      );

      return;
    }


    navigate(
      "/fields",
      {
        replace:
          true,
      }
    );

  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );


    if (
      error.status === 400 ||
      error.status === 401 ||
      error.status === 403
    ) {

      setServerMessage(
        error.message ||
        "Đăng nhập thất bại."
      );

    } else {

      setServerMessage(
        error.message ||
        "Không thể kết nối tới máy chủ."
      );
    }

  } finally {

    setLoading(
      false
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


        <h2>
          Đăng nhập
        </h2>


        <p className="login-subtitle">
          Chào mừng bạn quay trở lại với Sân Bóng
        </p>


        <form
          onSubmit={handleSubmit}
          noValidate
        >

          <div className="login-form-group">

            <label htmlFor="account">
              Tên đăng nhập, email hoặc số điện thoại
            </label>


            <div
              className={`login-input-wrapper ${errors.account
                ? "input-error"
                : ""
                }`}
            >
              <UserRound size={23} />

              <input
                id="account"
                name="account"
                type="text"
                autoComplete="username"
                placeholder="Nhập tên đăng nhập, email hoặc số điện thoại"
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
              className={`login-input-wrapper ${errors.password
                ? "input-error"
                : ""
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
                autoComplete="current-password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
              />


              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword(
                    (prev) => !prev
                  )
                }
                aria-label={
                  showPassword
                    ? "Ẩn mật khẩu"
                    : "Hiện mật khẩu"
                }
              >
                {showPassword ? (
                  <Eye size={19} />
                ) : (
                  <EyeOff size={19} />
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

              <span>
                Ghi nhớ đăng nhập
              </span>

            </label>


            <Link
              to="/forgot-password"
              className="forgot-password"
            >
              Quên mật khẩu?
            </Link>

          </div>


          {serverMessage && (
            <p className="form-error server-message-center">
              {serverMessage}
            </p>
          )}


          <button
            type="submit"
            className="login-submit-button"
            disabled={loading}
          >
            {loading
              ? "Đang đăng nhập..."
              : "Đăng nhập"}
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
