# T123-168: registration validation UI

- Field and server error messages are scoped to the registration card and use
  prominent red text; errors no longer inherit a green success style.
- Password guidance appears in the input placeholder. The full existing policy
  remains in the title and an accessible visually hidden description, avoiding
  the mismatched paragraph below the password field.
- Hide Edge's native password reveal control with scoped `::-ms-reveal` and
  `::-ms-clear` rules. Keep one app toggle with accessible name, aria-pressed and
  aria-controls. Toggling preserves the typed password.
- Inputs link to their error messages through aria-invalid/aria-describedby;
  client-side errors use role=alert. Existing password/business rules are retained.

## Validation

- Frontend production build and targeted Register.jsx ESLint passed.
- `node tests/register_validation_browser_check.mjs` after starting Vite on 5188:
  27 UI checks across 375, 768 and 1440px passed. Covers required errors, server
  errors, placeholder guidance, reveal styles/icon, toggling, weak-password
  rejection, successful registration redirect and horizontal overflow.
- All API requests are intercepted; six registration calls use synthetic
  409/201 responses. No account was created and no live SQL was accessed.
- [Machine-readable results](T123-168-evidence/checks.json).
- [Mobile errors](T123-168-evidence/mobile-errors.png).
- [Focused password field](T123-168-evidence/mobile-password-focused.png).
- [Desktop server error](T123-168-evidence/desktop-server-error.png).

Tester should repeat in normal Edge and Chrome on Staging, including first
password entry, show/hide and actual duplicate-contact responses. Browser-native
password-manager extensions are outside the application's control.
