"""Prepayment does not change the cancellation deadline or destroy receipts."""
import os
import sys
import unittest
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from services.cancellation_service import PaymentSummary, _payment_summary, _rule_violation, confirm_deposit_refund


class PrepaidCancellationTests(unittest.TestCase):
    def test_full_prepayment_has_same_two_hour_deadline(self):
        booking=Row(Status="CONFIRMED",BookingDate="2026-11-16",StartTime="06:00")
        self.assertIsNone(_rule_violation("CUSTOMER",booking,datetime(2026,11,16,3,59,59),final_paid=True))
        self.assertEqual(_rule_violation("CUSTOMER",booking,datetime(2026,11,16,4),final_paid=True)[0],"CANCELLATION_DEADLINE_PASSED")

    def test_payment_summary_keeps_deposit_separate_from_total(self):
        cur=MagicMock();cur.fetchone.return_value=(Decimal(100),1,Decimal(400))
        result=_payment_summary(cur,10)
        self.assertEqual(tuple(result),(Decimal(100),True))
        self.assertEqual(result.total_paid,Decimal(400))

    def test_refund_whole_prepayment_but_only_excess_for_no_show(self):
        for attendance,expected in ((None,Decimal(400)),("NO_SHOW",Decimal(300))):
            with patch("services.cancellation_service.get_connection") as db, \
                 patch("services.cancellation_service._check_actor",return_value="ADMIN"), \
                 patch("services.cancellation_service._get_booking",return_value=Row(Status="CANCELLED",AttendanceState=attendance)), \
                 patch("services.cancellation_service._payment_summary",return_value=PaymentSummary(Decimal(100),True,Decimal(400))), \
                 patch("services.cancellation_service._validate_refund_evidence",return_value=("QA",b"QA","application/pdf","proof.pdf")):
                cur=db.return_value.cursor.return_value;cur.fetchone.return_value=None
                result=confirm_deposit_refund(1,10,{})
                self.assertEqual(result["refundedAmount"],float(expected))
                insert=next(call for call in cur.execute.call_args_list if "INSERT INTO dbo.BookingDepositRefunds" in call.args[0])
                self.assertEqual(insert.args[2],expected)
                self.assertFalse(any("UPDATE Payments" in call.args[0] for call in cur.execute.call_args_list))
                db.return_value.commit.assert_called_once()
