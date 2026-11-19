"""UC07 evidence must return the exact stored file, never an empty success."""
import base64
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from app import app
from services.cancellation_service import _validate_refund_evidence
from services.jwt_service import create_access_token


class RefundEvidenceTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET": "refund-evidence-test-only"})
        env.start()
        self.addCleanup(env.stop)
        self.conn = MagicMock()
        self.cursor = self.conn.cursor.return_value
        db = patch("services.cancellation_service.get_connection", return_value=self.conn)
        db.start()
        self.addCleanup(db.stop)
        self.client = app.test_client()
        self.path = "/api/bookings/10/deposit-refund/evidence"

    def seed(self, data, mime="application/pdf", name="receipt.pdf", role="ADMIN", owner=2, status="ACTIVE"):
        self.cursor.fetchone.side_effect = [
            Row(Role=role, Status=status), Row(UserID=owner),
            Row(EvidenceData=data, EvidenceMimeType=mime, EvidenceFileName=name),
        ]

    def get(self, role="ADMIN", **kwargs):
        return self.client.get(self.path, headers={
            "Authorization": "Bearer " + create_access_token(1, role),
        }, **kwargs)

    def test_upload_validation_to_download_preserves_all_file_bytes(self):
        for data, mime, name in (
            (b"%PDF-1.7\nQA receipt\x00\xff", "application/pdf", "receipt.pdf"),
            (b"\x89PNG\r\n\x1a\n\x00\xffQA", "image/png", "receipt.png"),
            (b"\xff\xd8\xff\x00QA\xff\xd9", "image/jpeg", "receipt.jpg"),
        ):
            with self.subTest(mime=mime):
                _, stored, stored_mime, stored_name = _validate_refund_evidence({
                    "transactionReference": "QA-REFUND-10",
                    "evidenceBase64": base64.b64encode(data).decode(),
                    "evidenceMimeType": mime, "evidenceFileName": name,
                })
                self.seed(memoryview(stored), stored_mime, stored_name)
                response = self.get()
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data, data)
                self.assertEqual(response.mimetype, mime)
                self.assertEqual(response.content_length, len(data))
                self.assertIn("attachment;", response.headers["Content-Disposition"])
                self.assertIn(name, response.headers["Content-Disposition"])
                self.assertEqual(response.headers["Cache-Control"], "private, no-store")
                self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
                response.close()
        self.conn.commit.assert_not_called()
        self.assertFalse(any(call.args[0].lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))
                             for call in self.cursor.execute.call_args_list))

    def test_owner_can_download_but_other_customer_cannot(self):
        self.seed(b"%PDF-QA", role="CUSTOMER", owner=1)
        response = self.get("CUSTOMER")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, b"%PDF-QA")
        response.close()
        self.seed(b"%PDF-PRIVATE", role="CUSTOMER", owner=2)
        response = self.get("CUSTOMER")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json["code"], "BOOKING_NOT_FOUND")
        self.assertNotIn(b"PRIVATE", response.data)

    def test_null_empty_and_missing_evidence_return_json_404(self):
        for data in (None, b""):
            self.seed(data)
            response = self.get()
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json["code"], "EVIDENCE_NOT_FOUND")
        self.cursor.fetchone.side_effect = [Row(Role="ADMIN", Status="ACTIVE"), Row(UserID=2), None]
        response = self.get()
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json["code"], "EVIDENCE_NOT_FOUND")

    def test_missing_booking_returns_404(self):
        self.cursor.fetchone.side_effect = [Row(Role="ADMIN", Status="ACTIVE"), None]
        response = self.get()
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json["code"], "BOOKING_NOT_FOUND")

    def test_authentication_role_and_account_status(self):
        self.assertEqual(self.client.get(self.path).status_code, 401)
        self.assertEqual(self.get("STAFF").status_code, 403)
        self.conn.cursor.assert_not_called()
        self.seed(b"%PDF-QA", status="INACTIVE")
        response = self.get()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json["code"], "ACCOUNT_INACTIVE")

    def test_database_failure_is_not_success(self):
        with patch("services.cancellation_service.get_connection", return_value=None):
            response = self.get()
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json["code"], "DB_UNAVAILABLE")


if __name__ == "__main__":
    unittest.main()
