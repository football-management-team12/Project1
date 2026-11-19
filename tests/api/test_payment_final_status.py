"""T123-163: complete app routing, canonical/trailing slash and terminal-state errors."""
import os
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"backend"))
from app import app
from services.jwt_service import create_access_token


class PaymentFinalStatusTests(unittest.TestCase):
    def setUp(self):
        env=patch.dict(os.environ,{"JWT_SECRET":"t123-163-test-only","PAYMENT_DEMO_MODE":"true"})
        env.start()
        self.addCleanup(env.stop)
        self.client=app.test_client()
        self.conn=MagicMock()
        self.cur=self.conn.cursor.return_value
        db=patch("services.payment_service.get_connection",return_value=self.conn)
        db.start()
        self.addCleanup(db.stop)
        self.actor=Row(UserID=1,Role="CUSTOMER",Status="ACTIVE")
        self.paths=("/api/payments/19/demo-status","/api/payments/19/demo-status/")

    def row(self,status="SUCCESS"):
        now=datetime(2026,11,10,4)
        return Row(PaymentID=19,BookingID=10,PaymentType="DEPOSIT",PaymentMethod="VIETQR",Amount=200000,
                   Status=status,Reference="QA-19",Deadline=now+timedelta(minutes=10),CreatedAt=now,UpdatedAt=now,
                   BookingStatus="CONFIRMED",BookingTotalAmount=600000)

    def request(self,path,status="FAILED",role="CUSTOMER"):
        return self.client.patch(path,json={"status":status},headers={"Authorization":"Bearer "+create_access_token(1,role)})

    def assert_no_mutations(self):
        self.conn.commit.assert_not_called()
        self.assertFalse(any(c.args[0].lstrip().upper().startswith(("UPDATE","INSERT","DELETE")) for c in self.cur.execute.call_args_list))

    def test_success_to_failed_returns_json_conflict_for_both_url_forms(self):
        for path in self.paths:
            self.conn.reset_mock()
            self.cur.fetchone.side_effect=[self.actor,self.row()]
            response=self.request(path)
            self.assertEqual(response.status_code,409)
            self.assertTrue(response.is_json)
            self.assertEqual(response.json["code"],"PAYMENT_ALREADY_FINAL")
            self.assertIn("SUCCESS",response.json["message"])
            self.assert_no_mutations()
            self.conn.rollback.assert_called_once()

    def test_final_state_matrix_remains_conflict(self):
        for current,target in (("SUCCESS","EXPIRED"),("FAILED","SUCCESS"),("EXPIRED","FAILED")):
            self.cur.fetchone.side_effect=[self.actor,self.row(current)]
            response=self.request(self.paths[1],target)
            self.assertEqual(response.status_code,409)
            self.assertEqual(response.json["code"],"PAYMENT_ALREADY_FINAL")
        self.assert_no_mutations()

    def test_missing_or_other_owners_payment_stays_json_404(self):
        for path in self.paths:
            self.cur.fetchone.side_effect=[self.actor,None]
            response=self.request(path)
            self.assertEqual(response.status_code,404)
            self.assertTrue(response.is_json)
            self.assertEqual(response.json["code"],"PAYMENT_NOT_FOUND")
            query=self.cur.execute.call_args.args
            self.assertIn("B.UserID = ?",query[0])
            self.assertEqual(query[1:],(19,1))
        self.assert_no_mutations()

    def test_role_and_missing_token_are_checked_on_both_forms(self):
        for path in self.paths:
            self.assertEqual(self.client.patch(path,json={"status":"FAILED"}).status_code,401)
            for role in ("ADMIN","STAFF"):
                self.assertEqual(self.request(path,role=role).status_code,403)
        self.conn.cursor.assert_not_called()

    def test_same_success_is_idempotent_without_rewriting_payment(self):
        self.cur.fetchone.side_effect=[self.actor,self.row()]
        response=self.request(self.paths[1],"SUCCESS")
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json["payment"]["status"],"SUCCESS")
        self.conn.commit.assert_called_once()
        self.assertFalse(any(c.args[0].lstrip().upper().startswith(("UPDATE","INSERT","DELETE")) for c in self.cur.execute.call_args_list))

    def test_demo_disabled_still_returns_forbidden(self):
        with patch.dict(os.environ,{"PAYMENT_DEMO_MODE":"false"}):
            response=self.request(self.paths[1])
        self.assertEqual(response.status_code,403)
        self.assertEqual(response.json["code"],"PAYMENT_DEMO_DISABLED")
        self.conn.cursor.assert_not_called()


if __name__=="__main__":
    unittest.main()
