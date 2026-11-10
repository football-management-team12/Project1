"""ADMIN-only reply/inbox contracts and public/private reply visibility."""
import os
import sys
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock,patch
import pyodbc

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"backend"))
from app import app
from services.jwt_service import create_access_token
from services.review_reply_service import replies_for


class ReviewReplyTests(unittest.TestCase):
    def setUp(self):
        env=patch.dict(os.environ,{"JWT_SECRET":"uc10-admin-reply-test"});env.start();self.addCleanup(env.stop)
        self.conn=MagicMock();self.cur=self.conn.cursor.return_value
        db=patch("services.review_reply_service.get_connection",return_value=self.conn);db.start();self.addCleanup(db.stop)
        self.client=app.test_client();self.admin=Row(Role="ADMIN",Status="ACTIVE")
        self.now=datetime(2026,11,11,4)
        self.reply=Row(ReviewID=30,Comment="Cảm ơn bạn",CreatedAt=self.now,UpdatedAt=self.now,AdminUserID=3)

    def headers(self,role="ADMIN"):
        return {"Authorization":"Bearer "+create_access_token(3,role)}

    def put(self,payload=None):
        return self.client.put("/api/admin/reviews/30/reply",json={"comment":"Cảm ơn bạn"} if payload is None else payload,headers=self.headers())

    def test_admin_create_reply_identity_from_token(self):
        self.cur.fetchone.side_effect=[self.admin,Row(ReviewID=30),None,self.reply]
        response=self.put({"comment":"  Cảm ơn bạn  ","adminUserId":999})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json["reply"]["comment"],"Cảm ơn bạn")
        self.assertNotIn("adminUserId",response.json["reply"])
        insert=[c.args for c in self.cur.execute.call_args_list if c.args[0].lstrip().startswith("INSERT")][0]
        self.assertEqual(insert[1:],(30,3,"Cảm ơn bạn"))
        self.conn.commit.assert_called_once()

    def test_update_one_reply_instead_of_duplicating(self):
        self.cur.fetchone.side_effect=[self.admin,Row(ReviewID=30),Row(ReviewID=30),self.reply]
        self.assertEqual(self.put().status_code,200)
        self.assertTrue(any(c.args[0].lstrip().startswith("UPDATE dbo.BookingReviewReplies") for c in self.cur.execute.call_args_list))
        self.assertFalse(any(c.args[0].lstrip().startswith("INSERT") for c in self.cur.execute.call_args_list))

    def test_customer_staff_and_missing_token_blocked(self):
        for role in ("CUSTOMER","STAFF"):
            self.assertEqual(self.client.put("/api/admin/reviews/30/reply",json={},headers=self.headers(role)).status_code,403)
            self.assertEqual(self.client.get("/api/admin/reviews",headers=self.headers(role)).status_code,403)
        self.assertEqual(self.client.get("/api/admin/reviews").status_code,401)
        self.conn.cursor.assert_not_called()

    def test_active_database_role_rechecked(self):
        for actor in (Row(Role="ADMIN",Status="INACTIVE"),Row(Role="CUSTOMER",Status="ACTIVE"),None):
            self.cur.fetchone.side_effect=[actor]
            self.assertEqual(self.put().status_code,403)
        self.conn.commit.assert_not_called()

    def test_missing_review_404(self):
        self.cur.fetchone.side_effect=[self.admin,None]
        response=self.put();self.assertEqual(response.status_code,404)
        self.assertEqual(response.json["code"],"REVIEW_NOT_FOUND")
        self.conn.commit.assert_not_called()

    def test_invalid_reply_body_and_length(self):
        for payload in ([],{"comment":""},{"comment":"  "},{"comment":"x"*1001},{"comment":99}):
            self.assertEqual(self.put(payload).status_code,400)
        self.conn.cursor.assert_not_called()

    def test_inbox_filter_and_summary(self):
        self.cur.fetchone.side_effect=[self.admin,(12,5),(2,)]
        self.cur.fetchall.return_value=[Row(ReviewID=30,BookingID=10,FieldID=5,Rating=1,Comment="QA",CreatedAt=self.now,
                                           FullName="QA Customer",FieldName="QA Field",ReplyComment=None)]
        response=self.client.get("/api/admin/reviews?status=unanswered&rating=1&page=2&pageSize=1",headers=self.headers())
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json["unansweredCount"],5)
        self.assertEqual(response.json["items"][0]["customerName"],"QA Customer")
        self.assertIn("A.ReviewID IS NULL",self.cur.execute.call_args.args[0])
        self.assertEqual(self.cur.execute.call_args.args[1:],(1,1,1))
        self.conn.commit.assert_not_called()

    def test_invalid_filters(self):
        for query in ("status=no","page=0","rating=6","pageSize=51","page=-1","rating=1.5"):
            self.assertEqual(self.client.get("/api/admin/reviews?"+query,headers=self.headers()).status_code,400)
        self.conn.cursor.assert_not_called()

    def test_missing_optional_migration_does_not_break_customer_reader(self):
        self.cur.fetchone.return_value=(None,)
        self.assertEqual(replies_for(self.cur,[30]),{})
        self.assertEqual(self.cur.execute.call_count,1)

    def test_reply_map_exposes_no_admin_identity(self):
        self.cur.fetchone.return_value=(42,);self.cur.fetchall.return_value=[self.reply]
        result=replies_for(self.cur,[30])
        self.assertEqual(result[30]["comment"],"Cảm ơn bạn")
        self.assertNotIn("AdminUserID",str(result))
        self.assertEqual(self.cur.execute.call_args.args[1:],(30,))

    def test_public_and_owned_review_include_reply(self):
        db=patch("services.review_service.get_connection",return_value=self.conn)
        review=Row(ReviewID=30,BookingID=10,FieldID=5,Rating=5,Comment="QA",CreatedAt=self.now)
        with db:
            self.cur.fetchone.side_effect=[Row(FieldID=5,FieldName="QA"),(1,5),(42,)]
            self.cur.fetchall.side_effect=[[review],[self.reply]]
            response=self.client.get("/api/fields/5/reviews")
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json["items"][0]["reply"]["comment"],"Cảm ơn bạn")
            self.assertNotIn("adminUserId",str(response.json))
            self.cur.fetchone.side_effect=[Row(Role="CUSTOMER",Status="ACTIVE"),Row(BookingID=10,UserID=3,FieldID=5,Status="COMPLETED"),review,(42,)]
            self.cur.fetchall.side_effect=[[self.reply]]
            response=self.client.get("/api/bookings/10/reviews",headers=self.headers("CUSTOMER"))
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json["review"]["reply"]["comment"],"Cảm ơn bạn")

    def test_commit_failure_rolls_back(self):
        self.cur.fetchone.side_effect=[self.admin,Row(ReviewID=30),None,self.reply]
        self.conn.commit.side_effect=RuntimeError("QA failure")
        with self.assertLogs(app.logger,level="ERROR"): response=self.put()
        self.assertEqual(response.status_code,500)
        self.conn.rollback.assert_called_once()

    def test_admin_missing_reply_migration_is_503(self):
        self.cur.fetchone.side_effect=[self.admin]
        self.cur.execute.side_effect=[None,pyodbc.ProgrammingError("42S02","Invalid object name dbo.BookingReviewReplies")]
        response=self.client.get("/api/admin/reviews",headers=self.headers())
        self.assertEqual(response.status_code,503)
        self.assertNotIn("dbo.",response.get_data(as_text=True))


if __name__=="__main__":unittest.main()
