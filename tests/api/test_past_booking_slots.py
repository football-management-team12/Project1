"""T123-174: fixed Vietnam clock; no application database writes."""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace as Row

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.booking import booking_bp
from routes.field import field_bp
from services.availability_service import build_availability_slots, slot_has_started, vietnam_now
from services.jwt_service import create_access_token


class PastBookingSlotsTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 15, 23)
        self.prices = [{"PriceID": 1, "StartTime": "18:00", "EndTime": "19:00", "Price": 100},
                       {"PriceID": 2, "StartTime": "23:00", "EndTime": "23:59", "Price": 100}]

    def test_all_slots_expired_at_23_and_future_day_still_available(self):
        rows = build_availability_slots(self.prices, [], booking_date="2026-11-15", now=self.now)
        self.assertTrue(all(not r["available"] and r["reason"] == "PAST_TIME" for r in rows))
        future = build_availability_slots(self.prices, [], booking_date="2026-11-16", now=self.now)
        self.assertTrue(all(r["available"] for r in future))

    def test_before_exact_start_after_start_and_midnight(self):
        for now, expected in [(self.now-timedelta(seconds=1), False), (self.now, True),
                              (self.now+timedelta(seconds=1), True)]:
            self.assertEqual(slot_has_started("2026-11-15", "23:00", now), expected)
        self.assertTrue(slot_has_started("2026-11-15", "23:00", datetime(2026, 11, 16)))
        self.assertFalse(slot_has_started("2026-11-16", "06:00", datetime(2026, 11, 16)))

    def test_maintenance_and_booked_reasons_preserved(self):
        rows = build_availability_slots(self.prices, [], False, "2026-11-16", self.now)
        self.assertTrue(all(r["reason"] == "FIELD_UNAVAILABLE" for r in rows))
        rows = build_availability_slots(self.prices, [{"StartTime":"18:00", "EndTime":"19:00", "Status":"CONFIRMED"}],
                                        booking_date="2026-11-16", now=self.now)
        self.assertEqual(rows[0]["reason"], "BOOKED")
        self.assertTrue(rows[1]["available"])

    def test_clock_explicitly_uses_utc_plus_seven(self):
        with patch("services.availability_service.datetime") as clock:
            clock.now.return_value = datetime(2026, 11, 15, 23, tzinfo=timezone(timedelta(hours=7)))
            self.assertEqual(vietnam_now(), self.now)
            self.assertEqual(clock.now.call_args.args[0].utcoffset(None), timedelta(hours=7))

    def test_direct_booking_api_rejects_past_slots_before_database_access(self):
        app = Flask(__name__)
        app.register_blueprint(booking_bp, url_prefix="/api/bookings")
        with patch.dict(os.environ, {"JWT_SECRET":"past-slot-fixture"}), \
             patch("routes.booking.vietnam_now", return_value=self.now), \
             patch("services.availability_service.vietnam_now", return_value=self.now), \
             patch("routes.booking.get_connection", return_value=None) as db:
            headers = {"Authorization":"Bearer " + create_access_token(1, "CUSTOMER")}
            for start in ("18:00", "22:00", "23:00"):
                response = app.test_client().post("/api/bookings/", headers=headers, json={
                    "FieldID":1, "BookingDate":"2026-11-15", "StartTime":start, "EndTime":"23:59"})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json["code"], "PAST_TIME")
            db.assert_not_called()
            # A future day proceeds to DB validation rather than being time-blocked.
            response = app.test_client().post("/api/bookings/", headers=headers, json={
                "FieldID":1, "BookingDate":"2026-11-16", "StartTime":"18:00", "EndTime":"19:00"})
            self.assertEqual(response.status_code, 500)
            db.assert_called_once()

    def test_single_field_availability_marks_elapsed_slots_unavailable(self):
        app = Flask(__name__)
        app.register_blueprint(field_bp, url_prefix="/api/fields")
        with patch("routes.field.get_connection") as db, \
             patch("routes.field.expire_pending_bookings"), \
             patch("services.availability_service.vietnam_now", return_value=self.now):
            cur = db.return_value.cursor.return_value
            cur.fetchone.return_value = Row(FieldID=1, FieldName="QA", FieldType="5", Location="QA", Status="AVAILABLE")
            cur.fetchall.side_effect = [[Row(FieldID=1, **slot) for slot in self.prices], []]
            response = app.test_client().get("/api/fields/1/availability?date=2026-11-15")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["AvailableCount"], 0)
            self.assertTrue(all(row["reason"] == "PAST_TIME" for row in response.json["Slots"]))

    def test_all_fields_counts_and_available_only_exclude_expired_slots(self):
        from test_field_type_filter import FieldTypeFilterTests
        fixture = FieldTypeFilterTests()
        fixture.setUp()
        try:
            with patch("services.availability_service.vietnam_now", return_value=datetime(2099, 1, 1, 23)):
                response = fixture.client.get("/api/fields/availability?date=2099-01-01")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json["AvailableFields"], 0)
                self.assertTrue(all(not row["HasAvailableSlot"] for row in response.json["Fields"]))
                response = fixture.client.get("/api/fields/availability?date=2099-01-01&availableOnly=true")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json["Fields"], [])
        finally:
            fixture.doCleanups()
