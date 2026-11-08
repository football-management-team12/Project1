import unittest
import requests

BASE_URL = "http://127.0.0.1:5001"

print("==========================================")
print("     TEST LỖI HỆ THỐNG / DATABASE          ")
print("==========================================")

# Nhập Booking ID linh hoạt từ bàn phím (mặc định là 622 nếu bấm Enter)
try:
  BOOKING_ID = int(
      input("👉 Nhập Booking ID cần test [Mặc định 622]: ").strip() or 622
  )
except ValueError:
  BOOKING_ID = 622

# Nhập Token từ bàn phím
TOKEN = input(
    "👉 Dán chuỗi Bearer Token của Admin vào đây: "
).strip()
if TOKEN.lower().startswith("bearer "):
  TOKEN = TOKEN[7:].strip()


class PaymentDBErrorTests(unittest.TestCase):

  def test_confirm_payment_db_failure(self):
    url = f"{BASE_URL}/api/admin/bookings/{BOOKING_ID}/confirm-final-payment"
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
    }

    print(
        f"\n🚀 Đang gửi request tới Booking ID: {BOOKING_ID} (Giả lập lỗi"
        " DB)..."
    )
    res = requests.post(url, headers=headers)

    print(f"--- KẾT QUẢ THỰC TẾ ---")
    print(f"Status Code trả về: {res.status_code}")
    print(f"Nội dung Response: {res.text}")

    # Kỳ vọng server phải trả mã lỗi (từ 400 trở lên) khi xảy ra sự cố
    self.assertGreaterEqual(
        res.status_code,
        400,
        "Lỗi: Hệ thống không được phép trả về 200 khi xảy ra lỗi Database!",
    )


if __name__ == "__main__":
  unittest.main()