"""UC10 isolated HTTP contracts; no real customer/database changes."""
import os
import sys
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

import pyodbc

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from app import app
from services.jwt_service import create_access_token


class ReviewTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"JWT_SECRET": "uc10-isolated-only"})
        env.start()
        self.addCleanup(env.stop)
        self.conn = MagicMock()
        self.cur = self.conn.cursor.return_value
        db = patch("services.review_service.get_connection", return_value=self.conn)
        db.start()
        self.addCleanup(db.stop)
        self.client = app.test_client()
        self.actor = Row(Role="CUSTOMER", Status="ACTIVE")
        self.booking = Row(BookingID=10, UserID=1, FieldID=5, Status="COMPLETED")
        self.review = Row(ReviewID=30, BookingID=10, FieldID=5, Rating=5,
                          Comment="Sân tốt", CreatedAt=datetime(2026,11,10,4))
        self.path = "/api/bookings/10/reviews"

    def headers(self, role="CUSTOMER"):
        return {"Authorization":"Bearer " + create_access_token(1,role)}

    def post(self, payload=None, **kwargs):
        return self.client.post(self.path, json={"rating":5,"comment":"Sân tốt"} if payload is None else payload,
                                headers=self.headers(), **kwargs)

    def seed(self, existing=None, result=None):
        self.cur.fetchone.side_effect = [self.actor, self.booking, existing, result or self.review]

    def test_success_owner_completed_and_server_derived_identity(self):
        self.seed()
        response = self.post({"rating":5,"comment":"  Sân tốt  ","userId":999,"fieldId":888,"bookingId":77})
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.json["createdAt"],"2026-11-10T04:00:00Z")
        self.assertEqual(response.json["bookingId"],10)
        self.assertEqual(response.json["fieldId"],5)
        insert = [c for c in self.cur.execute.call_args_list if "INSERT INTO" in c.args[0]][0]
        self.assertEqual(insert.args[1:],(10,1,5,5,"Sân tốt"))
        self.assertTrue(any("UPDLOCK,HOLDLOCK" in c.args[0] for c in self.cur.execute.call_args_list))
        self.conn.commit.assert_called_once()
        self.assertFalse(any("UPDATE" == c.args[0].lstrip().split()[0] for c in self.cur.execute.call_args_list))

    def test_rating_boundaries_and_comment_length(self):
        for rating in (1,5):
            self.seed(result=Row(**{**vars(self.review),"Rating":rating,"Comment":"x"*1000}))
            self.assertEqual(self.post({"rating":rating,"comment":"x"*1000}).status_code,201)

    def test_invalid_rating_types_and_bounds_rejected_before_database(self):
        for rating in (0,6,-1,1.5,5.0,True,"5",None,[],{}):
            response=self.post({"rating":rating,"comment":"Valid"})
            self.assertEqual(response.status_code,400, rating)
            self.assertEqual(response.json["code"],"INVALID_RATING")
        self.conn.cursor.assert_not_called()

    def test_invalid_comments_and_utf16_limit(self):
        for comment in ("", "   ", "\n\t", "x"*1001, None, {}, 99, "bad\x00text", "😀"*501, "bad\ud800text"):
            response=self.post({"rating":5,"comment":comment})
            self.assertEqual(response.status_code,400)
            self.assertEqual(response.json["code"],"INVALID_COMMENT")
        self.conn.cursor.assert_not_called()

    def test_non_object_and_malformed_json(self):
        for payload in ([],"text",42,False):
            self.assertEqual(self.post(payload).json["code"],"INVALID_BODY")
        response=self.client.post(self.path,data="{broken",content_type="application/json",headers=self.headers())
        self.assertEqual(response.status_code,400)
        self.conn.cursor.assert_not_called()

    def test_missing_invalid_token_and_wrong_jwt_role(self):
        self.assertEqual(self.client.post(self.path,json={}).status_code,401)
        self.assertEqual(self.client.post(self.path,json={},headers={"Authorization":"Bearer invalid"}).status_code,401)
        for role in ("ADMIN","STAFF"):
            self.assertEqual(self.client.post(self.path,json={},headers=self.headers(role)).status_code,403)
        self.conn.cursor.assert_not_called()

    def test_inactive_or_role_changed_in_database(self):
        for actor in (Row(Role="CUSTOMER",Status="INACTIVE"), Row(Role="ADMIN",Status="ACTIVE"), None):
            self.cur.fetchone.side_effect=[actor]
            self.assertEqual(self.post().status_code,403)
        self.conn.commit.assert_not_called()

    def test_other_owner_returns_403_and_missing_booking_404(self):
        self.cur.fetchone.side_effect=[self.actor,Row(**{**vars(self.booking),"UserID":2})]
        self.assertEqual(self.post().json["code"],"BOOKING_NOT_OWNED")
        self.cur.fetchone.side_effect=[self.actor,None]
        self.assertEqual(self.post().status_code,404)
        self.conn.commit.assert_not_called()

    def test_pending_confirmed_cancelled_are_ineligible(self):
        for status in ("PENDING","CONFIRMED","CANCELLED"):
            self.cur.fetchone.side_effect=[self.actor,Row(**{**vars(self.booking),"Status":status})]
            response=self.post()
            self.assertEqual(response.status_code,409)
            self.assertEqual(response.json["code"],"BOOKING_NOT_COMPLETED")
        self.conn.commit.assert_not_called()

    def test_duplicate_review_does_not_insert(self):
        self.seed(existing=self.review)
        response=self.post()
        self.assertEqual(response.status_code,409)
        self.assertEqual(response.json["code"],"REVIEW_ALREADY_EXISTS")
        self.conn.commit.assert_not_called()
        self.assertFalse(any("INSERT INTO" in c.args[0] for c in self.cur.execute.call_args_list))

    def test_unique_key_race_is_conflict_and_rollback(self):
        self.seed()
        def execute(sql,*args):
            if "INSERT INTO" in sql: raise pyodbc.IntegrityError("23000","2627 UQ_BookingReviews_Booking")
        self.cur.execute.side_effect=execute
        self.assertEqual(self.post().status_code,409)
        self.conn.rollback.assert_called_once()
        self.conn.commit.assert_not_called()

    def test_commit_failure_rolls_back_and_never_reports_success(self):
        self.seed()
        self.conn.commit.side_effect=pyodbc.OperationalError("QA commit failed")
        with self.assertLogs(app.logger,level="ERROR"):
            response=self.post()
        self.assertEqual(response.status_code,500)
        self.assertEqual(response.json["code"],"REVIEW_ERROR")
        self.conn.rollback.assert_called_once()
        self.assertNotIn("QA commit",response.get_data(as_text=True))

    def test_get_own_review_eligibility_without_mutation(self):
        for status, existing, can_review in (("COMPLETED",None,True),("COMPLETED",self.review,False),("PENDING",None,False)):
            self.cur.fetchone.side_effect=[self.actor,Row(**{**vars(self.booking),"Status":status}),existing]
            response=self.client.get(self.path,headers=self.headers())
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json["canReview"],can_review)
        self.conn.commit.assert_not_called()
        self.assertFalse(any("INSERT INTO" in c.args[0] for c in self.cur.execute.call_args_list))

    def test_field_public_list_correct_filter_pagination_no_private_identity(self):
        self.cur.fetchone.side_effect=[Row(FieldID=5,FieldName="QA Field"),(11,4.5)]
        self.cur.fetchall.return_value=[self.review]
        response=self.client.get("/api/fields/5/reviews?page=2&pageSize=10")
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json["totalPages"],2)
        self.assertEqual(response.json["averageRating"],4.5)
        self.assertEqual(response.json["items"][0]["comment"],"Sân tốt")
        self.assertNotIn("bookingId",response.json["items"][0])
        self.assertNotIn("userId",response.json["items"][0])
        self.assertNotIn("email",response.get_data(as_text=True).lower())
        self.assertEqual(self.cur.execute.call_args.args[1:],(5,10,10))
        self.assertIn("B.Status='COMPLETED'",self.cur.execute.call_args.args[0])
        self.conn.commit.assert_not_called()

    def test_empty_field_list(self):
        self.cur.fetchone.side_effect=[Row(FieldID=5,FieldName="QA"),(0,None)]
        self.cur.fetchall.return_value=[]
        response=self.client.get("/api/fields/5/reviews")
        self.assertEqual(response.json["items"],[])
        self.assertIsNone(response.json["averageRating"])

    def test_field_missing_or_archived(self):
        self.cur.fetchone.return_value=None
        self.assertEqual(self.client.get("/api/fields/5/reviews").status_code,404)
        self.assertIn("IsArchived=0",self.cur.execute.call_args.args[0])

    def test_pagination_validation_before_database(self):
        for query in ("page=0","page=-1","page=1.5","page=abc","page=1000001","page=99999999999","pageSize=0","pageSize=51"):
            response=self.client.get("/api/fields/5/reviews?"+query)
            self.assertEqual(response.status_code,400)
        self.conn.cursor.assert_not_called()

    def test_invalid_sql_int_ids_are_400_before_database(self):
        for value in (0,2147483648):
            self.assertEqual(self.client.get(f"/api/fields/{value}/reviews").status_code,400)
            self.assertEqual(self.client.get(f"/api/bookings/{value}/reviews",headers=self.headers()).status_code,400)
        self.conn.cursor.assert_not_called()

    def test_oversized_request_is_413(self):
        self.assertEqual(self.post({"rating":5,"comment":"x"*20000}).status_code,413)
        self.conn.cursor.assert_not_called()

    def test_missing_migration_returns_503_without_sql_details(self):
        self.cur.fetchone.side_effect=[self.actor,self.booking]
        self.cur.execute.side_effect=[None,None,None,pyodbc.ProgrammingError("42S02","Invalid object name dbo.BookingReviews")]
        response=self.post()
        self.assertEqual(response.status_code,503)
        self.assertEqual(response.json["code"],"REVIEWS_NOT_READY")
        self.assertNotIn("dbo.",response.get_data(as_text=True))

    def test_xss_text_kept_as_data_and_parameterized(self):
        comment="<script>alert(1)</script> ' OR 1=1 --"
        self.seed(result=Row(**{**vars(self.review),"Comment":comment}))
        response=self.post({"rating":5,"comment":comment})
        self.assertEqual(response.status_code,201)
        sql=self.cur.execute.call_args.args
        self.assertNotIn(comment,sql[0])
        self.assertEqual(sql[-1],comment)


if __name__ == "__main__": unittest.main()
