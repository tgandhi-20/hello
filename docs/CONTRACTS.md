# Tally — Architecture Contracts

**FROZEN.** Five agents build in parallel against this document. Do not change any
interface here without escalating to the orchestrator. If something in here is wrong
or impossible, say so — do not silently deviate.

---

## 0. Product

**Tally** — a private, offline-first budget tracker installed to the home screen of a
Samsung Galaxy S26 Ultra. Single user (Tanay). Australian. Banks: **CBA, Bankwest, Amex**.

Two ways money gets in:
1. **Logging** — sub-3-second manual entry, many times a day (coffee, lunch, dining out).
2. **Importing** — CSV statement exports from CBA / Bankwest / Amex.

Non-negotiables:
- **No backend. No account. No network call ever carries financial data.**
- All records encrypted at rest. PIN + biometric unlock.
- Works fully offline, in an aeroplane, forever.

---

## 1. Stack (frozen)

| Concern | Choice | Note |
|---|---|---|
| Build | Vite 5 | `base: '/hello/'` for GitHub Pages project site |
| UI | React 18 + TypeScript (strict) | |
| Styling | Tailwind CSS 3 + CSS custom properties | tokens in §4 |
| Routing | `react-router-dom` v6, **HashRouter** | bulletproof on Pages subpaths; Android back button works |
| State | `zustand` | one store, slices per domain |
| Storage | IndexedDB via `idb` | every record encrypted before write |
| Crypto | **native WebCrypto only** | no crypto libraries, ever |
| CSV | `papaparse` | quoting/newline edge cases are not worth rewriting |
| Icons | `lucide-react` | bundled at build time, never a CDN |
| Charts | **hand-rolled inline SVG** | no chart library — bundle size and CSP |
| PWA | `vite-plugin-pwa` (Workbox) | `registerType: 'autoUpdate'` |

**Dependency rule:** nothing else may be added without orchestrator approval. Every
byte ships to the phone and every dependency is attack surface on a finance app.
**No runtime CDN requests of any kind** — no Google Fonts, no analytics, no telemetry.

---

## 2. Module ownership (do not write outside your directory)

| Agent | Owns | Must not touch |
|---|---|---|
| 1 — Foundation | `src/ui/**`, `src/app/**`, `src/styles/**`, `public/**`, all root config, `.github/workflows/**` | `src/features/**`, `src/data/**` |
| 2 — Data & Security | `src/data/**`, `src/security/**`, `src/store/**` | `src/ui/**`, `src/features/**` |
| 3 — Import | `src/import/**`, `src/categorize/**`, `src/features/import/**` | everything else |
| 4 — Logging | `src/features/log/**`, `src/features/transactions/**`, `src/features/recurring/**`, `src/features/habits/**` | everything else |
| 5 — Insight | `src/features/dashboard/**`, `src/features/budgets/**`, `src/features/insights/**`, `src/charts/**` | everything else |

Shared, orchestrator-owned, **read-only to all agents**: `src/types.ts`, `docs/CONTRACTS.md`.

If you need a shared UI primitive that doesn't exist, build it locally in your own
directory and flag it in your report. Do not edit Agent 1's files.

---

## 3. Data contracts

**Money is stored as integer cents. Never floats. Never.** `2450` is $24.50.
A float bug in a finance app is a correctness bug the user will not forgive.

See `src/types.ts` for the authoritative definitions. Summary:

- `Txn` — one transaction. `amountCents` is **positive for spend, negative for income**.
  `date` is `YYYY-MM-DD` local. `source` is `'manual' | 'csv'`. `account` is
  `'cba' | 'bankwest' | 'amex' | 'cash'`. Carries `hash` for import dedupe.
- `Category` — id, label, icon name, colour token, `kind: 'need' | 'want' | 'save'`.
- `Budget` — `{ categoryId, limitCents, month }` where month is `YYYY-MM`.
- `Rule` — user-taught categorization: match on merchant substring → categoryId.
- `RecurringSeries` — detected repeating charge.
- `Settings` — currency `AUD`, locale `en-AU`, payday, lock timeout, etc.

**Date/number formatting is centralised.** Agent 1 exports `formatMoney`,
`formatDate`, `parseAuDate` from `src/ui/format.ts`. Everyone uses those.
`en-AU`, `DD/MM/YYYY`, `$1,234.56`. Nobody hand-rolls `toFixed(2)`.

---

## 4. Design system — AMOLED-first, one-handed

Target: 6.9" 1440×3120, 120Hz, punch-hole camera, gesture navigation.

**Palette** (CSS custom properties, defined by Agent 1 in `src/styles/tokens.css`):

```
--bg          #000000   true black — AMOLED pixels off, saves battery, looks premium
--surface-1   #0D0F13   cards
--surface-2   #161A21   raised / pressed
--border      #232830
--text-1      #F2F4F8
--text-2      #9AA3B2   secondary
--text-3      #5C6675   tertiary / disabled
--accent      #7C6BFF   primary violet — actions, focus, active tab
--positive    #3DDC97   income, under budget, streak alive
--warning     #FFB020   approaching cap
--danger      #FF5A6E   over budget, destructive, streak broken
```

Category colours are a fixed 12-swatch ramp, defined once in tokens, referenced by
token name only. Never hardcode a hex in a component.

**Layout laws:**
- Every primary action sits in the **bottom third** of the screen — thumb reach on a
  6.9" phone is the whole design constraint.
- Bottom tab bar, 5 slots: Home · Log · **⊕ (centre FAB, quick-add)** · Trends · More.
- Respect `env(safe-area-inset-*)` top and bottom. Standalone mode has no browser chrome
  to save you.
- Minimum touch target **48×48 px**. No exceptions, including icon buttons.
- `overscroll-behavior: none` on scroll containers so pull-to-refresh doesn't nuke state.
- Animations ≤200ms, transform/opacity only (120Hz panel — jank is visible).
  Honour `prefers-reduced-motion`.

**Type scale:** 12 / 14 / 16 / 20 / 28 / 40. Numerals use `font-variant-numeric:
tabular-nums` everywhere money appears, so columns of figures line up.

**Tone:** calm and factual. This app never shames the user about spending. Warnings are
informational, not moral.

---

## 5. Security contract (Agent 2 owns, everyone obeys)

- Key: PBKDF2-SHA256, **600,000 iterations**, 16-byte random salt → 256-bit AES-GCM key.
- Every record: fresh 12-byte IV, `AES-GCM` encrypt the JSON value before `put()`.
  **Ciphertext only in IndexedDB.** A raw dump of storage must reveal nothing.
- The derived key lives in memory only. Never in `localStorage`, never in IndexedDB,
  never in a cookie.
- Biometric: WebAuthn platform authenticator wraps the key for convenience unlock.
  Must degrade gracefully to PIN if unavailable — a failed biometric never locks the
  user out of their own data.
- Auto-lock after **2 minutes** in background (`visibilitychange`), and on reload.
  Locking zeroes the in-memory key.
- Backup export is **encrypted** (`.tally` file). A plaintext JSON export is a data leak
  wearing a helpful hat. If unencrypted export is offered at all it must carry an
  explicit, unmissable warning.
- Strict CSP meta tag: `default-src 'self'`, no `unsafe-eval`, no remote origins.
- PIN entry: no autocomplete, no spellcheck, obscured, wrong-attempt backoff.

**Rule for all agents:** never `console.log` a transaction, amount, merchant, PIN, or
key. Not even in development. Logs leak.

---

## 6. Bank CSV formats (Agent 3)

Handle these three, auto-detected, plus a generic fallback with a manual column mapper.
**Always show a preview-and-confirm screen before committing an import** — a
mis-detected sign convention silently inverts someone's entire financial history.

- **CBA** — typically headerless: `Date, Amount, Description, Balance`.
  `DD/MM/YYYY`. **Negative = spend.**
- **Bankwest** — headered, separate columns:
  `BSB Number, Account Number, Transaction Date, Narration, Cheque, Debit, Credit, Balance, Transaction Type`.
  Debit column = spend.
- **Amex AU** — `Date, Description, Card Member, Account #, Amount`.
  **Sign is INVERTED vs the banks: positive = a charge you made (spend), negative =
  a payment/refund.** This is the single most important detail in the importer. Get it
  wrong and every number in the app is backwards.

**These layouts are NOT reliable.** Verified against public sources: CBA exports appear
in the wild both headerless as `Date,Amount,Description,Balance` AND headered as
`Date,Description,Debit,Credit,Balance`. Amex likewise appears with a single signed
`Amount` column and with split `Debit`/`Credit` columns. Treat the three formats above
as *hints, not schemas*.

Therefore the importer must be **structural, not name-based**:
1. Sniff the delimiter and whether row 0 is a header (does it parse as a date/number?).
2. Identify columns by *content shape*, not by title — a date column parses as dates,
   an amount column parses as signed decimals, a description column is mostly
   non-numeric text, a balance column is monotonic-ish and much larger in magnitude.
3. Infer the sign convention from the data: if nearly all values share one sign, that
   sign is spend. If a `Balance` column exists, verify the convention by checking that
   `balance[n] - balance[n-1]` agrees with the signed amount; that check is authoritative.
4. Fall back to the manual column mapper whenever confidence is low.
5. **Always** show the preview with a sign-convention toggle and 5 sample rows rendered
   as the user will see them ("Coffee $5.50 — spend" vs "Coffee $5.50 — income"). The
   user confirms before anything is written.

Never silently commit an import you had to guess at.

**Dedupe:** `hash = sha256(date | amountCents | normalisedDescription | account)`.
Re-importing an overlapping statement must not double-count. Show "N new, M duplicates
skipped".

**Categorization:** Australian merchant dictionary — Coles, Woolworths, ALDI, IGA,
Bunnings, Kmart, Big W, Chemist Warehouse, Dan Murphy's, BWS, Uber, Uber Eats, DoorDash,
Menulog, Opal/Myki/Go Card, Ampol, BP, 7-Eleven, Telstra, Optus, Origin, AGL, Netflix,
Spotify, Officeworks, JB Hi-Fi, Guzman y Gomez, Grill'd, Boost Juice, Zambrero,
Soul Origin, Gloria Jean's, plus rent/mortgage and utility patterns.
User corrections create a `Rule` and are applied to future imports — the app must learn.
Local cafés are unguessable; make re-categorizing a one-tap action.

---

## 7. Feature contracts

**Quick-add (Agent 4) — the most important screen in the app.**
Opening the app to a saved transaction must take **under 3 seconds and under 4 taps**.
Grid of large category tiles (Coffee, Lunch, Dining Out, Groceries, Transport, …),
custom numeric keypad (never the OS keyboard — it's slow and covers the screen),
amount defaults sensibly, one tap to save, haptic confirm via `navigator.vibrate`,
undo toast. Most-used categories float to the front automatically.

**Calendar heatmap (Agent 5).** Month grid, each day shaded by spend intensity.
Tap a day → that day's transactions. Must be legible for a colourblind user: vary
lightness, not just hue, and never encode meaning in hue alone.

**Recurring radar (Agent 4).** Detect series by clustering on normalised merchant +
similar amount + regular interval (weekly / fortnightly / monthly). Surface: what's
due in the next 14 days, total monthly subscription load, and anything that silently
got more expensive. Rent and utilities are the anchor cases.

**Streaks & habits (Agent 4).** No-spend-day streak, coffees this month vs last,
weekly cost of the lunch habit, "you've spent $X on dining out this month". Encouraging,
never nagging. A broken streak is a fact, not a failure.

**Dashboard (Agent 5).** One hero number: **Safe to Spend** — income minus committed
(rent, bills, recurring) minus savings, divided across days remaining in the month.
Below it: month spend vs budget, category donut, sparkline trend, recent transactions.

---

## 8. Quality bar

- TypeScript strict. No `any` in exported signatures.
- Every module builds clean: `npm run typecheck && npm run build`.
- Empty states everywhere — a brand-new install with zero data must look intentional
  and inviting, not broken.
- Every destructive action confirms.
- Loading and error states for CSV import (a 5,000-row file must not freeze the UI).
- The app must be usable one-handed while walking. That's the real acceptance test.
