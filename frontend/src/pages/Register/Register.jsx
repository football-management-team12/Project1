import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserRound, Mail, Phone, LockKeyhole, Eye, EyeOff, ArrowLeft } from "lucide-react";
import AuthLayout from "../../components/AuthLayout/AuthLayout";
import registerField from "../../assets/images/football-field.jpg";
import { registerUser } from "../../services/auth_service";
import "./Register.css";

function Register() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ fullName: "", username: "", email: "", phone: "", password: "" });
  const [errors, setErrors] = useState({});
  const [serverMessage, setServerMessage] = useState("");

  const handleChange = ({ target: { name, value } }) => {
    setFormData((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
    setServerMessage("");
  };

  const validateForm = () => {
    const next = {};
    if (!formData.fullName.trim()) next.fullName = "Vui lòng nhập họ và tên.";
    else if (formData.fullName.trim().length > 100) next.fullName = "Họ và tên không được vượt quá 100 ký tự.";
    if (!/^[A-Za-z0-9_]{4,30}$/.test(formData.username.trim())) next.username = "Tên đăng nhập phải gồm 4-30 ký tự chữ, số hoặc dấu gạch dưới.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) next.email = "Email không đúng định dạng.";
    if (!/^0\d{9}$/.test(formData.phone.trim())) next.phone = "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.";
    if ([...formData.password].length < 8 || new TextEncoder().encode(formData.password).length > 72) {
      next.password = "Mật khẩu phải có ít nhất 8 ký tự và không vượt quá 72 byte UTF-8.";
    } else if (!/[A-Z]/.test(formData.password) || !/[a-z]/.test(formData.password) || !/[0-9]|[^\p{L}\p{N}_\s]/u.test(formData.password)) {
      next.password = "Mật khẩu phải có chữ hoa, chữ thường và số hoặc ký tự đặc biệt.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setServerMessage("");
    if (!validateForm()) return;
    setLoading(true);
    try {
      const result = await registerUser({
        fullName: formData.fullName.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        password: formData.password,
      });
      navigate("/login", { state: { message: result.message } });
    } catch (error) {
      setServerMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { name: "fullName", label: "Họ và tên", icon: UserRound, type: "text", placeholder: "Nguyễn Văn A" },
    { name: "username", label: "Tên đăng nhập", icon: UserRound, type: "text", placeholder: "nguyenvana" },
    { name: "email", label: "Email", icon: Mail, type: "email", placeholder: "example@gmail.com" },
    { name: "phone", label: "Số điện thoại", icon: Phone, type: "tel", placeholder: "0901234567" },
  ];

  return (
    <AuthLayout image={registerField} description="Trở thành thành viên để tận hưởng mọi đặc quyền dành riêng cho thành viên Sân Bóng.">
      <div className="register-card">
        <div className="register-icon"><UserRound size={36} /></div>
        <h2>Đăng ký</h2>
        <p className="register-subtitle">Đăng ký ngay tài khoản Sân Bóng mới</p>
        <form onSubmit={handleSubmit} noValidate>
          {fields.map(({ name, label, icon: Icon, type, placeholder }) => (
            <div className="register-form-group" key={name}>
              <label htmlFor={name}>{label}</label>
              <div className={`register-input-wrapper ${errors[name] ? "input-error" : ""}`}>
                <Icon size={20} />
                <input id={name} name={name} type={type} placeholder={placeholder} value={formData[name]} onChange={handleChange} autoComplete={name === "fullName" ? "name" : name === "username" ? "username" : name} />
              </div>
              {errors[name] && <p className="form-error">{errors[name]}</p>}
            </div>
          ))}
          <div className="register-form-group">
            <label htmlFor="register-password">Mật khẩu</label>
            <div className={`register-input-wrapper ${errors.password ? "input-error" : ""}`}>
              <LockKeyhole size={21} />
              <input id="register-password" name="password" type={showPassword ? "text" : "password"} placeholder="Tối thiểu 8 ký tự" value={formData.password} onChange={handleChange} autoComplete="new-password" />
              <button type="button" className="register-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{showPassword ? <Eye size={19} /> : <EyeOff size={19} />}</button>
            </div>
            <p>Ít nhất 8 ký tự, có chữ hoa, chữ thường và số hoặc ký tự đặc biệt.</p>
            {errors.password && <p className="form-error">{errors.password}</p>}
          </div>
          {serverMessage && <p className="server-message" role="alert">{serverMessage}</p>}
          <button type="submit" className="register-submit-button" disabled={loading}>{loading ? "Đang đăng ký…" : "Đăng ký tài khoản"}</button>
        </form>
        <p className="register-login-link">Đã có tài khoản? <Link to="/login">Đăng nhập ngay</Link></p>
        <Link to="/" className="register-back-home"><ArrowLeft size={18} /> Về trang chủ</Link>
      </div>
    </AuthLayout>
  );
}

export default Register;
