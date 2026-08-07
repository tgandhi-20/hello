# Tally

Tally is a private, offline-first budget tracker for a single person, built to be
installed on an Android home screen and used one-handed. It's aimed at Australian
banking (AUD, `en-AU`, day-first dates) and two ways of getting money into it: fast
manual logging (coffee, lunch, the small stuff) and importing CSV statements from
CBA, Bankwest, or Amex.

There is no backend. No account, no sync, no analytics, and no network request ever
carries financial data. Everything — every transaction, category, budget, and
setting — lives encrypted in the browser's IndexedDB, on the one device it was
entered on.

## Install it on your phone

This is the important part, and it doesn't require a computer or an app store.

1. Open the deployed URL in **Chrome on Android**.
2. Chrome will usually show an **"Install app"** banner or icon in the address bar.
   If it doesn't, open Chrome's **⋮ menu → Add to Home screen**.
3. Confirm the install. Tally now has its own icon on your home screen and opens
   full-screen, with no browser address bar.
4. The first time you open it, it will ask you to **set a PIN or a passphrase**.
   That's what encrypts everything from then on — see below for what that
   actually protects you from.

Once installed, it works fully offline. You can log a coffee in a lift with no
signal.

## Privacy and security — honestly stated

- **No backend, no account, no sync, no analytics.** Nothing about your spending
  ever leaves the device. There's no server to send it to.
- Every record is encrypted before it touches storage: **AES-256-GCM**, with the
  key derived from your PIN or passphrase via **PBKDF2-SHA256 at 600,000
  iterations**. A raw dump of the browser's IndexedDB shows only ciphertext.
- The decryption key exists **only in memory**, for as long as the app is
  unlocked. It's never written to disk, `localStorage`, or a cookie. The app
  auto-locks and drops the key after a couple of minutes in the background.
- You unlock with a **6-digit PIN (configurable 4–10 digits)**, an
  **alphanumeric passphrase**, or, optionally, your fingerprint via WebAuthn
  (using the PRF extension on a supported platform authenticator).
- **The honest trade-off:** a numeric PIN only has as many combinations as its
  digit count implies — a 6-digit PIN is one in a million. That's real
  protection against someone picking up your unlocked phone and poking around.
  It is **not** protection against someone who steals the phone and extracts the
  raw app data — a PIN's whole keyspace can be brute-forced offline in well
  under a day, no matter how many PBKDF2 iterations are in front of it. A
  passphrase doesn't have this ceiling and protects against both cases; it
  just takes a few extra seconds to type. Choose based on what you're actually
  worried about.
- **There is no backup.** Because there's no server, if the phone is lost,
  stolen, or wiped, the data is gone with it — there's nothing to recover from
  anywhere else. Use the **encrypted `.tally` export** in Settings regularly if
  you don't want to risk that.

## Features

- **Quick-add** — a grid of category tiles and a large on-screen keypad (not the
  OS keyboard) built to log a spend in a few taps.
- **CSV import** — upload a bank statement, review a preview of every row and its
  detected sign (spend vs. income), fix anything wrong, then confirm. Nothing is
  written until you confirm.
- **Budgets** — a monthly limit per category, with spent-vs-remaining tracking.
- **Calendar heatmap** — a month grid shaded by daily spend; tap a day to see its
  transactions.
- **Recurring & subscription radar** — detects repeating charges (rent,
  subscriptions, bills) by merchant, amount, and interval, shows what's coming
  due, and flags when a subscription has quietly gotten more expensive.
- **Habits & streaks** — no-spend-day streaks, coffee/lunch/dining spend trends,
  framed as facts rather than guilt.
- **Safe to Spend** — one number on the dashboard: income minus committed
  spending (rent, bills, recurring) minus your savings target, divided across
  the days left in the month.

## Bank CSV support

Tally recognises **CBA**, **Bankwest**, and **Amex** exports, plus a **generic
fallback with a manual column mapper** for anything else (or anything those
three don't match confidently).

Being honest about how this works: real-world bank exports are not stable.
Public examples of CBA files exist both headerless (`Date,Amount,Description,
Balance`) and headered with split `Debit`/`Credit` columns; Amex appears with
both a single signed `Amount` column and split debit/credit columns. So column
detection in Tally is **structural, not name-based** — it looks at what a
column actually contains (does it parse as a date? as a signed number? is a
balance column roughly monotonic?), not what its header says. Header text is
used only as a weak hint to preselect the bank, never as the sole basis for
parsing.

The sign convention (does positive mean money out or money in?) is inferred
from the data itself, and where a balance column exists, it's **verified**
against it — the running balance has to agree with the signed amounts, since
that's the one thing in the file that can't lie about direction.

**Every import shows a preview before anything is written** — sample rows
rendered as "Coffee $5.50 — spend" (or "— income"), with a way to flip the sign
if it guessed wrong, and a duplicate count so re-importing an overlapping
statement doesn't double up your history.

The sample files under `docs/samples/` are **synthetic fixtures** used for
development checks, not real bank exports — worth keeping in mind if you're
verifying a real statement against them.

## Development

Prerequisites: Node 22 (matches the deploy workflow), npm.

```bash
npm install
npm run dev        # local dev server
npm run build       # tsc --noEmit, then vite build to dist/
npm run typecheck   # tsc --noEmit only
npm run preview     # serve the built dist/ locally
```

There's no test framework installed. Instead there are three plain,
node-runnable check scripts, each with its own fixtures, run with
[`tsx`](https://github.com/privatenumber/tsx) via `npx`:

```bash
npx tsx src/import/__checks__/run.ts              # CSV parsing, sign inference, dedupe
npx tsx src/store/__checks__/run.ts                # store-adjacent pure logic
npx tsx src/features/dashboard/__checks__/run.ts   # Safe-to-Spend regression checks
```

### Deploying

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on
every push to `main` or `claude/budget-tracking-app-design-03cizp`. It runs
`npm ci`, `npm run typecheck`, `npm run build`, then uploads `dist/` as the
Pages artifact. `vite.config.ts` sets `base: '/hello/'` to match this repo's
Pages path.

## Project structure

```
src/
  app/            App shell, routing (HashRouter), top-level layout
  ui/             Shared UI primitives, formatting (formatMoney, formatDate)
  styles/         Design tokens (AMOLED-first palette, CSS custom properties)
  security/       PIN/passphrase unlock, WebCrypto (AES-GCM, PBKDF2), biometric (WebAuthn PRF)
  data/           IndexedDB access, encrypted backup (.tally) format, demo data
  store/          zustand store — the only way features touch data or crypto
  import/         CSV parsing, structural column detection, sign inference, dedupe
  categorize/     Merchant → category matching, user-taught rules
  charts/         Hand-rolled inline SVG charts (no chart library)
  features/
    log/          Quick-add screen and keypad
    transactions/ Transaction list, edit, categorize
    recurring/    Recurring-series detection and the subscription radar
    habits/       Streaks and spending-habit stats
    import/       CSV import screen (preview and confirm)
    budgets/      Per-category monthly budgets
    insights/     Calendar heatmap and day drill-down
    dashboard/    Safe-to-Spend and the home dashboard
    settings/     PIN/passphrase change, biometric toggle, backup export/import
```

`docs/CONTRACTS.md` is the authoritative architecture document — stack choices,
the security contract, bank CSV handling rules, the design system, and the
store API are all specified there in more detail than this file covers.

## A note on money

All amounts are stored and computed as **integer cents**, never floating-point
numbers (`2450` means $24.50). This is a hard rule throughout the codebase —
see `src/types.ts`.
