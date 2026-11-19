# UC01 registration handoff for T123-116

Run the migration `001_users_username.sql` before starting the API. Execute these cases only in the team's isolated test database. Use a unique suffix for the test identity and verify the phone is unused before submitting; do not reuse a real person's phone number.

## Main valid case

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "fullName": "UC01 Test Customer",
  "username": "uc01t123116<unique>",
  "email": "uc01t123116_<unique>@example.org",
  "phone": "<unused 10-digit test phone beginning with 0>",
  "password": "T123116!Test"
}
```

Expected: HTTP `201`, `success: true`, message `Đăng ký thành công`, and user fields `userId`, `username`, `email`, `role: CUSTOMER`.

## Negative cases

| Case | Request change | Expected |
|---|---|---|
| Missing field | Omit `fullName` | HTTP 400, `Vui lòng nhập đầy đủ thông tin hợp lệ` |
| Invalid username | Set `username` to `abc` | HTTP 400, validation message |
| Invalid email | Set `email` to `not-an-email` | HTTP 400, `Email không đúng định dạng` |
| Invalid phone | Set `phone` to `123` | HTTP 400, phone validation message |
| Short password | Set `password` to `short` | HTTP 400, password validation message |
| Duplicate | Resubmit the successful identity | HTTP 409, `Username/Email/Phone đã tồn tại` |

For database checks, bind the exact username/email/phone from the test request:

```sql
SELECT UserID, FullName, Username, Email, Phone, Role, Status,
       CASE WHEN PasswordHash LIKE '$2%' THEN 'HASHED' ELSE 'NOT_HASHED' END AS PasswordCheck
FROM dbo.Users
WHERE Username = @username OR Email = @email OR Phone = @phone;
```

Expected after first success: exactly one row, role `CUSTOMER`, status `ACTIVE`, `PasswordCheck = HASHED`. Expected after duplicate attempt: still exactly one row. Capture the HTTP request/response and this query result as T123-116 evidence.
