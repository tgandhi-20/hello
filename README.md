# Fintrack — Personal Finance & Budgeting

A feature-rich, privacy-first personal finance web app — a client-side
Progressive Web App (PWA) you can install on your phone or desktop. Import
your bank statements and Fintrack extracts and categorizes every expense,
tracks net worth, budgets, bills, subscriptions and saving goals, analyzes
your habits, scores your financial health, and gives personalized advice.

Everything runs in the browser — no backend, no accounts, no data ever leaves
your device. All data is stored in `localStorage`, and the app works offline.

## Features

Fintrack combines the flagship features of the top budgeting apps
(YNAB, Monarch, Rocket Money, PocketGuard, Copilot):

- **Import bank statements** — Upload a CSV export (or paste it) with automatic
  detection of date/description/amount (or Debit/Credit) columns.
- **Automatic categorization** — Every transaction is matched to a spending
  bucket; re-assign any category in one click. Define your own **custom
  categories** with keywords.
- **Net worth tracking** — Add checking, savings, investment, credit-card and
  loan accounts; see assets − liabilities, a net-worth trend chart, and a
  **debt-payoff plan** (months to debt-free + total interest) for each debt.
- **Safe-to-Spend & spend pace** *(PocketGuard-style)* — See exactly how much
  is safe to spend this month and whether you're on pace or overspending.
- **Budgets with rollover** *(YNAB-style envelopes)* — Monthly limit per bucket
  with progress bars, over-budget warnings, optional month-to-month rollover,
  and one-click **auto-suggest** from your spending history.
- **Bills & reminders** — Track recurring bills with due dates, get upcoming /
  overdue badges, and mark them paid each month.
- **Subscriptions manager** *(Rocket Money-style)* — Track recurring
  subscriptions, see monthly & annual cost, cancel to tally savings, and get
  auto-detected recurring charges to review.
- **Saving goals** — Targets, deadlines, required-per-month math, add funds.
- **Reports & insights** — Income vs. expenses, **cash-flow forecast**,
  this-month-vs-last comparison, and a category trend matrix.
- **Spending habits** — Recurring charges, biggest expenses, daily average,
  top category, month-over-month trend.
- **Financial health check** — A 0–100 score from savings rate, budget
  adherence, spending trend, goal progress and net worth/debt.
- **Advice & wellbeing** — Personalized, data-driven financial advice plus
  general wellbeing tips.
- **Backup & restore** — Export/import all your data as a JSON file, or
  export your transactions to CSV.
- **Light & dark themes** — System-aware, with a one-tap toggle; remembered
  across sessions.
- **Smart imports** — Transfers between your own accounts are treated as
  neutral (not spending), and re-importing a statement skips duplicates.
- **Installable PWA** — Add to your home screen; works offline.

## Running it

It's a static site — no build step or dependencies. Serve the folder (a server
is needed for the service worker & manifest):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Click **Load sample data** in the sidebar to explore with realistic demo data,
or **Import** to bring in your own CSV.

## Publishing to the app stores

Fintrack is a standards-compliant PWA (`manifest.json`, service worker,
maskable icons), so it can be published to both stores:

- **Google Play** — Wrap it as a Trusted Web Activity (e.g. with
  [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) or PWABuilder)
  and upload the generated `.aab`.
- **Apple App Store** — Wrap it with [PWABuilder](https://www.pwabuilder.com/)
  or a `WKWebView`/Capacitor shell and submit through App Store Connect.

Both need the app served over HTTPS from a public URL first.

## Project structure

```
index.html          App shell, layout, PWA meta
manifest.json       PWA manifest
sw.js               Service worker (offline app-shell cache)
icons/              App icons (SVG + generated PNGs, incl. maskable)
css/styles.css      Styling (dark theme, responsive)
js/data.js          localStorage-backed data store
js/categorize.js    CSV statement parser + categorization engine
js/finance.js       Net worth, safe-to-spend, pace, forecast, debt, rollover
js/charts.js        Inline-SVG charts (donut, gauge, bars, line)
js/app.js           App controller: all views, analytics, health, advice
```

## Privacy

All parsing, storage and analysis happen locally in your browser. No network
requests are made with your financial data.
