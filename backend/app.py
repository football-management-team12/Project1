import os
from dotenv import load_dotenv

load_dotenv()

from flask import Flask
from flask_cors import CORS
from flasgger import Swagger


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

from routes.auth import auth_bp
from routes.field import field_bp
from routes.booking import booking_bp
from routes.customer_booking import customer_booking_bp
from routes.user import get_my_profile, user_bp


swagger = Swagger(
    app,
    template_file="swagger.yaml"
)

app.register_blueprint(
    auth_bp,
    url_prefix="/api/auth"
)

app.register_blueprint(
    field_bp,
    url_prefix="/api/fields"
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


# Legacy profile path retained for the login/profile integration contract.
app.add_url_rule(
    "/api/user/profile",
    endpoint="user_profile_legacy",
    view_func=get_my_profile,
    methods=["GET"],
)


@app.route("/")
def home():

    return {
        "message":
            "Backend running"
    }

if __name__ == "__main__":
    host = os.getenv("APP_HOST", "127.0.0.1")
    port = int(os.getenv("APP_PORT", "5000"))

    app.run(
        host=host,
        port=port,
        debug=debug
    )
