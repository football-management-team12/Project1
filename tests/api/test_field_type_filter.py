"""T123-104: public list/availability filtering with SQL fixtures, no live DB."""
import sys
import unittest
from datetime import date, time
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import patch
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from flask import Flask
from routes.field import field_bp


class FieldTypeFilterTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(field_bp, url_prefix="/api/fields")
        self.client = app.test_client()
        db = patch("routes.field.get_connection")
        self.db = db.start()
        self.addCleanup(db.stop)
        expiry = patch("routes.field.expire_pending_bookings")
        expiry.start()
        self.addCleanup(expiry.stop)
        self.conn = self.db.return_value
        self.cursor = self.conn.cursor.return_value
        self.fields = [Row(FieldID=i, FieldName=f"Field {i}", FieldType=kind,
                           Location="Test", Image=None, Status=status,
                           StartTime=time(18), EndTime=time(19), Price=100000)
                       for i, kind, status in ((1, "5 player", "AVAILABLE"), (2, "7 player", "AVAILABLE"),
                                               (3, "11 player", "AVAILABLE"), (4, "5", "MAINTENANCE"),
                                               (5, "5 player", "AVAILABLE"))]
        self.last_sql = ""
        self.params = ()
        def execute(sql, *params):
            self.last_sql, self.params = sql, params
            return self.cursor
        self.cursor.execute.side_effect = execute
        def fetchall():
            sql = self.last_sql
            if "FROM FootballFields" in sql:
                self.assertIn("IsArchived = 0", sql)
                if self.params:
                    self.assertIn("IN (?, ?)", sql)
                    return [r for r in self.fields if r.FieldType in self.params]
                return self.fields
            if "FROM FieldPrices" in sql:
                return [Row(PriceID=r.FieldID, FieldID=r.FieldID, StartTime=time(18),
                            EndTime=time(19), Price=100000) for r in self.fields]
            if "FROM Bookings" in sql:
                # Field 5 is fully booked, unlike field 1.
                return [Row(BookingID=10, UserID=1, FieldID=5, BookingDate=date(2099, 1, 1),
                            StartTime=time(18), EndTime=time(19), TotalAmount=100000,
                            Status="CONFIRMED", CreatedAt=None)]
            raise AssertionError(f"Unexpected SQL: {sql}")
        self.cursor.fetchall.side_effect = fetchall

    def test_list_supports_all_types_and_aliases_with_bound_parameters(self):
        for key in ("FieldType", "fieldType"):
            for value, expected in (("5 player", [1, 4, 5]), ("5", [1, 4, 5]),
                                    (" 7 PLAYER ", [2]), ("11", [3])):
                with self.subTest(key=key, value=value):
                    response = self.client.get("/api/fields/?" + urlencode({key: value}))
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual([r["FieldID"] for r in response.get_json()], expected)
                    self.assertEqual(len(self.params), 2)
                    self.assertNotIn(value, self.last_sql)

    def test_no_filter_preserves_all_and_no_match_is_empty(self):
        self.assertEqual(len(self.client.get("/api/fields/").get_json()), 5)
        self.fields = []
        response = self.client.get("/api/fields/?FieldType=7")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), [])

    def test_invalid_filters_fail_before_database(self):
        for query in ("FieldType=6", "FieldType=", "FieldType=5%27+OR+1%3D1--",
                      "FieldType=5&FieldType=7", "FieldType=5&fieldType=7"):
            for endpoint in ("/api/fields/", "/api/fields/availability"):
                with self.subTest(query=query, endpoint=endpoint):
                    self.assertEqual(self.client.get(endpoint + "?date=2099-01-01&" + query).status_code, 400)
        self.db.assert_not_called()

    def test_availability_type_and_available_only_filters_recalculate_counts(self):
        for query, ids, available, unavailable in (("FieldType=5", [1, 4, 5], 1, 2),
                                                  ("FieldType=5&availableOnly=true", [1], 1, 0),
                                                  ("fieldType=7&availableOnly=true", [2], 1, 0),
                                                  ("FieldType=11&availableOnly=false", [3], 1, 0)):
            with self.subTest(query=query):
                response = self.client.get("/api/fields/availability?date=2099-01-01&" + query)
                self.assertEqual(response.status_code, 200)
                body = response.get_json()
                self.assertEqual([r["FieldID"] for r in body["Fields"]], ids)
                self.assertEqual(body["TotalFields"], len(ids))
                self.assertEqual(body["AvailableFields"], available)
                self.assertEqual(body["UnavailableFields"], unavailable)

    def test_empty_availability_and_invalid_available_flag(self):
        self.fields = []
        body = self.client.get("/api/fields/availability?date=2099-01-01&FieldType=5&availableOnly=true").get_json()
        self.assertEqual(body["Fields"], [])
        self.assertEqual(body["TotalFields"], 0)
        self.db.reset_mock()
        for query in ("availableOnly=1", "availableOnly=true&availableOnly=false"):
            self.assertEqual(self.client.get("/api/fields/availability?date=2099-01-01&" + query).status_code, 400)
        self.db.assert_not_called()


if __name__ == "__main__":
    unittest.main()
