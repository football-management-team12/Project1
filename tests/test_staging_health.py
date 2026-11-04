"""Fast, database-free contract checks for staging health endpoints."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app import app


class StagingHealthTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health_returns_ok(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "ok")

    def test_ready_returns_503_when_database_unavailable(self):
        with patch("database.get_connection", return_value=None):
            response = self.client.get("/ready")
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
