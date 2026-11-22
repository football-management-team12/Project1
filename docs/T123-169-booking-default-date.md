# T123-169: default booking date and book action

Latest develop already initializes the field list to Vietnam today and protects
past slots. This change completes the default-date flow:

- A direct `/booking?fieldId=1` link without `date` now loads today's availability
  instead of rendering an empty date. A supplied URL date remains authoritative.
- The field list derives its untouched default from the existing server-synced
  business clock. It updates after clock synchronization or Vietnam midnight and
  requests availability for that date. A manually selected date stays selected.
- Resetting field filters resumes today's default. Clearing the Booking date
  resets to Vietnam today; clearing the field-list date retains its existing
  explicit empty-date behavior.
- Existing loading, availability, login, maintenance and past-time guards remain
  in place. This does not enable a field without a verified free future slot.

Vietnam time (`Asia/Ho_Chi_Minh`) is the established booking business timezone;
the default is not derived from a UTC date or the browser's local timezone.
No API, database, payment or deployment changes are included.

## Validation

- Frontend production build passed.
- `node tests/booking_default_date_browser_check.mjs`: 9 browser scenarios passed
  in Edge, with UTC browser timezone, yesterday's device clock and a controlled
  Vietnam server clock. Covers clock sync, midnight, manual selection, pending
  availability, guest redirect, direct Booking, date clearing, mobile booking
  and API failure. All API calls are intercepted GET fixtures; no bookings or
  accounts are created.
- Existing `node tests/past_booking_browser_check.mjs`: 5 past-slot scenarios
  passed, including an already selected slot becoming unavailable at start time.
- Node syntax and `git diff --check` passed. FieldList targeted lint is clean.
  Booking has one pre-existing `react-hooks/set-state-in-effect` error in the
  availability-loading effect. The unmodified develop version has two errors;
  the removed date-sync effect accounts for the other. Do not report lint green.

Evidence: [results](T123-169-evidence/checks.json),
[desktop](T123-169-evidence/desktop-default-date.png),
[mobile](T123-169-evidence/mobile-default-date.png).

Start Vite on port 5188 before running either browser script. Browser screenshots
use synthetic fields and dates, not live SQL records. Staging retest should verify
the deployed build, `/api/time`, current date, free/fully booked/MAINTENANCE fields,
login redirect and direct `/booking?fieldId=...` without a date.
