"""Lazy Gmail configuration: health checks never depend on Google credentials."""
import base64
import json
import os
from email.message import EmailMessage

from services.auth_service import AuthenticationError

SCOPE = "https://www.googleapis.com/auth/gmail.send"


def configuration():
    try:
        sender = os.environ["GMAIL_SENDER_EMAIL"].strip()
        raw = os.getenv("GOOGLE_GMAIL_TOKEN_JSON")
        if raw:
            info = json.loads(raw)
        else:
            with open(os.environ["GOOGLE_GMAIL_TOKEN_FILE"], encoding="utf-8") as stream:
                info = json.load(stream)
        if not sender or not all(info.get(k) for k in ("refresh_token", "client_id", "client_secret")):
            raise ValueError()
        if set(info.get("scopes", [SCOPE])) != {SCOPE}:
            raise ValueError()
        return sender, info
    except Exception:
        raise AuthenticationError("Dịch vụ email chưa được cấu hình.", 503) from None


def send_otp(email, otp, purpose):
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        import httplib2
        import google_auth_httplib2

        sender, info = configuration()
        credentials = Credentials.from_authorized_user_info(info, scopes=[SCOPE])
        # Refresh is bounded independently from the send HTTP transport.
        refresh_request = Request()
        credentials.refresh(lambda *args, **kwargs: refresh_request(*args, **{**kwargs, "timeout": 10}))
        transport = google_auth_httplib2.AuthorizedHttp(credentials, http=httplib2.Http(timeout=15))
        message = EmailMessage()
        label = "đăng ký tài khoản" if purpose == "REGISTER" else "khôi phục mật khẩu"
        message["From"] = sender
        message["To"] = email
        message["Subject"] = f"Mã xác minh {label} Sân Bóng"
        message.set_content(f"Mã OTP {label} của bạn là: {otp}\n"
                            "Mã có hiệu lực 5 phút và chỉ được dùng một lần.\n"
                            "Không chia sẻ mã này. Nếu bạn không yêu cầu, hãy bỏ qua email này.", charset="utf-8")
        service = build("gmail", "v1", http=transport, cache_discovery=False)
        try:
            result = service.users().messages().send(
                userId="me", body={"raw": base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")}
            ).execute(num_retries=0)
            if not result.get("id"):
                raise ValueError("Missing Gmail message id")
        finally:
            service.close()
    except Exception:
        # Google exceptions may contain credentials or the MIME body. Never log them.
        raise AuthenticationError("Không thể gửi mã xác minh. Vui lòng thử lại sau.", 503) from None
