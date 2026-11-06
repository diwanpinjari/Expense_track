# Verification record

Verified locally on 6 November 2026 with Node.js 24.19.0 and Microsoft Edge.

## Automated API and domain tests

`npm.cmd test`: **18 passed, 0 failed**.

Coverage includes exact money conversion, invalid dates, CSV escaping, OTP generation and hashing, account creation only after verification, OTP expiry, resend behaviour, incorrect-attempt limits, required authentication, an empty fresh installation and new account, duplicate registration, password checks, HTTP-only cookies, CSRF/origin checks, transaction validation, per-account isolation, ledger changes, monthly boundaries, budget upserts, overspending, filtered exports, database constraints and session invalidation.

## Browser verification

- Account registration through the two-step OTP screen, sign-in and sign-out.
- Verification code accepted only after it is entered; the account remains absent until then.
- Registering an empty private account.
- Adding, editing and deleting a transaction through the interface.
- Reloading the page and confirming the saved transaction remains.
- Searching transaction descriptions and resetting filters.
- Downloading a CSV statement.
- Creating, adjusting and deleting a category budget.
- Showing overspending and recalculating the remaining budget.
- Viewing reports and the category totals table.
- Layout checks at 1440, 768, 390 and 375 CSS pixels.
- Opening and closing the transaction dialog on mobile.
- No uncaught browser JavaScript errors during these workflows.
- A follow-up check confirms all five weekly chart columns fit at 375 pixels.

The latest browser check also confirms:

- The sign-in page has no financial amounts, prefilled credentials or sample-account access.
- New accounts show zero income, expenses and balance, with no transactions or budgets.
- Charts show an empty state until the user records financial activity.
- Saving an income entry updates the balance to that exact amount and persists after reload.
- Signing out returns to a page with no personal financial figures.
- The OTP screen shows the destination email, a 60-second resend timer and a note when local console delivery is being used.

Temporary verification accounts and pending codes were removed after the checks. The automated suite uses its own in-memory database, so it does not change the local database.

Email delivery is currently not configured on this computer; verification codes appear in the server window. Add the SMTP values from `.env.example` to send real email.

## Captured screens

The clean sign-in page is captured in `screenshots/sign-in.png`.
