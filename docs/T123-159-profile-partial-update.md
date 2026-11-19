# T123-159: partial profile updates

`PUT /api/users/me` now accepts any nonempty subset of `fullName`, `email`, `phone`.
Omitted fields retain the current database value. A missing-value sentinel keeps
omission distinct from explicit null, blank strings and wrong types (HTTP 400).

Example: `{"phone":"0900000000"}` returns HTTP 200 with the complete profile;
fullName/email remain unchanged. Full three-field requests are still supported.
Email is trimmed/lowercased; all supplied fields keep existing validation rules.
Empty objects, unsupported/case-mismatched keys and protected fields are rejected.

The service obtains current values under its existing SERIALIZABLE transaction
and UPDLOCK/HOLDLOCK before merging, checking duplicate contacts and updating.
UserID still comes only from verified JWT. No extra pre-read outside the locked
transaction is used. Role, Username, Status and PasswordHash cannot be changed.

## Validation

- 6 new test methods: single/pair/full updates, omitted values retained, invalid
  input, protected fields, duplicate contacts/rollback, missing or inactive users,
  missing JWT and merging from the latest locked row.
- `python -m unittest discover -s tests/api -p 'test_[a-z]*.py'`: 164 tests passed.
- 2 health tests and Python compileall passed.
- Route/JWT are real; SQL is mocked. No claim of live concurrency or SQL retest.

Tester should retest PUT with only email, only phone and a two-field payload;
verify omitted SQL columns and security fields remain unchanged. Check malformed
and duplicate contacts return 400/409 without writes and existing full-profile
editing continues to work. No migration is required.
