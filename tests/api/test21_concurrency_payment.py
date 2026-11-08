from concurrent.futures import ThreadPoolExecutor
import unittest
import requests

# Cấu hình đúng cổng 5001 của backend
BASE_URL = "http://127.0.0.1:5001"

print("==========================================")
print("   TEST ĐỒNG THỜI: 2 PHIÊN ADMIN / 2 REQUEST")
print("==========================================")

# Nhập Booking ID cố định theo test case là 621 (hoặc nhập tùy ý)
try:
  BOOKING_ID = int(
      input("👉 Nhập Booking ID cần test [Mặc định 621]: ").strip()
      or 621
  )
except ValueError:
  BOOKING_ID = 621

print(
    "\n[Thông tin] Bạn có thể dùng 2 Token khác nhau từ 2 phiên Admin hoặc dán"
    " cùng 1 Token."
)

# Nhập Token cho Request thứ nhất
TOKEN_1 = input(
    "👉 Dán Bearer Token của PHIÊN ADMIN 1: "
).strip()
if TOKEN_1.lower().startswith("bearer "):
  TOKEN_1 = TOKEN_1[7:].strip()

# Nhập Token cho Request thứ hai (có thể dán lại token đó nếu chỉ có 1 tài khoản)
TOKEN_2 = input(
    "👉 Dán Bearer Token của PHIÊN ADMIN 2 (Enter để dùng lại token 1): "
).strip()
if not TOKEN_2:
  TOKEN_2 = TOKEN_1
elif TOKEN_2.lower().startswith("bearer "):
  TOKEN_2 = TOKEN_2[7:].strip()


class PaymentConcurrencyTests(unittest.TestCase):

  def test_confirm_final_payment_concurrency(self):
    url = f"{BASE_URL}/api/admin/bookings/{BOOKING_ID}/confirm-final-payment"

    # Tạo 2 header riêng biệt cho 2 request (tương ứng 2 phiên admin)
    headers_1 = {
        "Authorization": f"Bearer {TOKEN_1}",
        "Content-Type": "application/json",
    }
    headers_2 = {
        "Authorization": f"Bearer {TOKEN_2}",
        "Content-Type": "application/json",
    }

    def send_request_1():
      try:
        res = requests.post(url, headers=headers_1)
        print(f"   [Phiên Admin 1] Status: {res.status_code} | Body: {res.text}")
        return res
      except Exception as e:
        print(f"   [Phiên Admin 1 Lỗi]: {e}")
        return e

    def send_request_2():
      try:
        res = requests.post(url, headers=headers_2)
        print(f"   [Phiên Admin 2] Status: {res.status_code} | Body: {res.text}")
        return res
      except Exception as e:
        print(f"   [Phiên Admin 2 Lỗi]: {e}")
        return e

    print(
        f"\n🚀 Đang gửi đồng thời 2 request cho Booking ID: {BOOKING_ID} từ 2"
        " phiên..."
    )

    # Sử dụng ThreadPoolExecutor để bắn song song 2 request cùng lúc chính xác tuyệt đối
    with ThreadPoolExecutor(max_workers=2) as executor:
      future_1 = executor.submit(send_request_1)
      future_2 = executor.submit(send_request_2)
      responses = [future_1.result(), future_2.result()]

    status_codes = [
        r.status_code for r in responses if not isinstance(r, Exception)
    ]

    print(f"\n--- KẾT QUẢ TEST ĐỒNG THỜI ---")
    print(f"Các Status Code trả về từ Server: {status_codes}")

    # Kiểm tra xác thực kết quả: Phải có 1 thành công (200) và 1 xung đột bị chặn (409)
    self.assertIn(
        200, status_codes, "Lỗi: Phải có ít nhất 1 request thành công (200)"
    )
    self.assertIn(
        409,
        status_codes,
        "Lỗi: Request thứ 2 phải bị từ chối xung đột do đã thanh toán (409)",
    )


if __name__ == "__main__":
  unittest.main()