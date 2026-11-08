import os
from dotenv import load_dotenv

load_dotenv()

from flask import Flask
from flask_cors import CORS
from flasgger import Swagger


debug = os.getenv("DEBUG", "false").strip().lower() in ("1", "true", "yes", "on")

# Import blueprints after the Flask application is configured.
# ============================================================
# BLUEPRINTS
# ============================================================

from routes.auth import auth_bp
from routes.field import field_bp
from routes.booking import booking_bp
from routes.customer_booking import customer_booking_bp
from routes.user import get_my_profile, user_bp
from routes.payment import payment_bp
from routes.uc09 import uc09_bp
from routes.invoice import invoice_bp
from routes.cancellation import cancellation_bp

# UC15 - Quản lý sân bóng
from routes.field_management import field_management_bp


app = Flask(__name__)
app.register_blueprint(invoice_bp, url_prefix="/api")

# Multiple comma-separated frontend origins are supported for staging.
frontend_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_URL", "").split(",")
    if origin.strip()
]
if debug:
    frontend_origins.extend(["http://localhost:5173", "http://127.0.0.1:5173"])

CORS(
    app,
    resources={r"/api/*": {
        "origins": frontend_origins,
        "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
    }},
)

Swagger(
    app,
    template_file="swagger.yaml"
)

app.register_blueprint(
    auth_bp,
    url_prefix="/api/auth"
)

# API sân công khai, giữ nguyên
app.register_blueprint(
    field_bp,
    url_prefix="/api/fields"
)

# UC15 - API quản trị sân
app.register_blueprint(
    field_management_bp,
    url_prefix="/api/admin/fields"
)

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
    return {"message": "Backend running"}


@app.route("/health")
def health():
    """Process-level health check; does not require SQL Server."""
    return {"status": "ok"}, 200


@app.route("/ready")
def ready():
    """Readiness check requires the application database to be reachable."""
    from database import get_connection

    connection = get_connection()
    if connection is None:
        return {"status": "unavailable"}, 503
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        return {"status": "ready"}, 200
    except Exception:
        return {"status": "unavailable"}, 503
    finally:
        connection.close()

if __name__ == "__main__":
    host = os.getenv("APP_HOST", "127.0.0.1")
    port = int(os.getenv("APP_PORT", "5001"))

    app.run(
        host=host,
        port=port,
        debug=debug
    )
