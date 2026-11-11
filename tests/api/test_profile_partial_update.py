"""T123-159: partial PUT with real JWT and isolated SQL mocks."""
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.user import user_bp
from services.jwt_service import create_access_token


class ProfilePartialUpdateTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET": "profile-partial-test-secret-only"})
        env.start()
        self.addCleanup(env.stop)
        app = Flask(__name__)
        app.register_blueprint(user_bp, url_prefix="/api/users")
        self.client = app.test_client()
        db = patch("services.user_service.get_connection")
        self.db = db.start()
        self.addCleanup(db.stop)
        self.conn = self.db.return_value
        self.cursor = self.conn.cursor.return_value
        self.current = dict(UserID=12, FullName="Current Name", Username="customer12",
                            Email="old@example.com", Phone="0912345678", Role="CUSTOMER", Status="ACTIVE")

    def put(self, data):
        return self.client.put("/api/users/me", json=data,
                               headers={"Authorization": "Bearer " + create_access_token(12, "CUSTOMER")})

    def seed(self, changes=None, duplicate=None):
        updated = {**self.current, **(changes or {})}
        self.cursor.fetchone.side_effect = [SimpleNamespace(**self.current), duplicate,
                                            SimpleNamespace(**updated)]

    def test_single_pair_and_full_updates_preserve_omitted_fields(self):
        cases = [({"email": " NEW@EXAMPLE.COM "}, {"Email": "new@example.com"}),
                 ({"phone": "0900000000"}, {"Phone": "0900000000"}),
                 ({"fullName": " New Name "}, {"FullName": "New Name"}),
                 ({"email": "new@example.com", "phone": "0900000000"},
                  {"Email": "new@example.com", "Phone": "0900000000"}),
                 ({"fullName": "New", "email": "new@example.com", "phone": "0900000000"},
                  {"FullName": "New", "Email": "new@example.com", "Phone": "0900000000"})]
        for payload, changes in cases:
            with self.subTest(payload=payload):
                self.conn.reset_mock()
                self.seed(changes)
                response = self.put(payload)
                self.assertEqual(response.status_code, 200)
                result = response.get_json()["user"]
                expected = {**self.current, **changes}
                for api_key, column in (("fullName", "FullName"), ("email", "Email"), ("phone", "Phone")):
                    self.assertEqual(result[api_key], expected[column])
                update = [c.args for c in self.cursor.execute.call_args_list
                          if c.args[0].lstrip().startswith("UPDATE")]
                self.assertEqual(update[0][1:], (expected["FullName"], expected["Email"], expected["Phone"], 12))
                self.assertIn("UPDLOCK", self.cursor.execute.call_args_list[1].args[0])
                self.conn.commit.assert_called_once()
                self.conn.rollback.assert_not_called()

    def test_reject_empty_invalid_and_forbidden_payloads_before_database(self):
        for body in ({}, [], {"email": None}, {"phone": " "}, {"fullName": False},
                     {"email": "user@"}, {"phone": "123"}, {"fullName": "X" * 101},
                     {"role": "ADMIN"}, {"UserID": 99}, {"username": "hacked"},
                     {"FullName": "wrong key"}, {"email": "new@example.com", "x": "extra"}):
            with self.subTest(body=body):
                self.assertEqual(self.put(body).status_code, 400)
        self.db.assert_not_called()

    def test_duplicate_contact_returns_409_and_rolls_back(self):
        for payload, duplicate in (({"email": "used@example.com"}, {"Email": "used@example.com", "Phone": "0900000000"}),
                                   ({"phone": "0900000000"}, {"Email": "other@example.com", "Phone": "0900000000"})):
            self.conn.reset_mock()
            self.seed(duplicate=SimpleNamespace(**duplicate))
            self.assertEqual(self.put(payload).status_code, 409)
            self.conn.commit.assert_not_called()
            self.conn.rollback.assert_called_once()

    def test_missing_or_inactive_current_user_is_not_updated(self):
        for row, expected in ((None, 404), (SimpleNamespace(**{**self.current, "Status": "INACTIVE"}), 403)):
            self.conn.reset_mock()
            self.cursor.fetchone.side_effect = [row]
            self.assertEqual(self.put({"phone": "0900000000"}).status_code, expected)
            self.conn.commit.assert_not_called()
            self.conn.rollback.assert_called_once()

    def test_no_token_is_rejected_without_database(self):
        response = self.client.put("/api/users/me", json={"phone": "0900000000"})
        self.assertEqual(response.status_code, 401)
        self.db.assert_not_called()

    def test_merge_uses_latest_locked_row(self):
        self.current["FullName"] = "Name changed by another request"
        self.seed({"Phone": "0900000000"})
        response = self.put({"phone": "0900000000"})
        self.assertEqual(response.get_json()["user"]["fullName"], self.current["FullName"])


if __name__ == "__main__":
    unittest.main()
