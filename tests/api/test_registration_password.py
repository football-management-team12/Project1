"""Registration password regression checks; no database required."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from flask import Flask
from routes.auth import auth_bp


class RegistrationPasswordTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(auth_bp, url_prefix="/api/auth")
        self.client = app.test_client()

    def register(self, password):
        return self.client.post("/api/auth/register", json={
            "fullName": "Nguyen Van Test", "username": "test_user_04",
            "email": "test04@example.com", "phone": "0912345680",
            "password": password,
        })

    @patch("services.auth_service.get_connection")
    def test_invalid_passwords_rejected_before_database_access(self, connection):
        for password in ("12345678", "abcdefgh", "ABCDEFG1", "Abcdefgh",
                         "Abc123!", "Abcdefg ", "Abc" + "é" * 35 + "1"):
            with self.subTest(password=password):
                response = self.register(password)
                self.assertEqual(response.status_code, 400)
                self.assertFalse(response.get_json()["success"])
        connection.assert_not_called()

    @patch("services.auth_service.get_connection")
    def test_valid_passwords_create_customer(self, connection):
        connection.return_value.cursor.return_value.fetchone.side_effect = [
            None, (123,), None, (124,), None, (125,),
        ]
        for password in ("Abcdefg1", "Abcdefg!", "Abc" + "é" * 34 + "1"):
            with self.subTest(password=password):
                response = self.register(password)
                self.assertEqual(response.status_code, 201)
                self.assertTrue(response.get_json()["success"])
        self.assertEqual(connection.return_value.commit.call_count, 3)


if __name__ == "__main__":
    unittest.main()
