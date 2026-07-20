# Puro Soul Cash — Driver Cash Collection Verification

A full-stack app that creates a verified, tamper-proof record of every cash payment field drivers collect from distributors/parties.

**How verification works:** the driver picks a party from the approved database (select-only, no free text), enters the amount, and an OTP is sent to the **party's** registered mobile — never the driver's. The driver must ask the party for the code, so entering it correctly proves the party acknowledged handing over the cash. On verification, stakeholders get an email with a PDF receipt attached and the party gets a confirmation SMS.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 7 + Tailwind CSS v4, `react-select` (strict, non-creatable), `react-router` |
| Backend | Express 5 (Node.js, ESM) |
| Database | MongoDB via Mongoose 8 |
| SMS/OTP | Pluggable: `console` (dev) / MSG91 / Twilio / Fast2SMS |
| Email | Nodemailer (any SMTP: company mail, SendGrid, Mailgun) |
| PDFs | `pdfkit` — single-collection receipt + multi-transaction report template |
| Auth | JWT with driver/admin roles, bcrypt password + OTP hashing |

## Quick start

Prerequisites: Node 20+, MongoDB running locally (or an Atlas URI).

```bash
# Backend
cd server
npm install
copy .env.example .env        # cp on macOS/Linux — then edit values
npm run seed                  # creates the initial admin account (SEED_ADMIN_* in .env)
npm run dev                   # http://localhost:5000

# Frontend (second terminal)
cd client
npm install
npm run dev                   # http://localhost:5173 (proxies /api to :5000)
```

Log in with the admin credentials from `SEED_ADMIN_*` in `.env` (change the password after first login), then create drivers, parties and further admins from the admin panel.

With `SMS_PROVIDER=console` (the default), OTPs and SMS confirmations are printed to the server terminal so you can test the whole flow without a gateway. Similarly, leaving `SMTP_HOST` empty logs emails to the console instead of sending.

## The collection flow

1. Driver logs in (mobile + password) → **New collection**.
2. Selects party from the searchable dropdown (options come from the DB; the backend re-validates the id and rejects anything not in the approved list). Enters amount and optional notes.
3. **Send OTP to party** → 4-digit OTP (crypto-random, bcrypt-hashed at rest, 5-min expiry) is SMS'd to the party's registered mobile. The driver never sees the number or the code — the app shows only the masked number.
4. Driver asks the party for the code and enters it. 3 wrong attempts lock the transaction (`failed`); a fresh OTP resend (max 3, 60s cooldown, plus a 10-sends/15-min per-driver rate limit) unlocks it. Expired OTPs require resend.
5. On success the transaction is `verified` and **immutable** (enforced by Mongoose hooks — only audit notes and notification bookkeeping may be appended). In the background:
   - Email with the **PDF receipt attached** goes to the party's `notifyEmails` ∪ the global list from Settings.
   - Confirmation SMS goes to the party ("Collection of Rs. X received by [driver] on [date] is confirmed. Ref …").

## The handover flow

After collecting, the driver deposits the cash with an admin (manager/cashier) — verified by the same OTP pattern, but in reverse:

1. Driver → **Handover** tab. The app lists every verified collection still in the driver's hands (not yet part of a handover), with a running total.
2. Driver ticks the collections being handed over, selects the recipient (any active admin with a mobile number on file — set it on the **Admins** page), and taps **Send OTP to recipient**.
3. The OTP goes to the **recipient's** mobile. The recipient counts the cash and tells the driver the code; the driver enters it. Same limits as collections (5-min expiry, 3 attempts, 3 resends, rate-limited).
4. On success the handover is `verified` and **immutable**, each included collection is linked to it (so it can never be handed over twice), and the record appears in the **Reports → Handovers** tab. A pending handover can be cancelled by the driver, which releases its collections immediately.

## Admin panel

- **Collections** — filter by date range / driver / party / status, verified totals, CSV export, per-transaction OTP audit trail (attempt/resend counts and timestamps — never the OTP itself), receipt PDF download, append-only audit notes.
- **Reports** — Daily (grouped by driver, grand total), By Party, By Driver (with per-party breakdown), Handovers (grouped by driver with per-recipient breakdown), Custom Range. Each shows on-screen totals and exports as **PDF** and **CSV**. Only `verified` transactions count toward totals; other statuses are listed separately for audit. A **day-end email** with the daily report PDF (every collection with party, time, driver and amount) goes to the global notification emails automatically at `DAY_END_REPORT_TIME` (IST) — or on demand via the "Email report" button on the Daily tab.
- **Parties** — add/edit/deactivate, registered mobile, per-party notification emails.
- **Drivers** — add/edit/deactivate, password resets.
- **Admins** — create additional admin accounts, edit/deactivate, password resets, and an optional mobile number (required for that admin to receive cash handover OTPs). You cannot deactivate your own account or the last active admin.
- **Settings** — global notification emails (receive every verified collection).

## DLT SMS templates

Once your header (sender ID) is approved on the DLT portal, register these three content templates against it (category **Service – Implicit**; tick the "contains OTP" option for the two OTP templates where the portal asks). The static text must stay exactly as below — the app sends these messages word-for-word with the `{#var#}` parts filled in.

**1. Collection OTP** — variables in order: OTP code (NUMBER, e.g. `4829`), amount (TEXT — the value has `,` and `.`, so NUMBER is rejected; e.g. `5,000.00`), validity minutes (NUMBER, e.g. `5`)

```
Puro Soul: {#var#} is the OTP to confirm cash collection of Rs. {#var#}. Share it ONLY with the delivery driver present with you. Valid {#var#} min.
```

**2. Handover OTP** — variables in order: OTP code (NUMBER, `4829`), amount (TEXT, `12,500.00`), collection count (TEXT, `3 collections`), driver name (TEXT, `Ramesh Kumar`), validity minutes (NUMBER, `5`)

```
Puro Soul: {#var#} is the OTP to confirm you are RECEIVING Rs. {#var#} cash ({#var#}) from driver {#var#}. Share it ONLY with the driver handing over. Valid {#var#} min.
```

**3. Collection confirmation** — variables in order: amount (TEXT, `5,000.00`), driver name (TEXT, `Ramesh Kumar`), date-time (TEXT/DATE, `15 Jul 2026, 09:30 pm`), reference (ALPHANUMERIC, `9F3A2B1C`)

```
Puro Soul: Collection of Rs. {#var#} received by {#var#} on {#var#} is confirmed. Ref {#var#}.
```

After DLT approval, add the header and templates in **Fast2SMS → DLT SMS** to get a numeric Message ID for each, then fill `FAST2SMS_DLT_SENDER_ID` and the three `FAST2SMS_DLT_*_ID` values in `.env` — sends switch from the generic OTP/quick routes to your branded templates automatically. Notes: `COMPANY_NAME` must remain exactly `Puro Soul` (it is part of the registered text), and DLT fills each `{#var#}` with at most 30 characters (long driver names are the only realistic risk).

## Decisions on the open items

1. **SMS gateway** — abstraction in `server/src/services/sms.js`; switch with `SMS_PROVIDER`. **MSG91 is recommended for India**: DLT rules require registered templates for OTP + confirmation, and the MSG91 adapter is template-based (`MSG91_*_TEMPLATE_ID`). Twilio and Fast2SMS adapters included; `console` for development.
2. **Email** — Nodemailer over SMTP, so company mail or SendGrid/Mailgun SMTP relays all work with just `.env` changes.
3. **Notification emails** — both: per-party lists **and** a global admin list, merged and de-duplicated per send.
4. **Offline support** — not in v1. The OTP handshake is inherently online; collections at no-signal sites should be recorded once coverage returns.
5. **Currency** — INR. The web UI uses ₹ (`en-IN` grouping); PDFs and SMS use `Rs.` because standard PDF fonts lack the ₹ glyph.

## Design system

Branding follows [purosoul.in](https://purosoul.in): water-blue palette anchored on `#185997`, warm ivory canvas `#f5f3ef`, **Playfair Display** for display headings and **Poppins** for UI text (both self-hosted via Fontsource — no CDN dependency). Design tokens live in `client/src/index.css` (`@theme`); PDF receipts and notification emails use the same brand blue. The UI ships with a single SVG icon system, skeleton loading states, toast notifications, a 6-box OTP input with SMS autofill support, tabular numerals for all amounts, ≥44px touch targets, visible keyboard-focus rings, and `prefers-reduced-motion` support.

## Security notes

- Party selection is validated server-side against the active-party list — a forged request with an unknown/inactive party id is rejected.
- OTPs: crypto-random, bcrypt-hashed, never logged in production (`console` provider refuses to run with `NODE_ENV=production`), never returned to the driver's device, attempt-limited, resend-limited, rate-limited per driver.
- Verified transactions are immutable at the schema level; query-level updates/deletes are blocked outright.
- JWTs are checked on every request **and** the account's `isActive` flag is re-read, so deactivating a driver locks them out immediately. Login endpoints are rate-limited.
- Driver IP and user-agent are recorded on each transaction for the audit trail.
- Drivers' party dropdown API deliberately omits party mobile numbers.

## Testing

```bash
cd server
npm run smoke     # imports every module and renders both PDF templates (no DB needed)
```

For production, set a strong `JWT_SECRET`, real SMS/SMTP credentials, `NODE_ENV=production`, and serve `client/dist` (run `npm run build` in `client/`) behind the same origin as the API or set CORS via `CLIENT_ORIGIN`.
