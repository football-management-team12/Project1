# T123-166: rejection requires a review note

The current UC07 service already rejects missing, null, empty and whitespace-only
notes before opening a database connection. This branch adds API regression
coverage and documents the contract; it does not change cancellation rules.

Use `POST /api/admin/cancellation-requests/{request_id}/decision` with an ADMIN
Bearer token. The ticket's `canonical-requests` spelling is not a valid route.

- `{"decision":"REJECTED","note":""}` (also omitted/null/whitespace):
  HTTP 400, `code=REVIEW_NOTE_REQUIRED`; no database access or state changes.
- Non-string notes or more than 500 trimmed characters: HTTP 400 `INVALID_TEXT`.
- A valid rejection stores the trimmed note and retains the booking status.
- APPROVED keeps the note optional; CUSTOMER/anonymous calls remain forbidden.

Run `python -m unittest discover -s tests/api -p test_cancellation_review.py`.
The tests use Flask, real JWT verification and mocked SQL, never a live database.
Staging retest should verify a PENDING_REVIEW request remains unchanged after a
400 and a valid rejection leaves its booking and successful payments unchanged.
