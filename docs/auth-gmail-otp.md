# Gmail OTP: đăng ký CUSTOMER và khôi phục mật khẩu

**Cập nhật sửa lỗi transaction:** đã tái hiện lỗi nested transaction do BEGIN thủ
công với ODBC và sửa service. **255 unit tests + 11 SQL Server integration tests
đã qua**, frontend build qua. Xem [bằng chứng, file thay đổi và nghiệm thu](otp-transaction-fix.md).
Các kết quả mock-only bên dưới là mốc bàn giao ban đầu; integration mới chạy trên
database dùng một lần tại localhost, không phải FootballBookingDB/production.

Thực hiện cục bộ trên `feature/auth-gmail-otp`. Không commit, push, PR, merge,
deploy hoặc apply migration lên database thật trong lần bàn giao này.

## Thay đổi

- `backend/services/auth_service.py`: tách validation; đăng ký bắt đầu trạng thái chờ.
- `backend/services/otp_service.py`: pending registration, HMAC OTP, SQL rate limits,
  reset grants và transaction/locking.
- `backend/services/gmail_service.py`: Gmail API, OAuth refresh, MIME UTF-8, lazy config.
- `backend/routes/auth.py`: bảy endpoint bên dưới; login/me giữ nguyên.
- `backend/migrations/014_auth_email_otp.sql`: bảng và index; không tự chạy.
- `backend/scripts/cleanup_email_otp.sql`: cleanup theo batch, chạy thủ công/lịch riêng.
- `backend/requirements.txt`, `backend/.dockerignore`, `.gitignore`, `.env.example`:
  dependencies và cấu hình mẫu, loại trừ credential.
- `frontend/src/pages/AuthOtp/`: trang quên mật khẩu, OTP và đặt lại mật khẩu.
- `frontend/src/services/otp_context.js`: context chỉ trong bộ nhớ.
- `frontend/src/services/auth_service.js`, `frontend/src/pages/Register/Register.jsx`,
  `frontend/src/routes/AppRoutes.jsx`: nối các luồng mới.
- `backend/swagger.yaml`, `tests/api/test_auth_email_otp.py`,
  `tests/api/test_registration_password.py`: contract và regression tests.

Các thay đổi có sẵn ở admin, `docs/uc10-evidence/browser-checks.json`, `backend/.env`
và `artifacts/` không thuộc tính năng này và được giữ nguyên.

## Contract

Tất cả request là JSON, không cần JWT. Response thành công có `success:true`.
Response lỗi có `success:false,message`; không chứa exception hoặc dữ liệu nhạy cảm.

| POST `/api/auth/…` | Request | Thành công |
|---|---|---|
| `register` | `{fullName,username,email,phone,password}` | 202 `{challengeId,expiresIn:300,resendAfter:60,message}` |
| `register/verify-otp` | `{challengeId,otp}` | 201 `{user:{userId,role:"CUSTOMER"},message}` |
| `register/resend-otp` | `{challengeId}` | 202 challenge mới như trên |
| `forgot-password` | `{email}` | 202 challenge và thông điệp chung |
| `forgot-password/verify-otp` | `{challengeId,otp}` | 200 `{resetGrant,expiresIn:600}` |
| `forgot-password/resend-otp` | `{challengeId}` | 202 challenge mới và thông điệp chung |
| `reset-password` | `{resetGrant,newPassword}` | 200 `{message}` |

Ví dụ đăng ký: `{"fullName":"Nguyen Van A","username":"nguyenvana",
"email":"a@example.com","phone":"0901234567","password":"ExamplePass1!"}`.
Response: `{"success":true,"challengeId":"<uuid>","expiresIn":300,
"resendAfter":60,"message":"Mã xác minh đã được gửi đến email của bạn."}`.
Verify: `{"challengeId":"<uuid>","otp":"<6 chữ số từ email>"}`.
Reset: `{"resetGrant":"<grant từ bước verify>","newPassword":"AnotherPass1!"}`.

400: validation, OTP/grant sai, hết hạn hoặc đã dùng; 409: trùng tài khoản;
429: cooldown/rate limit (`Retry-After:60` là thời gian chờ tối thiểu, cửa sổ giờ có thể lâu hơn);
503: lỗi cấu hình, Gmail hoặc SQL. Không có chế độ bypass.
Response OTP thành công và lỗi dự kiến có `Cache-Control:no-store`.

## Quy tắc và dữ liệu

OTP tạo bằng `secrets`, 6 chữ số, TTL 5 phút, tối đa 5 lần đoán sai kể cả sai định dạng.
HMAC-SHA256 gắn với challenge UUID và secret độc lập. Resend tạo UUID/mã mới,
consume challenge cũ. Pending chứa bcrypt hash và hết hạn sau 30 phút; user chỉ
được INSERT CUSTOMER/ACTIVE sau verify. Email được trim/lowercase.

Rate limit bền vững trong SQL: ít nhất 60 giây giữa các yêu cầu cùng email;
tối đa 10 yêu cầu có cùng email **hoặc** IP trong một giờ. IP lưu bằng HMAC.
Dùng `request.remote_addr`, không tin `X-Forwarded-For` từ client. Sau reverse proxy,
IP có thể là IP proxy và hạn mức sẽ dùng chung; cấu hình trusted proxy cần được
đánh giá trước production, không tự mở tin cậy header trong thay đổi này.
Kiểm tra trùng và gửi bị từ chối không kích hoạt user. Lỗi gửi ghi nhận lần thử,
consume challenge lỗi; không tự retry gửi để tránh email trùng.

Reset grant ngẫu nhiên 256 bit, chỉ lưu HMAC, TTL 10 phút, dùng một lần.
Đổi mật khẩu consume mọi grant và OTP reset trước đó của user. Mật khẩu tuân
chính sách cũ: >=8 ký tự, hoa/thường ASCII, số hoặc ký hiệu, <=72 byte UTF-8.

**Chính sách JWT:** giữ cơ chế hiện có. JWT đã phát hành tiếp tục có hiệu lực
đến `exp` kể cả sau reset; không có thu hồi tức thì. Mặc định service là 60 phút,
nhưng `JWT_EXPIRES_MINUTES` có thể ghi đè. Không thay đổi login, roles hoặc dữ liệu cũ.
Nếu cần thu hồi ngay, phải bổ sung token version/revocation trên mọi endpoint trong
một thay đổi riêng có kiểm thử đầy đủ.

Forgot-password trả cùng thông điệp, cùng schema và UUID ngẫu nhiên cho email tồn
tại/không tồn tại. Challenge giả không gửi email và không thể cấp grant. Lỗi cấu hình
được kiểm tra trước lookup ở cả hai trường hợp. Khi Gmail thật từ chối gửi, endpoint
trả 503 thay vì báo đã gửi giả; sự khác biệt thời gian và lỗi nhà cung cấp vẫn là
giới hạn chống dò tài khoản của cách gửi đồng bộ này. Cần đánh giá trước production.

## Migration: chỉ hướng dẫn, chưa apply

Repo chỉ có migration 001 xác nhận unique username; không chứa schema gốc đầy đủ
của Users. Chưa xác nhận metadata database thật. Script 014 giả định UserID là int,
Users có FullName/Username/Email/Phone/PasswordHash/Role/Status như service hiện tại.
Không sửa giá trị Status/Role hoặc tài khoản cũ. Nếu email/phone gốc là kiểu không
index được hoặc dài quá giới hạn index SQL Server, phải điều chỉnh migration sau
khi kiểm tra schema trên bản sao, không chạy mù lên production.

Sau khi có phê duyệt, DBA cần:

1. Backup full database ra đường dẫn server được duyệt, bật CHECKSUM; dùng
   `RESTORE VERIFYONLY` và kiểm tra restore vào database thử độc lập.
2. Kiểm tra `sys.columns`, `sys.indexes`, `sys.index_columns`, `sys.check_constraints`
   của `dbo.Users`. Đối chiếu kiểu/độ dài, nullability, UNIQUE và CHECK Status/Role.
3. Kiểm tra trùng `LOWER(LTRIM(RTRIM(Email)))`, Phone và Username. Giải quyết thủ công
   theo quyết định nghiệp vụ; script không gộp/xóa tài khoản.
4. Apply 001 nếu thiếu Username, rồi apply 014 vào **bản sao thử nghiệm** bằng SSMS
   hoặc `sqlcmd -b -S <test-server> -d <test-database> -i backend/migrations/014_auth_email_otp.sql`.
   Dùng xác thực an toàn, không truyền mật khẩu trên command line.
5. Chạy lại 014 để kiểm tra idempotence; thử hai connection đăng ký trùng và verify
   đồng thời. Chỉ lên lịch apply production sau review và phê duyệt riêng.

014 thêm normalized email computed column/index và unique phone index để bảo vệ
cả writer ngoài service. Có kiểm tra dữ liệu trùng trước khi tạo. Các thao tác OTP
dùng transaction-owned `sp_getapplock` chung và UPDLOCK/HOLDLOCK; unique indexes là
lớp bảo vệ cuối. Quyền runtime cần SELECT/INSERT/UPDATE trên bảng liên quan và dùng
application lock. Lock chung được giữ trong lúc gửi Gmail, đơn giản hóa thứ tự khóa
nhưng giới hạn throughput; gửi/refresh có timeout, SQL lock timeout 15 giây. Gmail
và SQL không thể commit nguyên tử: email có thể đến nhưng DB commit lỗi; khi đó
API báo lỗi và code không dùng được. Người dùng cần yêu cầu lại.

Rollback code sau migration không tự xóa bảng. Không rollback về code đăng ký cũ
trong production mà chưa đánh giá việc bỏ xác minh email. Nếu phải gỡ migration,
backup các bảng OTP trước, xem dependencies rồi DBA mới quyết định DROP.
Cleanup script xóa tối đa 5000 hàng mỗi bảng mỗi lần, giữ thêm một ngày; chạy lặp
theo lịch thủ công/SQL Agent được duyệt. Không cần worker và không chạy lúc Flask khởi động.

## Gmail / Docker / VPS: chỉ chuẩn bị

Sao chép tên biến từ `.env.example` vào cấu hình an toàn ngoài Git:

- `GMAIL_SENDER_EMAIL`: tài khoản gửi đã được cấp OAuth gmail.send.
- `OTP_HASH_SECRET`: secret ngẫu nhiên độc lập >=32 byte; mọi worker dùng cùng giá trị.
  Thay secret làm OTP/grant và IP counters cũ mất hiệu lực.
- Chọn `GOOGLE_GMAIL_TOKEN_JSON` (JSON authorized-user một dòng) **hoặc**
  `GOOGLE_GMAIL_TOKEN_FILE` (đường dẫn trong container). JSON chứa client_id,
  client_secret, refresh_token và scopes chỉ gồm gmail.send. Không cần commit token.

Compose hiện tại tiếp tục đọc `.env` root, port 5000, CORS, health/ready không thay đổi.
Nếu chọn file, ví dụ override **ngoài repository**, chỉ áp dụng sau phê duyệt:

```yaml
services:
  backend:
    volumes:
      - /secure/path/gmail_token.json:/run/secrets/gmail_token.json:ro
    environment:
      GOOGLE_GMAIL_TOKEN_FILE: /run/secrets/gmail_token.json
```

File quyền đọc tối thiểu cho container; không đặt trong Docker build context.
JSON env phải được quote/escape theo dotenv, không in `docker compose config`
đầy đủ ra log; dùng `config --quiet`. Không cần ghi token refresh ngược vào file
read-only, service refresh trong bộ nhớ. Thiếu config chỉ lỗi endpoint OTP, app vẫn khởi động.

Google OAuth External/Testing có thể cấp refresh token hết hạn sau 7 ngày với
scope gmail.send: [Google OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).
Trước production, chủ dự án cần xử lý publishing/verification và domain theo yêu
cầu Google; không tự chuyển trạng thái trong nhiệm vụ này.
Tham chiếu [Gmail gửi MIME](https://developers.google.com/workspace/gmail/api/guides/sending)
và [xử lý lỗi Gmail](https://developers.google.com/workspace/gmail/api/guides/handle-errors).

## Kiểm thử và nghiệm thu

Đã chạy mock tests, không email thật và không kết nối DB production. Kết quả chi
tiết tại phần bàn giao trong hội thoại. Test SQL dùng mock cursor/connection: kiểm
tra query, hash, commit/rollback, rate/cooldown, reuse/expiry và provider errors;
**không chứng minh** hành vi khóa, migration, constraint hoặc concurrency trên SQL
Server. Cần nghiệm thu integration trên DB thử sau khi có schema và môi trường.

Kết quả cục bộ: 24 tests OTP/Gmail, 2 tests password và 2 tests health/ready đều
qua (28 tests). Có các luồng xuyên API register→verify→login và forgot→verify→reset→login,
nhưng SQL/Gmail vẫn mock. Frontend build qua; lint riêng các file thay đổi qua.
Lint toàn frontend có 13 lỗi ở các file ngoài phạm vi. `docker compose config --quiet`
qua; không build Docker vì daemon chưa chạy. Python venv hiện là 3.14, chưa chạy
trực tiếp Python 3.12 trong Docker. Chưa kiểm thử bằng trình duyệt trong môi trường này.
Swagger parse được và bảy endpoint auth mới có đủ contract. Kiểm tra YAML nghiêm
ngặt phát hiện key `get` trùng có sẵn trong phần booking của HEAD; thay đổi OTP
không thêm key trùng. Không sửa phần booking ngoài phạm vi này.

```powershell
backend/venv/Scripts/python.exe -m unittest discover -s tests/api -p test_auth_email_otp.py -v
backend/venv/Scripts/python.exe -m unittest discover -s tests/api -p test_registration_password.py -v
backend/venv/Scripts/python.exe -m unittest discover -s tests -p test_staging_health.py -v
cd frontend
npm.cmd run build
npm.cmd run lint
```

- [ ] Restore DB thử, đối chiếu constraints và apply/rerun 014.
- [ ] Đăng ký → email thật ở môi trường thử → verify → login; không có Users trước verify.
- [ ] Quên mật khẩu → verify → reset → mật khẩu mới login được, mật khẩu cũ bị từ chối.
- [ ] Hai connection verify đồng thời; username/email/phone trùng; rollback lỗi SQL thật.
- [ ] Sai 5 lần, expiry, resend/cooldown, OTP/grant dùng lại, Gmail mất quyền/hết token.
- [ ] Browser desktop/mobile, double submit, reload giữa các bước, lỗi mạng, mất context.
- [ ] Review JWT còn hiệu lực, proxy IP và giới hạn chống enumeration trước production.
- [ ] Tách thay đổi admin có sẵn và review secret trước commit được duyệt.

Repo đã track `backend/.env` và `frontend/.env` từ trước, dù `.gitignore` có rule.
Không đọc/in giá trị hoặc tự bỏ track/rotate trong nhiệm vụ này. Vì vậy không thể
chứng nhận toàn bộ Git sạch credential; cần audit/rotate riêng nếu từng chứa secret.
Các file tính năng mới không chứa credential thật; không có debug OTP endpoint.

Xem diff: `git diff --check`, `git diff --stat`, `git diff -- backend/routes/auth.py
backend/services/auth_service.py frontend/src/pages/Register/Register.jsx`.
File mới chưa tracked cần mở trực tiếp hoặc dùng `git diff --no-index -- /dev/null <file>`
trên shell hỗ trợ `/dev/null`; `git diff` thông thường không hiển thị file untracked.
Không `git add`, commit, push hoặc deploy cho đến khi được yêu cầu.
