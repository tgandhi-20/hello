# Fintrack — Personal Expense Tracker

A self-contained, privacy-first personal finance web app. Import your bank
statements and Fintrack extracts and categorizes every expense, tracks
budgets and saving goals, analyzes your spending habits, scores your
financial health, and offers personalized advice and wellbeing tips.

Everything runs in the browser — there is no backend and no data ever leaves
your device. All data is stored in `localStorage`.

## Features

- **Import bank statements** — Upload a CSV export (or paste it in) and
  Fintrack auto-detects the date, description and amount columns. Supports a
  single `Amount` column or separate `Debit`/`Credit` columns.
- **Automatic categorization** — Each transaction is matched to a spending
  bucket (Groceries, Dining, Transport, Housing, Utilities, Shopping,
  Entertainment, Health, Income, Savings, Other). You can re-assign any
  category with a single click.
- **Budgets per bucket** — Set a monthly limit for each category and track
  spent vs. remaining with progress bars and over-budget warnings.
- **Saving goals** — Create goals with a target amount and optional deadline,
  add funds, and watch your progress.
- **Spending habits** — Recurring charges & subscriptions, biggest expenses,
  average daily spend, top categories, and month-over-month trend.
- **Financial health check** — A 0–100 score built from your savings rate,
  budget adherence, spending trend, goal progress and spending balance, with a
  per-metric breakdown.
- **Advice & wellbeing** — Personalized, data-driven financial advice plus
  general financial wellbeing tips.

## Running it

It's a static site — no build step or dependencies. Just open `index.html` in
a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Click **Load sample data** in the sidebar to explore with realistic demo data,
or **Import Statement** to bring in your own CSV.

## Project structure

```
index.html          App shell and layout
css/styles.css      Styling (dark theme)
js/data.js          localStorage-backed data store
js/categorize.js    CSV statement parser + categorization engine
js/charts.js        Lightweight inline-SVG charts (donut, gauge, bars)
js/app.js           App controller: views, analytics, health, advice
```

## Privacy

All parsing, storage and analysis happen locally in your browser. No network
requests are made with your financial data.
