# T123-98: invalid email returns HTTP 400 and a specific message

`user@` is rejected with `Email không đúng định dạng, vui lòng nhập lại`.
Login now exposes that message at the top level as well as in `errors.email`,
so the existing frontend API error handling displays it instead of a generic
login validation message. Registration and profile updates use the same text.

The legacy login `email` field requires email syntax; it no longer falls through
to username/phone validation. The `account` field continues to accept all three
identifier types. Successful authentication and JWT creation are unchanged.

Run `python -m unittest discover -s tests/api -v`.
Regression coverage includes malformed email for both login payload formats,
username/phone incorrectly supplied as email, valid login identifiers,
registration and authenticated profile update. SQL is mocked; invalid email
never reaches authentication or the database.

Staging retest: POST `/api/auth/login` using `account` or `email` set to `user@`
with a non-empty password. Expect HTTP 400 and the message above. Also verify
successful email, username and phone login through `account` with valid test
credentials. Registration/profile checks need otherwise valid fields.
