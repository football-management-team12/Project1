# UC08 / T123-63 — Invoice view

Both `GET /api/invoices/{invoiceId}` and `GET /api/bookings/{bookingId}/invoice`
require a valid JWT and an active CUSTOMER or ADMIN account checked in SQL Server.
CUSTOMER can view only their own booking; another owner's invoice returns 403.
Missing booking/invoice returns 404. Booking lookup returns a provisional invoice after a successful deposit even without an Invoices row (`invoiceId: null`, `isProvisional: true`). Before a successful deposit, a booking without an issued invoice returns 404.
GET never issues an invoice or changes payment data. Invalid/expired JWT returns
401; inconsistent amounts return 409; unavailable database returns 500.

The canonical response matches T123-63: `field: {fieldId, fieldName, fieldType,
location}` and `paymentStatus`. The previous flat field properties and `status`
remain as compatibility aliases; the invoice UI uses the canonical properties.

The existing SQL model uses `Invoices.InvoiceID`, `BookingID`, `Amount`,
`PaidAmount`, `PaymentStatus`, `CreatedDate`; `Bookings.TotalAmount` stores the
booked price. UC08 reuses UC09's Decimal arithmetic and consistency checks:
only successful DEPOSIT and FINAL_PAYMENT records count toward paid amount.
UNPAID means zero paid; PARTIALLY_PAID means paid below total; PAID means zero
remaining. Failed/pending payments do not count. Current field prices are never
used to recalculate historical bookings. No migration is needed or included.

The field join does not filter archived/inactive fields. UC07 refunds are shown
separately from original receipts, preserving payment history. Cancelled bookings
do not offer settlement actions. No UC06/UC07/UC09/UC15 service is modified.

Frontend: `/invoices/:invoiceId` or `/bookings/:bookingId/invoice`, accessible
from Booking Detail, Booking History and ADMIN booking detail. Loading, missing
invoice, errors, retry and back navigation are handled. Remaining payment uses
the existing UC09 SettlementPanel; customers see cash-payment instructions and
ADMIN can confirm only under UC09's existing rules.

ADMIN uses `/admin/bookings/:bookingId/invoice` or `/admin/invoices/:invoiceId`
inside AdminLayout, retaining the sidebar and management header. These routes
require ADMIN, excluding STAFF. ADMIN opening a shared invoice URL is redirected
to the corresponding admin route. CUSTOMER retains the public-site navigation.

## Verification

- `npm.cmd run build` in `frontend`.
- `python -m unittest discover -s tests/api -v` and
  `python -m unittest discover -s tests -v` from root.
- `python -m compileall -q backend tests`.
- Import `postman/UC08.postman_collection.json`; supply tokens and IDs of
  existing test fixtures. It contains GET requests only and no secrets.
- `python backend/scripts/verify_uc08_readonly.py` inspects live schema and
  independently reconciles SQL aggregates against service results. It performs
  SELECT only, prints no credentials or customer details, and creates no data.
  Run against an authorized test database with existing invoices in all three
  payment states. Verify archived fields using an existing archived-field booking.

Latest verification: 16 Python tests passed, including JWT, ownership, both
endpoints/roles, three payment states, refunds and SELECT-only checks. Live SQL
verification succeeds outside the restricted sandbox: 12 booking/invoice views
reconcile (8 provisional PARTIALLY_PAID, 4 issued PAID), with zero conflicts.
83 API checks through a Flask test client against real SQL passed, including
ADMIN/owner access, foreign-owner 403, missing/invalid JWT 401 and not-found 404.
See `uc08-verification.json` for actual responses and independent SQL totals.
The database currently has no issued UNPAID/PARTIALLY_PAID invoices and none of
the selected fields is archived. Those cases use automated mock fixtures;
live fixture coverage remains a tester handoff item. No rows were created.

Eleven browser checks passed, with screenshots in `uc08-evidence/`: public and
ADMIN invoice layouts, provisional/paid/unpaid, mobile widths, and 404 handling.
The browser replays SQL response evidence locally; UNPAID/404 are synthetic.
It never forwards API requests or uses real credentials. Run with Vite running:
`node tests/invoice_browser_check.mjs` (requires Edge or `UC08_BROWSER`).
`uc08-evidence/ui-checks.json` records each fixture source and result.

Legacy-response regression: the invoice API adapter accepts both nested `field`
and previous flat field properties, and both `paymentStatus` and `status`.
This fixes a reproduced blank page when a running backend returns the previous
contract. CUSTOMER paid/provisional and ADMIN paid legacy responses, plus null
field metadata, now render correctly without recalculating monetary values.

Build, targeted ESLint, Python compilation and Swagger/Postman parsing pass.
Full-project lint has known pre-existing errors. Postman has been updated but
Newman against a live HTTP API with tester-owned tokens remains unexecuted.
The SQL-backed API evidence above uses Flask test client, not a running server.

To reproduce SQL/API evidence without mutation:
`python backend/scripts/verify_uc08_readonly.py --evidence docs/uc08-verification.json`.
Use `uc08-reconciliation.sql` for independent manual SELECT reconciliation.
After backend code changes, restart the local backend if DEBUG/reload is off;
restarting Vite alone does not reload Python modules.

Provisional invoice update: booking lookup now shows successful deposit, paid amount and remaining balance without issuing an invoice or changing UC06/UC09. Invoice-ID lookup still requires an issued invoice. The frontend clearly labels the provisional view and does not invent an invoice number or issue date.
