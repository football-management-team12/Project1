import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../../components/AuthLayout/AuthLayout";
import field from "../../assets/images/football-field.jpg";
import { otpRequest } from "../../services/auth_service";
import { clearOtpFlow, getOtpFlow, setOtpFlow } from "../../services/otp_context";
import "../Register/Register.css";
import "./AuthOtp.css";

export default function AuthOtp({ mode }) {
  const navigate = useNavigate();
  const [flow, setFlow] = useState(getOtpFlow);
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const verify = mode === "verify";
  const reset = mode === "reset";
  const valid = (!verify && !reset) || (verify && flow?.challengeId && !flow?.resetGrant)
    || (reset && flow?.resetGrant && flow.grantExpiresAt > clock);
  const wait = Math.max(0, Math.ceil(((flow?.sentAt || 0) + 60000 - clock) / 1000));
  const expiry = Math.max(0, Math.ceil(((flow?.sentAt || 0) + 300000 - clock) / 1000));

  const run = async (action) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try { await action(); } catch (error) { setMessage(error.message); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const submit = (event) => {
    event.preventDefault();
    run(async () => {
      if (verify) {
        if (!/^[0-9]{6}$/.test(value)) throw new Error("Vui lòng nhập mã gồm 6 chữ số.");
        const result = await otpRequest(`${flow.purpose}/verify-otp`, { challengeId: flow.challengeId, otp: value });
        setValue("");
        if (flow.purpose === "register") {
          clearOtpFlow();
          navigate("/login", { replace: true, state: { message: result.message } });
        } else {
          setOtpFlow({ purpose: "forgot-password", resetGrant: result.resetGrant, grantExpiresAt: Date.now() + result.expiresIn * 1000 });
          navigate("/reset-password", { replace: true });
        }
      } else if (reset) {
        if ([...value].length < 8 || new TextEncoder().encode(value).length > 72
          || !/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]|[^\p{L}\p{N}_\s]/u.test(value)) {
          throw new Error("Mật khẩu cần 8+ ký tự, chữ hoa, chữ thường và số/ký hiệu; tối đa 72 byte UTF-8.");
        }
        if (value !== confirm) throw new Error("Mật khẩu xác nhận không khớp.");
        const result = await otpRequest("reset-password", { resetGrant: flow.resetGrant, newPassword: value });
        clearOtpFlow();
        setValue(""); setConfirm("");
        navigate("/login", { replace: true, state: { message: result.message } });
      } else {
        const result = await otpRequest("forgot-password", { email: value.trim() });
        setOtpFlow({ ...result, purpose: "forgot-password", sentAt: Date.now() });
        navigate("/forgot-password/verify-otp");
      }
    });
  };

  const resend = () => run(async () => {
    if (wait) return;
    const result = await otpRequest(`${flow.purpose}/resend-otp`, { challengeId: flow.challengeId });
    const next = { ...result, purpose: flow.purpose, sentAt: Date.now() };
    setOtpFlow(next); setFlow(next); setClock(Date.now()); setValue("");
    setMessage(result.message);
  });

  return <AuthLayout image={field} description="Xác minh email để bảo vệ tài khoản Sân Bóng của bạn.">
    <div className="register-card otp-card">
      <h2>{verify ? "Xác minh email" : reset ? "Đặt lại mật khẩu" : "Quên mật khẩu"}</h2>
      {!valid ? <><p role="alert">Phiên xác minh đã hết hạn hoặc bị đóng khi tải lại trang. Vui lòng bắt đầu lại.</p>
        <Link to="/register">Đăng ký</Link> · <Link to="/forgot-password">Khôi phục mật khẩu</Link></> : <>
        <p className="register-subtitle">{verify ? (flow.purpose === "register" ? "Nhập mã được gửi đến email đăng ký của bạn." : "Nếu email thuộc tài khoản đang hoạt động, mã xác minh sẽ được gửi.")
          : reset ? "Nhập mật khẩu mới và xác nhận để hoàn tất." : "Nhập email của tài khoản cần khôi phục."}</p>
        <form onSubmit={submit}>
          <div className="register-form-group">
            <label htmlFor="otp-value">{verify ? "Mã OTP" : reset ? "Mật khẩu mới" : "Email"}</label>
            <div className="register-input-wrapper">
              <input id="otp-value" type={verify ? "text" : reset ? "password" : "email"}
                inputMode={verify ? "numeric" : undefined} autoComplete={verify ? "one-time-code" : reset ? "new-password" : "email"}
                maxLength={verify ? 6 : undefined} pattern={verify ? "[0-9]{6}" : undefined}
                value={value} onChange={(e) => setValue(verify ? e.target.value.replace(/[^0-9]/g, "") : e.target.value)} required disabled={busy} />
            </div>
          </div>
          {reset && <div className="register-form-group"><label htmlFor="otp-confirm">Xác nhận mật khẩu</label>
            <div className="register-input-wrapper"><input id="otp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={busy} /></div></div>}
          {verify && <p>{expiry ? `Mã hết hạn sau ${Math.floor(expiry / 60)}:${String(expiry % 60).padStart(2, "0")}` : "Mã đã hết hạn. Vui lòng gửi lại."}</p>}
          {message && <p role="status" className="server-message">{message}</p>}
          <button className="register-submit-button" disabled={busy || (verify && !expiry)}>{busy ? "Đang xử lý…" : verify ? "Xác minh" : reset ? "Đổi mật khẩu" : "Gửi mã xác minh"}</button>
          {verify && <button className="otp-resend" type="button" onClick={resend} disabled={busy || wait > 0}>{wait ? `Gửi lại sau ${wait}s` : "Gửi lại mã"}</button>}
        </form>
      </>}
      <p className="register-login-link"><Link to="/login">Về đăng nhập</Link></p>
    </div>
  </AuthLayout>;
}
