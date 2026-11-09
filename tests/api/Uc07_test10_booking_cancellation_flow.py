import concurrent.futures
import unittest
import requests

# ==========================================
# CẤU HÌNH BAN ĐẦU & NHẬP LIỆU TỪ BÀN PHÍM
# ==========================================
BASE_URL = "http://127.0.0.1:5001"

print("==========================================")
print("     TEST LUỒNG HỦY BOOKING & XUNG ĐỘT    ")
print("==========================================")

# Nhập Booking ID linh hoạt (mặc định là 37 nếu bấm Enter)
try:
    BOOKING_ID = int(
        input("👉 Nhập Booking ID cần test [Mặc định 37]: ").strip() or 37
    )
except ValueError:
    BOOKING_ID = 37

# Nhập và xử lý định dạng Token từ bàn phím
TOKEN = input("👉 Dán chuỗi Bearer Token của Admin vào đây: ").strip()
if TOKEN.lower().startswith("bearer "):
    TOKEN = TOKEN[7:].strip()

ADMIN_HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}


# ==========================================
# TEST SUITE: LUỒNG KIỂM THỬ HỦY BOOKING
# ==========================================
class BookingCancellationFlowTests(unittest.TestCase):

    def test_step4_concurrent_cancellation(self):
        """Step 4: Gửi đồng thời 2 request hủy booking (Kiểm thử Race Condition)"""
        url = f"{BASE_URL}/api/bookings/{BOOKING_ID}/cancel"

        def send_cancel_request():
            return requests.post(url, headers=ADMIN_HEADERS)

        print(
            f"\n🚀 [Step 4] Gửi đồng thời 2 request hủy cho Booking ID:"
            f" {BOOKING_ID}..."
        )

        # Chạy song song 2 thread gửi request gần như cùng lúc
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(send_cancel_request) for _ in range(2)]
            responses = [
                f.result() for f in concurrent.futures.as_completed(futures)
            ]

        status_codes = [r.status_code for r in responses]
        print(f"--- KẾT QUẢ THỰC TẾ ---")
        print(f"Status codes trả về: {status_codes}")
        for i, res in enumerate(responses):
            print(f"Response {i+1}: {res.text}")

        success_count = status_codes.count(200)
        conflict_count = sum(
            1 for code in status_codes if code in [400, 409, 422]
        )

        # Xác thực kết quả mong đợi
        self.assertEqual(
            success_count,
            1,
            f"Lỗi: Kỳ vọng đúng 1 request thành công (200), nhưng có"
            f" {success_count}",
        )
        self.assertEqual(
            conflict_count,
            1,
            f"Lỗi: Kỳ vọng 1 request bị chặn/xung đột (400/409/422), nhưng nhận"
            f" được: {status_codes}",
        )

    def test_step5_reject_direct_patch_status(self):
        """Step 5: Thử cập nhật trạng thái trực tiếp bằng PATCH (Bypass quy trình hủy)"""
        url = f"{BASE_URL}/api/bookings/{BOOKING_ID}/status"
        payload = {"status": "CANCELLED"}

        print(
            f"\n🚀 [Step 5] Thử PATCH trực tiếp trạng thái cho Booking ID:"
            f" {BOOKING_ID}..."
        )
        res = requests.patch(url, json=payload, headers=ADMIN_HEADERS)

        print(f"--- KẾT QUẢ THỰC TẾ ---")
        print(f"Status Code trả về: {res.status_code}")
        print(f"Nội dung Response: {res.text}")

        # Hệ thống bắt buộc phải từ chối (trả về mã lỗi từ 400 trở lên)
        self.assertGreaterEqual(
            res.status_code,
            400,
            (
                "Lỗi: Hệ thống cho phép cập nhật trạng thái trực tiếp bằng PATCH"
                " trái contract!"
            ),
        )

    def test_step6_verify_data_consistency(self):
        """Step 6: Kiểm tra tính nhất quán dữ liệu sau các thao tác lỗi hoặc đồng thời"""
        print(
            f"\n🚀 [Step 6] Kiểm tra tính nhất quán dữ liệu cho Booking ID:"
            f" {BOOKING_ID}..."
        )

        # 1. Kiểm tra trạng thái booking qua GET
        get_url = f"{BASE_URL}/api/bookings/{BOOKING_ID}"
        res_booking = requests.get(get_url, headers=ADMIN_HEADERS)

        print(f"--- KẾT QUẢ THỰC TẾ (GET Booking) ---")
        print(f"Status Code: {res_booking.status_code}")
        print(f"Nội dung Response: {res_booking.text}")

        self.assertEqual(
            res_booking.status_code, 200, "Lỗi: Không thể truy vấn lại booking!"
        )

        booking_data = res_booking.json()
        self.assertEqual(
            booking_data.get("status"),
            "CANCELLED",
            "Lỗi: Trạng thái booking cuối cùng không phải là CANCELLED!",
        )

        # 2. Kiểm tra danh sách yêu cầu hủy xem có bị trùng lặp record không
        cancel_req_url = (
            f"{BASE_URL}/api/bookings/{BOOKING_ID}/cancellation-requests"
        )
        res_cancel = requests.get(cancel_req_url, headers=ADMIN_HEADERS)

        if res_cancel.status_code == 200:
            cancellations = res_cancel.json()
            print(f"Số lượng bản ghi yêu cầu hủy: {len(cancellations)}")
            self.assertEqual(
                len(cancellations),
                1,
                (
                    f"Lỗi: Dữ liệu không nhất quán, tìm thấy"
                    f" {len(cancellations)} bản ghi yêu cầu hủy trùng lặp!"
                ),
            )


if __name__ == "__main__":
    unittest.main()