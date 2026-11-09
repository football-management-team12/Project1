# T123-165 — Remaining amount includes successful EXTRA receipts

For a 900,000 VND booking with DEPOSIT SUCCESS 300,000 and EXTRA SUCCESS 100,000,
UC09 previously ignored EXTRA and requested another 600,000. It now reports
paidAmount=400,000 and remainingAmount=500,000; final cash confirmation inserts
one FINAL_PAYMENT/CASH/SUCCESS for 500,000.

## Contract

- Paid = SUCCESS DEPOSIT + SUCCESS FINAL_PAYMENT + SUCCESS EXTRA **for this booking**.
- EXTRA is an already received credit against the existing booking total; this fix
  does not add a surcharge to TotalAmount or create an EXTRA payment endpoint.
- PENDING/FAILED/EXPIRED, other bookings and unknown payment types do not count.
- Refunds remain separately reported and do not erase original receipt history.
- Response fields extraAmount and finalPaymentAmount expose the contribution of
  each type; existing depositAmount/paidAmount/remainingAmount/status stay present.
- A successful EXTRA alone does not mark the method as final CASH or prevent the
  first final cash receipt. An existing positive FINAL_PAYMENT still blocks another
  final confirmation; settlement canConfirm now reflects that same condition.
- Zero/negative booking totals remain rejected: T123-161 is outside this change.
- Already overpaid or inconsistent invoice data returns 409 PAYMENT_MISMATCH or
  INVOICE_MISMATCH; this fix never edits/deletes existing financial records to hide
  historical overcollection. Such records require separate reconciliation.
- UC08 detail, UC09 settlement and UC12 list/detail all use the same calculation;
  UC12 payment-status filters also include EXTRA. UC12 cancellation remains blocked
  when the invoice has any recognized successful receipts.

No database migration required. No UC06 expiry, profile, field-filter or UC07
cancellation changes are included.

## Retest

1. On an isolated QA booking COMPLETED, create Total=900,000, DEPOSIT SUCCESS=300,000,
   EXTRA SUCCESS=100,000; use an issued invoice for the UC12 list fixture.
2. GET settlement, UC08 invoice and UC12 list/detail: Paid=400,000, Remaining=500,000,
   PARTIALLY_PAID. ADMIN settlement canConfirm=true if all UC09 preconditions hold.
3. ADMIN confirms final cash once: response amount=500,000; SQL contains exactly one
   FINAL_PAYMENT CASH SUCCESS 500,000 and Invoice PAID/PaidAmount=900,000.
4. Refresh all views: Paid=900,000, Remaining=0, PAID; repeat confirmation returns 409.
5. Repeat with failed/pending/expired EXTRA, multiple EXTRA, another booking's EXTRA,
   EXTRA covering the balance, existing partial FINAL_PAYMENT and overpaid fixtures.
6. Record before/after SQL, request/response with tokens hidden, environment/build,
   Actual vs Expected and evidence. Test simultaneous confirmations independently.

Validation: 56 isolated API/SQL-aggregation regression tests and 2 health tests pass.
The regression executes aggregation SQL on an in-memory SQLite fixture and verifies
the actual UC09 INSERT amount through Flask/JWT with SQL mocks. Additional real SQL
Server read-only CTE checks are saved in T123-165-sql-readonly.json. No live cash
confirmation or concurrency mutation was performed against existing customer data.

Run:

```powershell
.\backend\venv\Scripts\python.exe -m unittest discover -s tests/api -p 'test_[a-z]*.py'
.\backend\venv\Scripts\python.exe backend/scripts/verify_t123_165_readonly.py
```
