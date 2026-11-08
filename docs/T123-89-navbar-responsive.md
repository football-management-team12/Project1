# T123-89: responsive navbar

The brand and guest/account controls now occupy separate grid columns on mobile.
The brand may wrap; the logo and buttons retain their size, and long account names
truncate inside the available space. The navbar grows to fit its content.

At tablet/narrow desktop widths the menu uses a second row. On mobile it remains
available as a horizontally scrollable row. Navbar layout rules were consolidated
in `Navbar.css`; duplicate higher-specificity mobile rules in `styles/ui.css`
previously overrode component rules.

## Verification

- `cd frontend` then `npm ci` and `npm run build`.
- Start `npm run dev -- --host 127.0.0.1 --port 5178 --strictPort`.
- From the repository root: `node tests/navbar_browser_check.mjs`.
- 36 Edge headless checks passed: guest, customer and a long unbroken customer
  name at 320, 375, 390, 576, 768, 769, 820, 1024, 1100, 1200, 1280 and 1440px.
- Checks assert no brand/control overlap or navbar overflow, visible auth
  controls and accessible navigation. API requests are intercepted and storage
  uses synthetic users; no SQL or production credentials are used.

Evidence: [results](T123-89-evidence/checks.json),
[mobile guest](T123-89-evidence/guest-375.png),
[tablet with long account name](T123-89-evidence/long-name-820.png).

The scope is the shared navbar, matching the ticket's login-header reproduction.
Staging retest should include real login/logout, navigation and device checks.
