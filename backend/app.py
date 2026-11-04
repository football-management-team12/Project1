<<<<<<< HEAD
import os
=======

import os

>>>>>>> d686af5791ef08fe83682f60113b74ab4ac62a99
from dotenv import load_dotenv

load_dotenv()

from flask import Flask
from flask_cors import CORS
from flasgger import Swagger

<<<<<<< HEAD

app = Flask(__name__)

debug = os.getenv("DEBUG", "false").strip().lower() in (
    "1", "true", "yes", "on"
)

frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")

if frontend_url:
    CORS(app, resources={r"/api/*": {"origins": [frontend_url]}})
else:
    # Fail-safe: khong mo CORS cho moi origin khi chua cau hinh frontend.
    CORS(app, resources={r"/api/*": {"origins": []}})

# Import blueprint sau khi co app
# ============================================================
# BLUEPRINTS
# ============================================================

=======
>>>>>>> d686af5791ef08fe83682f60113b74ab4ac62a99
from routes.auth import auth_bp
from routes.field import field_bp
from routes.booking import booking_bp
from routes.customer_booking import customer_booking_bp
from routes.user import get_my_profile, user_bp
from routes.payment import payment_bp
from routes.uc09 import uc09_bp
from routes.cancellation import cancellation_bp

# UC15 - Quản lý sân bóng
from routes.field_management import field_management_bp


app = Flask(__name__)

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "http://localhost:5173",
                "http://127.0.0.1:5173"
            ],
            "methods": [
                "GET",
                "POST",
                "PUT",
                "PATCH",
                "DELETE",
                "OPTIONS"
            ],
            "allow_headers": [
                "Content-Type",
                "Authorization"
            ]
        }
    }
)

Swagger(
    app,
    template_file="swagger.yaml"
)

app.register_blueprint(
    auth_bp,
    url_prefix="/api/auth"
)

<<<<<<< HEAD
=======
# API sân công khai, giữ nguyên
>>>>>>> d686af5791ef08fe83682f60113b74ab4ac62a99
app.register_blueprint(
    field_bp,
    url_prefix="/api/fields"
)

<<<<<<< HEAD
=======
# UC15 - API quản trị sân
app.register_blueprint(
    field_management_bp,
    url_prefix="/api/admin/fields"
)

>>>>>>> d686af5791ef08fe83682f60113b74ab4ac62a99
app.register_blueprint(
    booking_bp,
    url_prefix="/api/bookings"
)

app.register_blueprint(
    customer_booking_bp,
    url_prefix="/api/customer-bookings"
)

app.register_blueprint(
    user_bp,
    url_prefix="/api/users"
)

# UC06 - Đặt cọc VietQR, giữ nguyên
app.register_blueprint(
    payment_bp,
    url_prefix="/api"
)

# UC09 - Xác nhận thanh toán tại sân, giữ nguyên
app.register_blueprint(
    uc09_bp,
    url_prefix="/api"
)

# UC07 - Hủy đơn và ADMIN duyệt yêu cầu, giữ nguyên
app.register_blueprint(
    cancellation_bp,
    url_prefix="/api"
)

# Đường dẫn profile phiên bản cũ
app.add_url_rule(
    "/api/user/profile",
    endpoint="user_profile_legacy",
    view_func=get_my_profile,
    methods=["GET"]
)


@app.route("/")
def home():
    return {
        "message": "Backend running"
    }

if __name__ == "__main__":
<<<<<<< HEAD
    host = os.getenv("APP_HOST", "127.0.0.1")
    port = int(os.getenv("APP_PORT", "5000"))

    app.run(
        host=host,
        port=port,
        debug=debug
=======
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "5001")),
        debug=True
>>>>>>> d686af5791ef08fe83682f60113b74ab4ac62a99
    )
