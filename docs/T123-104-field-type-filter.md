# T123-104: public field type filtering

The public list and aggregate availability routes previously ignored `FieldType`.
They now accept one `FieldType` (alias `fieldType`) with `5`, `7`, `11`, or the
corresponding `5 player`/`7 player`/`11 player` spelling. Input is trimmed and
case-insensitive; invalid, empty or repeated values return HTTP 400 before DB
access. SQL binds both canonical and legacy stored values and preserves Archive
exclusion. Omitting the filter preserves the existing response shape and scope.

Examples:

- `GET /api/fields/?FieldType=5%20player`: only type 5, HTTP 200 array.
- `GET /api/fields/availability?date=2099-01-01&fieldType=7`: type 7 with slots.
- `GET /api/fields/availability?date=2099-01-01&FieldType=5&availableOnly=true`:
  only AVAILABLE type-5 fields with at least one free priced slot on that date.
  Fully booked, MAINTENANCE and unpriced fields are omitted. Counters reflect the
  returned fields. Empty results are HTTP 200 with an empty list and zero counts.

The plain list has no date/time context and does not claim a field is bookable.
Use the availability endpoint and a date for the ticket's free-field case.
`availableOnly` defaults to false and accepts only true/false, not duplicate flags.
Existing deposit-expiry processing in the availability endpoint is unchanged.

## Validation

- `python -m unittest discover -s tests/api -p test_field_type_filter.py -v`:
  5 methods passed, covering types/aliases, parameterized SQL, malformed/repeated
  filters, missing filter, no match and real slot-building against fixture rows.
- CI-equivalent `python -m unittest discover -s tests/api -p 'test_[a-z]*.py'`:
  163 tests passed; 2 staging-health tests passed; Python compileall passed.
- Tests mock SQL and expiry processing; no live SQL/Staging writes were made.

Tester should verify matching 5/7/11 fields and Archive exclusion against QA SQL,
then seed free, fully booked and MAINTENANCE fields on a chosen date and compare
the availability results/counters. No schema change is required.
