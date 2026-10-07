import axios from "axios";
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
      setLoading(true);

      const apiUrl = (
        import.meta.env.VITE_API_URL ||
        "http://127.0.0.1:5000"
      ).replace(/\/$/, "");

      const response =
        await axios.post(
          `${apiUrl}/api/auth/login`,
          {
            account:
              formData.account.trim(),

            password:
              formData.password,
          }
        );


      // =====================================================
      // LOGIN FAILED
      // =====================================================

      if (!response.data?.success) {
        setServerMessage(
          response.data?.message ||
          "Sai tài khoản hoặc mật khẩu."
        );

        return;
      }


      const user =
        response.data.user;


      if (!user?.UserID) {
        setServerMessage(
          "Không nhận được thông tin người dùng."
        );

        return;
      }


      // =====================================================
      // SAVE USER
      // =====================================================

      localStorage.setItem(
        "user",
        JSON.stringify(user)
      );


      window.dispatchEvent(
        new Event("auth-changed")
      );


      setServerMessage(
        "Đăng nhập thành công."
      );


      // =====================================================
      // ROLE
      // =====================================================

      const role =
        String(user.Role || "")
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


      /*
        CUSTOMER không được lợi dụng:
        /login?redirect=/admin

        để đi vào admin.
      */

      const redirectIsAdmin =
        safeRedirect === "/admin" ||
        safeRedirect?.startsWith(
          "/admin/"
        );


      if (
        safeRedirect &&
        !(
          redirectIsAdmin &&
          role !== "ADMIN"
        )
      ) {
        navigate(
          safeRedirect,
          {
            replace: true,
          }
        );

        return;
      }


      // =====================================================
      // DEFAULT REDIRECT BY ROLE
      // =====================================================

      if (role === "ADMIN") {
        navigate(
          "/admin",
          {
            replace: true,
          }
        );

        return;
      }


      /*
        CUSTOMER hoặc user thông thường
        không được tự động vào Admin.
      */

      navigate(
        "/fields",
        {
          replace: true,
        }
      );

    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );


      if (
        error.response?.status === 401
      ) {
        setServerMessage(
          error.response?.data?.message ||
          "Sai tài khoản hoặc mật khẩu."
        );

      } else if (
        error.response?.data?.message
      ) {
        setServerMessage(
          error.response.data.message
        );

      } else {
        setServerMessage(
          "Không thể kết nối tới máy chủ."
        );
      }

    } finally {
      setLoading(false);
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
              Tài khoản hoặc Số điện thoại
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
            <p className="server-message">
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