"""New owner operations: request authorization, finish gates and correction input."""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.booking_operations import booking_operations_bp
from routes.business_time import business_time_bp
from services.booking_operations import operate, require_arrival_before_finish
from services.business_time import database_iso
from services.jwt_service import create_access_token
from services.payment_service import PaymentError


class BookingOperationTests(unittest.TestCase):
    def test_only_owner_can_mutate_operations(self):
        app = Flask(__name__); app.register_blueprint(booking_operations_bp,url_prefix="/api")
        with patch.dict(os.environ,{"JWT_SECRET":"operations-fixture"}), patch("routes.booking_operations.operate",return_value={"message":"updated"}) as write:
            for role in ("CUSTOMER","STAFF"):
                response=app.test_client().post("/api/admin/bookings/10/operations/check-in",json={},headers={"Authorization":"Bearer "+create_access_token(1,role)})
                self.assertEqual(response.status_code,403)
            self.assertEqual(app.test_client().post("/api/admin/bookings/10/operations/check-in",json={}).status_code,401)
            write.assert_not_called()
            response=app.test_client().post("/api/admin/bookings/10/operations/check-in",json={},headers={"Authorization":"Bearer "+create_access_token(1,"ADMIN")})
            self.assertEqual(response.status_code,200)
            write.assert_called_once_with(1,10,"check-in","")

    def test_unsafe_correction_input_does_not_open_database(self):
        with patch("services.booking_operations.get_connection") as db:
            for action,reason in (("restore-cancellation",""),("no-show","  "),("invalid","test"),("no-show",123),("restore-cancellation","x"*501)):
                with self.assertRaises(PaymentError): operate(1,10,action,reason)
            db.assert_not_called()

    def test_finish_requires_actual_start_without_checkin(self):
        cur=MagicMock()
        row=Row(BookingDate="2026-11-16",StartTime="06:00",AttendanceState=None)
        cur.fetchone.return_value=row
        with patch("services.booking_operations.rules._booking_now",return_value=datetime(2026,11,16,5,59)):
            with self.assertRaises(PaymentError) as error: require_arrival_before_finish(cur,10)
        self.assertEqual(error.exception.code,"BOOKING_NOT_STARTED")
        with patch("services.booking_operations.rules._booking_now",return_value=datetime(2026,11,16,6)):
            require_arrival_before_finish(cur,10)

    def test_legacy_database_timestamps_and_utc_events_convert_to_vietnam(self):
        with patch.dict(os.environ,{"DATABASE_TIMEZONE_OFFSET_MINUTES":"0"}):
            self.assertEqual(database_iso(datetime(2026,11,16,3)),"2026-11-16T10:00:00+07:00")
        with patch.dict(os.environ,{"DATABASE_TIMEZONE_OFFSET_MINUTES":"420"}):
            self.assertEqual(database_iso(datetime(2026,11,16,10)),"2026-11-16T10:00:00+07:00")
            self.assertEqual(database_iso(datetime(2026,11,16,3),utc=True),"2026-11-16T10:00:00+07:00")

    def test_server_clock_is_public_and_not_cached(self):
        app=Flask(__name__);app.register_blueprint(business_time_bp,url_prefix="/api")
        now=datetime(2026,11,16,6,tzinfo=timezone(timedelta(hours=7)))
        with patch("routes.business_time.business_now",return_value=now):
            response=app.test_client().get("/api/time")
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json["serverTimeMs"],int(now.timestamp()*1000))
        self.assertEqual(response.headers["Cache-Control"],"no-store")
