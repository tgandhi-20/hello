# Tally — the personal plan (FROZEN)

Derived from the user's own "Budget & Deposit Plan" (August 2026). Agents build
against **this file**, not their own reading of the source document, so every
module uses identical figures.

All money below is written in dollars for legibility. **In code it is integer
cents.** Every figure here must appear exactly once, in `src/personal/plan.ts`,
and be imported from there — no module re-types a number from this document.

---

## 0. What this app is actually for

Not "a budget tracker". **A deposit plan with a deadline.**

> Buy a Sydney apartment, settling **30 October 2027**, by saving **$3,500/month**.

Everything follows from one line:

```
take-home  −  living costs  =  savings
  $6,457   −    $2,957      =   $3,500
```

There is no third source of money. Every screen should serve that sentence.

The user's own analysis identified the binding constraint: **food is ~50% of all
spending**, at $260/week against a $141/week budget, spread over 112 transactions
in five weeks averaging $13.65 — 3 to 4 taps a day, no single one a mistake.
That is *why* this app emphasises logging in the moment. A card bill is last
month's spending arriving five weeks late, by which point it feels immovable.

---

## 1. Conversion rule — NON-NEGOTIABLE

**Weekly → monthly is `× 52 ÷ 12` (4.33333…). Never `× 4`.**

The user's plan calls `× 4` out by name as the most common budgeting error (it
understates by 8%). The codebase currently uses `4.348` in
`src/features/recurring/detect.ts` — **change it to `52 / 12`** and keep it as
the single shared definition that `safeToSpend.ts` already imports.

Monthly → weekly is the inverse: `× 12 ÷ 52`.

---

## 2. Income

| | |
|---|---|
| Gross salary | $100,000 + super |
| Income tax (2026–27) | −$20,520 |
| Medicare levy (2%) | −$2,000 |
| **Net / year** | **$77,480** |
| **Net / month** | **$6,457** |

Super is paid on top and untouchable — ignored for budgeting.
Marginal rate **32%** (30% + 2% Medicare): every extra dollar earned keeps 68c.
Assumes **no HECS/HELP**. If one exists, subtract ~$700/month and the plan needs
rebuilding — surface this as a one-time setup question, not a silent assumption.

---

## 3. Categories and monthly caps

These are the app's default categories. **Replace the current generic set.**
Ids are frozen — other modules reference them.

| id | Label | Cap / month | kind | Notes |
|---|---|---|---|---|
| `cat-rent` | Rent | $2,600 | need | Whole 2BR, $600/wk |
| `cat-sublet` | Sublet income | −$1,517 | need | Room 2, $350/wk, **offsets rent** |
| `cat-utilities` | Utilities | $210 | need | Elec $150 + internet $60. No gas; water on owner |
| `cat-family` | Family support | $450 | need | Sent home monthly |
| `cat-groceries` | Groceries | $370 | need | $85/wk |
| `cat-transport` | Transport | $268 | need | Opal + parking |
| `cat-eating-out` | Eating out | $100 | want | see §4 |
| `cat-lunch` | Lunch | $80 | want | see §4 |
| `cat-coffee` | Coffee | $60 | want | see §4 |
| `cat-health` | Health | $109 | need | Bupa |
| `cat-phone` | Phone | $81 | need | Was missing from the original budget entirely |
| `cat-shopping` | Shopping | $75 | want | |
| `cat-subscriptions` | Subscriptions | $36 | want | see §5 |
| `cat-skincare` | Skincare | $35 | want | |
| `cat-savings` | Savings | $3,500 | save | The goal |
| `cat-income` | Income | — | save | Salary |
| `cat-oneoff` | One-offs | — | need | Visa, travel, moving — excluded from monthly pacing |
| `cat-other` | Other | — | want | Fallback |

**Net housing = $2,600 − $1,517 + $210 = $1,293.** The app must show housing
*net*, not $2,600, or the largest line in the budget reads wrong. The sublet is
all-inclusive, so the flatmate's $350 covers their share of power and internet —
the user carries the full utility bill.

Living-costs total: 1293 + 450 + 370 + 268 + 240 + 109 + 81 + 75 + 36 + 35 =
**$2,957**. Any change must keep that identity true; assert it in a check.

---

## 4. The food group — the app's central lever

The plan budgets "Eating out & coffee" as one line of **$240/month ($55/week)**.
The app needs per-category caps, so that $240 is split **$100 / $80 / $60**
across eating-out / lunch / coffee. **This split is an assumption, not from the
source document** — mark it as such in code and let the user retune it.

**Food group = `cat-groceries` + `cat-eating-out` + `cat-lunch` + `cat-coffee`.**

```
$370 + $100 + $80 + $60 = $610/month  →  × 12 ÷ 52 = $140.77/week  ≈ $141/week
```

**$141/week is the headline target.** Against a current ~$260/week.

Track it **weekly, not monthly** — the plan says so explicitly, and a monthly
view hides the damage until it's done. Week runs **Monday–Sunday** (AU).

July 2026 actuals, for context and comparison baselines (5 weeks):

| Category | 5 weeks |
|---|---|
| Restaurants & delivery | $471 |
| Lunch & takeaway | $462 |
| Transport | $309 |
| Coffee & cafe | $267 |
| Subscriptions | $238 (misleading — see §5) |
| Phone | $176 |
| Health | $152 |
| **Groceries** | **$101** |

Eating out $1,200 vs groceries $101 — a **92/8 split**. Essentially every meal
bought ready-made. One cafe alone: **22 visits at $5.76**.

The behavioural goal is shifting that ratio, so the food tracker must show the
**groceries vs eating-out split**, not just a total. Cooking more is the lever;
the number that proves it is the ratio.

**Tone rule still applies.** This is the one place a finance app is tempted to
moralise. Report the gap as a fact. "$260 this week, $141 budgeted" — never
"you overspent again".

---

## 5. Subscriptions — $36/month, seeded as truth

| | |
|---|---|
| Netflix (user's half, split) | $14.50 |
| Amazon Prime | $9.99 |
| Crunchyroll | $7.19 |
| Google One | $4.49 |

Cancelled: Bumble, Claude, Splitwise.

The $206 figure in the earlier analysis was **wrong** — it was almost entirely
two one-off Anthropic charges ($34 + $138.30). Seed these four as the known
truth so the recurring radar flags anything *else* that looks subscription-like,
rather than the user re-deriving this every month.

---

## 6. Cash, one-offs and the goal

**Starting cash: $40,000 on 3 Aug 2026.**

August 2026 as planned:

| When | Event | Amount |
|---|---|---|
| 11 Aug | Amex due | −$1,131 |
| 15 Aug | Salary | +$6,457 |
| 25 Aug | CBA card due | −$1,250 |
| late Aug | Moving costs | −$4,000 |
| Aug | Repay aunt | −$5,000 |
| Aug | Living (still boarding, no rent) | −$1,507 |
| | **End of August** | **~$33,569** |

Moving costs = bond $2,600 + 2 weeks rent in advance $1,300 + setup ~$500.
**The bond is an asset, not an expense** — it comes back at end of lease. Model
it as recoverable, not spent. Also: collect the flatmate's bond share (~$1,400)
and lodge the full bond with NSW Fair Trading.

**Planned one-offs** (must be modelled, or every projection is wrong):

| When | What | Amount |
|---|---|---|
| Early Oct 2026 | PR / 189 visa + India ticket | −$9,500 |
| Feb 2027 | India trip balance | −$3,500 |

**Savings sit in Bankwest**: 5.2% until Nov 2026, then 5.0%.

**Target: $72,339 accessible cash at 30 Oct 2027.**

### The October 2026 trap — build a guard for this

Bonus-rate savers typically require **deposits > withdrawals each month**.
October 2026 fails: $9,500 out against $3,500 in. That drops the account to base
rate (~0.65%) for the month, costing ~$135 — more than the entire 5.2% promo
period is worth.

The app should warn when a month's projected withdrawals exceed deposits, and
carry the fix: pay one-offs from an everyday account so the saver balance never
dips. The growth condition usually has **no minimum** — a $100 standing transfer
on a fixed day satisfies it.

This is flagged "to verify" in the source document — present it as a check the
user still needs to confirm with Bankwest, not as established fact.

---

## 7. Move-in date — user-configurable

The user is **moving later in August 2026** (exact date not yet fixed).

Add a `moveInDate` setting. Before it: no rent, no utilities, no sublet income —
living costs ~$1,507/month while boarding. From that date on: rent $2,600,
utilities $210, sublet income $1,517 all activate, giving net housing $1,293.

Do not hard-code a month boundary. Prompt for the date; until it is set, assume
not yet moved.

---

## 8. Routine — the app should carry this, not the user's memory

**Monthly**
- **15th** — salary lands
- **16th** — automatic transfer to savings. Pay yourself first
- **Last business day** — confirm the savings balance closed higher than last
  month (protects the bonus rate)
- **First Saturday** — export CSVs from CBA, Amex and Bankwest; review against
  budget; **pay Amex in full**

**Daily** — log spending as it happens. The point is feeling the $5.60 coffee on
the day, not in five weeks.

**Never carry a credit card balance.** Amex charges **23.99%** — any interest
paid there instantly outweighs everything the plan earns in savings interest.

---

## 9. Risks worth surfacing in-app

- **Room 2 vacancy** — the user is liable for the full $600/wk regardless. An
  empty room costs **$1,517/month** and nearly wipes out the savings rate.
  No separate cash reserve needed; saving simply pauses. Re-advertise early.
- **Food slippage** — $141/wk against a current $260/wk is the single biggest
  behavioural change in the plan. Watch weekly.
- **Salary is the highest-leverage variable.** Subscriptions + coffee + phone
  squeezed together total ~$250/month. A $10k raise is **+$570/month** and
  requires no habit change. Worth stating once, somewhere calm — not nagging.

---

## 10. Not in scope for the app

The source document's property-purchase analysis (loan scenarios, DTI,
serviceability, stamp duty, LMI, FHSS, spouse tests) is **reference material,
not app logic**. Do not build calculators for it. At most, link the goal to its
purpose ("deposit for a ~$600k apartment at 10% down").

The document is explicit that it is **not financial, tax or legal advice**. The
app must not present any of it as advice either — it tracks the user's own plan
and reports facts against it.
