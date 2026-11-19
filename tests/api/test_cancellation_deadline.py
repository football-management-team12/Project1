"""Cancellation is locked at the two-hour boundary in Vietnam business time."""
import os
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from services.cancellation_service import _rule_violation
from routes.cancellation import cancellation_bp
from services.jwt_service import create_access_token


class CancellationDeadlineTests(unittest.TestCase):
    def setUp(self):
        self.booking = Row(BookingID=10, UserID=1, Status="CONFIRMED", BookingDate="2026-11-16", StartTime="06:00")
        self.cutoff = datetime(2026, 11, 16, 4)

    def test_before_at_and_after_two_hour_boundary(self):
        self.assertIsNone(_rule_violation("CUSTOMER", self.booking, self.cutoff-timedelta(seconds=1)))
        for now in (self.cutoff, self.cutoff+timedelta(seconds=1), datetime(2026,11,16,5,59)):
            self.assertEqual(_rule_violation("CUSTOMER", self.booking, now)[0], "CANCELLATION_DEADLINE_PASSED")
        self.assertEqual(_rule_violation("CUSTOMER", self.booking, datetime(2026,11,16,6))[0], "BOOKING_ALREADY_STARTED")
        self.assertIsNone(_rule_violation("ADMIN", self.booking, self.cutoff))

    def test_cutoff_can_fall_on_previous_day(self):
        self.booking.StartTime = "01:00"
        self.assertIsNone(_rule_violation("CUSTOMER", self.booking, datetime(2026,11,15,22,59,59)))
        self.assertEqual(_rule_violation("CUSTOMER", self.booking, datetime(2026,11,15,23))[0], "CANCELLATION_DEADLINE_PASSED")

    def test_admin_cannot_cancel_at_start_or_during_play(self):
        self.assertIsNone(_rule_violation("ADMIN",self.booking,datetime(2026,11,16,5,59,59)))
        for now in (datetime(2026,11,16,6),datetime(2026,11,16,6,30)):
            self.assertEqual(_rule_violation("ADMIN",self.booking,now)[0],"BOOKING_ALREADY_STARTED")

    def test_post_request_rechecks_deadline_before_inserting(self):
        app = Flask(__name__)
        app.register_blueprint(cancellation_bp, url_prefix="/api")
        with patch.dict(os.environ, {"JWT_SECRET":"deadline-test-only"}), \
             patch("services.cancellation_request_service.get_connection") as db, \
             patch("services.cancellation_request_service.rules._check_actor", return_value="CUSTOMER"), \
             patch("services.cancellation_request_service.rules._check_ownership"), \
             patch("services.cancellation_request_service.rules._get_booking", return_value=self.booking), \
             patch("services.cancellation_request_service.rules._booking_now", return_value=self.cutoff), \
             patch("services.cancellation_request_service.rules._payment_summary", return_value=(100,False)), \
             patch("services.cancellation_request_service.rules._paid_invoice_exists", return_value=False):
            response = app.test_client().post("/api/bookings/10/cancellation-requests", json={"reason":"Late request"},
                headers={"Authorization":"Bearer "+create_access_token(1,"CUSTOMER")})
            self.assertEqual(response.status_code,409)
            self.assertEqual(response.json["code"],"CANCELLATION_DEADLINE_PASSED")
            db.return_value.commit.assert_not_called()
            db.return_value.rollback.assert_called_once()
            self.assertFalse(any("INSERT" in c.args[0] for c in db.return_value.cursor.return_value.execute.call_args_list))
