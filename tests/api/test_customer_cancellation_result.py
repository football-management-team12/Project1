"""T123-170: customer history exposes latest cancellation outcome with ownership scope."""
import os
import sys
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.customer_booking import customer_booking_bp
from services.jwt_service import create_access_token
from routes.cancellation import cancellation_bp


class CustomerCancellationResultTests(unittest.TestCase):
    def test_rejected_request_blocks_resubmission_and_cancellation_info(self):
        app = Flask(__name__)
        app.register_blueprint(cancellation_bp, url_prefix="/api")
        with patch.dict(os.environ, {"JWT_SECRET":"cancellation-result-fixture"}), \
             patch("services.cancellation_request_service.get_connection") as db, \
             patch("services.cancellation_request_service.rules._check_actor", return_value="CUSTOMER"), \
             patch("services.cancellation_request_service.rules._get_booking"), \
             patch("services.cancellation_request_service.rules._check_ownership"), \
             patch("services.cancellation_request_service.rules._payment_summary", return_value=(30, False)), \
             patch("services.cancellation_request_service.rules._booking_now"), \
             patch("services.cancellation_request_service.rules._paid_invoice_exists", return_value=False), \
             patch("services.cancellation_request_service.rules._rule_violation", return_value=None):
            headers = {"Authorization":"Bearer " + create_access_token(1, "CUSTOMER")}
            cur = db.return_value.cursor.return_value
            cur.fetchone.side_effect = [None, (10,)]
            response = app.test_client().post("/api/bookings/10/cancellation-requests", headers=headers, json={"reason":"Retry"})
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json["code"], "CANCELLATION_ALREADY_REJECTED")
            db.return_value.commit.assert_not_called()
            db.return_value.rollback.assert_called_once()
            self.assertFalse(any("INSERT INTO" in call.args[0] for call in cur.execute.call_args_list))
            with patch("routes.cancellation.get_cancellation_info", return_value={"canCancel":True}), \
                 patch("routes.cancellation.latest_request", return_value={"status":"REJECTED"}):
                response = app.test_client().get("/api/bookings/10/cancellation", headers=headers)
                self.assertEqual(response.status_code, 200)
                self.assertFalse(response.json["canCancel"])

    def test_history_includes_pending_approved_rejected_and_absent_request(self):
        app = Flask(__name__)
        app.register_blueprint(customer_booking_bp, url_prefix="/api/customer-bookings")
        with patch.dict(os.environ, {"JWT_SECRET":"cancellation-result-fixture"}), \
             patch("routes.customer_booking.get_connection") as db:
            cur = db.return_value.cursor.return_value
            cur.fetchone.return_value = Row(UserID=1, Role="CUSTOMER", Status="ACTIVE", FullName="QA", Email="qa@example.invalid", Phone="")
            token = create_access_token(1, "CUSTOMER")
            for status in (None, "PENDING_REVIEW", "APPROVED", "REJECTED"):
                cur.fetchall.return_value = [Row(BookingID=10, UserID=1, FieldID=1,
                    BookingDate="2099-01-01", StartTime="18:00", EndTime="19:00", TotalAmount=100,
                    Status="CANCELLED" if status == "APPROVED" else "CONFIRMED", CreatedAt=None,
                    PaidAmount=30, TotalPaidAmount=100,
                    CancellationRequestStatus=status, CancellationReviewNote="QA reason" if status == "REJECTED" else None,
                    CancellationReviewedAt=datetime(2026,11,15,23) if status in ("APPROVED","REJECTED") else None)]
                response = app.test_client().get("/api/customer-bookings/me", headers={"Authorization":"Bearer "+token})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json["Bookings"][0]["RemainingAmount"], 0)
                self.assertEqual(response.json["Bookings"][0]["PaidAmount"], 30)
                result = response.json["Bookings"][0]["CancellationRequest"]
                if status is None:
                    self.assertIsNone(result)
                else:
                    self.assertEqual(result["status"], status)
                    if status == "REJECTED":
                        self.assertEqual(result["reviewNote"], "QA reason")
                        self.assertIsNotNone(result["reviewedAt"])
                sql, user_id = cur.execute.call_args.args
                self.assertIn("WHERE B.UserID = ?", sql)
                self.assertEqual(user_id, 1)
                self.assertIn("CR.BookingID = B.BookingID", sql)
                self.assertIn("ORDER BY CR.RequestedAt DESC, CR.RequestID DESC", sql)
                db.return_value.commit.assert_not_called()

    def test_customer_cannot_read_another_customers_history(self):
        app = Flask(__name__)
        app.register_blueprint(customer_booking_bp, url_prefix="/api/customer-bookings")
        with patch.dict(os.environ, {"JWT_SECRET":"cancellation-result-fixture"}), \
             patch("routes.customer_booking.get_connection") as db:
            token = create_access_token(1, "CUSTOMER")
            response = app.test_client().get("/api/customer-bookings/2", headers={"Authorization":"Bearer "+token})
            self.assertEqual(response.status_code, 403)
            db.assert_not_called()
