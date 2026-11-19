"""T123-98: invalid emails fail before authentication or database writes."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.auth import auth_bp
from routes.user import user_bp
from services.jwt_service import create_access_token

MESSAGE = "Email không đúng định dạng, vui lòng nhập lại"


class EmailValidationTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET": "email-validation-test-secret-only"})
        env.start()
        self.addCleanup(env.stop)
        app = Flask(__name__)
        app.register_blueprint(auth_bp, url_prefix="/api/auth")
        app.register_blueprint(user_bp, url_prefix="/api/users")
        self.client = app.test_client()

    @patch("routes.auth.authenticate_user")
    def test_invalid_login_email_returns_specific_message(self, authenticate):
        for field in ("email", "account"):
            for value in ("user@", "@example.com", "user@example", "a@@example.com", "a b@example.com"):
                with self.subTest(field=field, value=value):
                    response = self.client.post("/api/auth/login", json={field: value, "password": "Abcdefg1"})
                    self.assertEqual(response.status_code, 400)
                    self.assertEqual(response.get_json()["message"], MESSAGE)
                    self.assertEqual(response.get_json()["errors"]["email"], [MESSAGE])
        authenticate.assert_not_called()

    @patch("routes.auth.authenticate_user")
    def test_explicit_email_does_not_accept_a_username_or_phone(self, authenticate):
        for value in ("test_user", "0912345678"):
            response = self.client.post("/api/auth/login", json={"email": value, "password": "Abcdefg1"})
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.get_json()["message"], MESSAGE)
        authenticate.assert_not_called()

    @patch("routes.auth.authenticate_user")
    def test_valid_login_identifiers_still_authenticate(self, authenticate):
        authenticate.return_value = dict(UserID=1, FullName="Test", Email="user@example.com",
                                         Phone="0912345678", Role="CUSTOMER", Status="ACTIVE")
        for field, value in (("email", "user@example.com"), ("account", "user@example.com"),
                             ("account", "test_user"), ("account", "0912345678")):
            with self.subTest(field=field, value=value):
                response = self.client.post("/api/auth/login", json={field: value, "password": "Abcdefg1"})
                self.assertEqual(response.status_code, 200)
                self.assertTrue(response.get_json()["accessToken"])
                authenticate.assert_called_with(value, "Abcdefg1")

    @patch("services.auth_service.get_connection")
    def test_registration_rejects_invalid_email_before_database(self, connection):
        response = self.client.post("/api/auth/register", json={
            "fullName": "Test User", "username": "test_user", "email": "user@",
            "phone": "0912345678", "password": "Abcdefg1"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["message"], MESSAGE)
        connection.assert_not_called()

    @patch("services.user_service.get_connection")
    def test_profile_rejects_invalid_email_before_database(self, connection):
        response = self.client.put("/api/users/me", json={
            "fullName": "Test User", "email": "user@", "phone": "0912345678"},
            headers={"Authorization": "Bearer " + create_access_token(1, "CUSTOMER")})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["message"], MESSAGE)
        connection.assert_not_called()


if __name__ == "__main__":
    unittest.main()
