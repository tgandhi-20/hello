# Tally v4 — one money model, three screens, plain words

**FROZEN.** Supersedes DESIGN-V3.md's §4 information architecture. The v3 *palette*
(light, white, emerald accent, category ramp) stays exactly as it is — that part
works. Everything about structure, naming and the underlying model is replaced.

---

## 0. The diagnosis

The user's words: *"i dont understand ui and logic design of app. rethink and
implement."*

That is a complexity failure, not a polish failure, and it is self-inflicted. Every
round added features and none removed any. The app now has ~13 destinations and asks
the user to hold **five overlapping mental models**:

| Concept | Answers | Can disagree with |
|---|---|---|
| Safe to spend today | can I spend? | all of the below |
| Food this week vs $141 | am I on track? | budget caps |
| Budget caps per category | am I over? | safe-to-spend |
| Deposit goal on/off track | will I make it? | savings target |
| Statement cycle prediction | what do I owe? | — |

Four of those are separate answers to "am I OK?", computed by four engines, that can
contradict each other on the same data. That is why the logic doesn't read. **No
amount of visual design fixes a model the user can't hold in their head.**

---

## 1. The one model — a visible equation

There is now exactly **one** money calculation in the app, and the user can see it.

```
        Income          $6,457     what lands on the 15th
      − Bills           $1,293     rent, utilities, subscriptions — the committed stuff
      − Savings         $3,500     what goes to the deposit, first, not last
      ─────────────────────────
      = To spend        $1,664     everything else, for the whole month
        already spent     $864
      ─────────────────────────
      = Left              $800     ÷ 24 days = $33 a day
```

**This is the home screen's heart.** Not a hero number with a derivation hidden in
small print — the actual arithmetic, laid out, always adding up. A person reads a
subtraction without being taught.

Every other figure in the app is a **view of this one pool**, never a parallel
calculation:

- **Left today** = Left ÷ days remaining.
- **Left this week** = Left today × days remaining in the week.
- **Category spend** = a breakdown of `already spent`. It must sum to it exactly.
- **Food this week** = a slice of that breakdown, with a target. It is a *fact about
  where the money went*, not a second budget to reconcile.
- **Deposit goal** = the `Savings` line, projected forward. Same number, longer view.

**Rule: if two numbers on screen could ever disagree, one of them must go.** Any new
figure must be derived from this pool or it does not ship.

Implementation: a single `src/money/` module exporting one `computeMonthMoney()` that
returns the whole picture. Every screen reads from it. Delete the parallel engines.

---

## 2. Three screens

| Tab | Name | What's on it |
|---|---|---|
| 1 | **Home** | the equation, what's left, where it went, what's coming, recent activity |
| 2 | **⊕** | add a spend (unchanged — it works, 3 taps) |
| 3 | **Menu** | a plain labelled list of everything else |

That's it. Home answers everything day to day. Menu is a phone-book, not a dashboard:

```
MONEY
  All transactions
  Budgets
  Regular payments
  Card balances
SAVING
  Deposit plan
DATA
  Import statements
  Weekly catch-up
  Backup & restore
APP
  How Tally works
  Settings
```

Everything currently built stays reachable — nothing is deleted, it is **demoted**.
A feature one tap away in a labelled list is not hidden; a feature competing for
attention on a dashboard is noise.

---

## 3. Plain words

The app currently speaks in product-manager. Rename everywhere, including code where
it is cheap:

| Now | Becomes |
|---|---|
| Safe to spend | **Left to spend** |
| Coming up | **Bills due soon** |
| Needs you | **To sort out** |
| Recurring radar / series | **Regular payments** |
| Statement cycle / confidence | **Card balances** — "we think", "not sure yet" |
| Deposit goal projection | **Deposit plan** |
| Habits / streaks | fold into **Where it went** |
| Uncategorised queue | **Needs a category** |
| Weekly review | **Weekly catch-up** |
| Safe-to-Spend derivation | the equation itself — no label needed |

Rules for copy: say what a person says out loud. Never a noun phrase where a sentence
works. Never a term the user would have to learn. Numbers get units and periods
("$33 a day", "24 days left"), never bare.

---

## 4. Explain the model in the app

The user should never have to ask how a number was reached.

1. **The equation is the explanation.** It replaces the need for most help text.
2. **Every derived figure gets one plain line** beneath it — "$800 left, spread over
   the 24 days to the end of August."
3. **A "How Tally works" page** in Menu: half a screen, plain English, the equation,
   and what the app can and cannot see (it sees what you log and import; it cannot see
   your bank balance). No jargon, no feature tour.
4. **Onboarding teaches the model, not the features** — three steps: here's your
   income, here's what's committed, here's what's left. Then it seeds the plan.

---

## 5. What must not regress

Carried forward from earlier rounds and still binding:

- The v3 light palette and grouped-list layout (DESIGN-V3.md §1–§3).
- Money is integer cents; every division guarded; no NaN may ever render.
- Tone: calm and factual, never scolding. Over-target colours a supporting line,
  never a hero figure, never a card.
- Never `console.log` financial data. No CDN, no analytics, CSP stays strict.
- All existing check suites keep passing; the reachability check keeps every screen
  honest.
- Quick-add stays at 3 taps.
- Encryption, the vault lock, offline and the error boundary are untouched.
