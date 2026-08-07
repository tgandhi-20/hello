/**
 * Tally — the user's personal plan, encoded as typed constants.
 *
 * SINGLE SOURCE OF TRUTH. Every number in docs/PERSONAL.md appears exactly
 * once, here, in INTEGER CENTS. No other module re-types a figure from that
 * document — it imports from here instead. If a number needs to change, it
 * changes in exactly one place.
 *
 * docs/PERSONAL.md is the frozen spec this file transcribes. Section
 * references (§N) below point back to it. Read that file first.
 *
 * Two figures the document itself gives as illustrative/historical, rather
 * than as frozen plan inputs, are deliberately NOT duplicated here:
 *   - The July 2026 "actuals" table (§4) — comparison baseline, not a budget
 *     input. src/data/demoData.ts uses its own tuned constants for realistic
 *     demo generation, commented with their §4 provenance.
 *   - The "$10k raise → +$570/month" aside (§9) — narrative colour, not
 *     something any other module needs to compute against.
 *
 * INTERNAL INCONSISTENCIES FOUND IN PERSONAL.md — flagged here, not fudged.
 * Full detail in each constant's doc comment below, and in Agent P1's report:
 *   1. §2's "Net / month" ($6,457) is 33c above netAnnualCents / 12
 *      ($6,456.67). We use the document's own explicit $6,457 (see INCOME).
 *   2. §3's subscriptions cap ($36.00) does not equal the sum of the four
 *      real subscriptions in §5 ($36.17). Both figures are kept, distinctly
 *      (see KNOWN_SUBSCRIPTIONS_TOTAL_CENTS vs. the cat-subscriptions cap in
 *      PERSONAL_CATEGORIES).
 *   3. §6's "Moving costs −$4,000" cash event does not equal its own stated
 *      breakdown (bond $2,600 + 2wk rent advance $1,300 + setup ~$500 =
 *      $4,400). See MOVING_COSTS_DISCREPANCY_CENTS.
 */
import type { Cents, CategoryKind, DateStr, MonthStr } from '@/types';

// ---------------------------------------------------------------------------
// §1 — Conversion rule. NON-NEGOTIABLE: weekly → monthly is ×52÷12, never ×4.
// The codebase's other copy of this ratio lives in
// src/features/recurring/detect.ts, which imports WEEKS_PER_MONTH /
// FORTNIGHTS_PER_MONTH from here (that file's own doc comment explains why
// it still needs a local re-export target for `monthlyEquivalentCents`).
// ---------------------------------------------------------------------------

/** Weeks per average calendar month: 52 ÷ 12. NEVER 4 (the classic budgeting error — understates by ~8%). */
export const WEEKS_PER_MONTH = 52 / 12;
/** Fortnights per average calendar month: 26 ÷ 12. */
export const FORTNIGHTS_PER_MONTH = 26 / 12;

/** A weekly cost, converted to its monthly equivalent. Rounded to the nearest cent. */
export function weeklyToMonthlyCents(weeklyCents: Cents): Cents {
  return Math.round(weeklyCents * WEEKS_PER_MONTH);
}
/** A monthly cost, converted to its weekly equivalent. Rounded to the nearest cent. */
export function monthlyToWeeklyCents(monthlyCents: Cents): Cents {
  return Math.round((monthlyCents * 12) / 52);
}
/** A fortnightly cost, converted to its monthly equivalent. Rounded to the nearest cent. */
export function fortnightlyToMonthlyCents(fortnightlyCents: Cents): Cents {
  return Math.round(fortnightlyCents * FORTNIGHTS_PER_MONTH);
}
/** A monthly cost, converted to its fortnightly equivalent. Rounded to the nearest cent. */
export function monthlyToFortnightlyCents(monthlyCents: Cents): Cents {
  return Math.round((monthlyCents * 12) / 26);
}

// ---------------------------------------------------------------------------
// §2 — Income
// ---------------------------------------------------------------------------

export const INCOME = {
  grossSalaryCents: 10_000_000 as Cents, // $100,000 (+ super, untouchable, ignored for budgeting)
  incomeTaxCents: 2_052_000 as Cents, // −$20,520 (2026–27)
  medicareLevyCents: 200_000 as Cents, // −$2,000 (2%)
  netAnnualCents: 7_748_000 as Cents, // $77,480 — gross − tax − medicare, self-consistent
  /**
   * PERSONAL.md's own explicitly-labelled "Net / month" figure (§2).
   * NOTE: netAnnualCents / 12 = 645,666.67c ($6,456.67) — 33c below this. The
   * source document states $6,457 directly, and every other total that
   * depends on it (the savings identity in §0, the August cashflow in §6,
   * where "15 Aug | Salary | +$6,457" is itself a line item) is built from
   * $6,457, not the /12 figure. We follow the document's own explicit
   * number rather than "correct" it — see the report for this flag.
   */
  netMonthlyCents: 645_700 as Cents, // $6,457
  marginalRatePct: 32, // 30% + 2% Medicare — every extra dollar keeps 68c
  /** §2: "Assumes no HECS/HELP." Must be an explicit user answer — see Settings.hasHecsDebt in src/types.ts. */
  assumesNoHecs: true,
  /** §2/§7: "If one exists, subtract ~$700/month and the plan needs rebuilding." Approximate, not exact. */
  hecsApproxMonthlyImpactCents: 70_000 as Cents,
} as const;

// ---------------------------------------------------------------------------
// §3 — Categories and monthly caps. Ids are FROZEN — other modules reference
// them directly (cat-groceries, cat-eating-out, cat-lunch, cat-coffee,
// cat-rent, cat-sublet, cat-subscriptions, etc).
// ---------------------------------------------------------------------------

export const CATEGORY_IDS = {
  rent: 'cat-rent',
  sublet: 'cat-sublet',
  utilities: 'cat-utilities',
  family: 'cat-family',
  groceries: 'cat-groceries',
  transport: 'cat-transport',
  eatingOut: 'cat-eating-out',
  lunch: 'cat-lunch',
  coffee: 'cat-coffee',
  health: 'cat-health',
  phone: 'cat-phone',
  shopping: 'cat-shopping',
  subscriptions: 'cat-subscriptions',
  skincare: 'cat-skincare',
  savings: 'cat-savings',
  income: 'cat-income',
  oneOff: 'cat-oneoff',
  other: 'cat-other',
} as const;
export type PersonalCategoryKey = keyof typeof CATEGORY_IDS;
export type PersonalCategoryId = (typeof CATEGORY_IDS)[PersonalCategoryKey];

export interface PersonalCategoryDef {
  id: PersonalCategoryId;
  label: string;
  /**
   * Monthly cap, integer cents. `null` = no cap (income/one-off/other —
   * either open-ended or excluded from monthly pacing). Negative only for
   * `cat-sublet`, whose cap is recurring INCOME that offsets rent — see
   * NET_HOUSING_CENTS below for how the app should display this.
   */
  capCents: Cents | null;
  kind: CategoryKind;
  note: string;
}

export const PERSONAL_CATEGORIES: readonly PersonalCategoryDef[] = [
  {
    id: CATEGORY_IDS.rent,
    label: 'Rent',
    capCents: 260_000,
    kind: 'need',
    note: 'Whole 2BR, $600/wk. Active only from Settings.moveInDate onward (§7).',
  },
  {
    id: CATEGORY_IDS.sublet,
    label: 'Sublet income',
    capCents: -151_700,
    kind: 'need',
    note:
      'Room 2, $350/wk, offsets rent. Negative cap: logged transactions are income ' +
      '(negative Txn.amountCents, per types.ts convention). Active only from moveInDate (§7).',
  },
  {
    id: CATEGORY_IDS.utilities,
    label: 'Utilities',
    capCents: 21_000,
    kind: 'need',
    note: 'Elec $150 + internet $60. No gas; water on owner. Active only from moveInDate (§7).',
  },
  {
    id: CATEGORY_IDS.family,
    label: 'Family support',
    capCents: 45_000,
    kind: 'need',
    note: 'Sent home monthly.',
  },
  {
    id: CATEGORY_IDS.groceries,
    label: 'Groceries',
    capCents: 37_000,
    kind: 'need',
    note: '$85/wk.',
  },
  {
    id: CATEGORY_IDS.transport,
    label: 'Transport',
    capCents: 26_800,
    kind: 'need',
    note: 'Opal + parking.',
  },
  {
    id: CATEGORY_IDS.eatingOut,
    label: 'Eating out',
    capCents: 10_000,
    kind: 'want',
    note: 'Part of the $240/mo "eating out & coffee" split. ASSUMPTION, not from the source doc (§4) — retune-able.',
  },
  {
    id: CATEGORY_IDS.lunch,
    label: 'Lunch',
    capCents: 8_000,
    kind: 'want',
    note: 'Part of the $240/mo "eating out & coffee" split. ASSUMPTION, not from the source doc (§4) — retune-able.',
  },
  {
    id: CATEGORY_IDS.coffee,
    label: 'Coffee',
    capCents: 6_000,
    kind: 'want',
    note: 'Part of the $240/mo "eating out & coffee" split. ASSUMPTION, not from the source doc (§4) — retune-able.',
  },
  {
    id: CATEGORY_IDS.health,
    label: 'Health',
    capCents: 10_900,
    kind: 'need',
    note: 'Bupa.',
  },
  {
    id: CATEGORY_IDS.phone,
    label: 'Phone',
    capCents: 8_100,
    kind: 'need',
    note: 'Was missing from the original budget entirely.',
  },
  {
    id: CATEGORY_IDS.shopping,
    label: 'Shopping',
    capCents: 7_500,
    kind: 'want',
    note: '',
  },
  {
    id: CATEGORY_IDS.subscriptions,
    label: 'Subscriptions',
    capCents: 3_600,
    kind: 'want',
    note:
      'Cap per §3 is exactly $36.00. The four real subscriptions in KNOWN_SUBSCRIPTIONS (§5) actually ' +
      'sum to $36.17 — 17c over this cap. Both figures kept distinct; see this file\'s header note.',
  },
  {
    id: CATEGORY_IDS.skincare,
    label: 'Skincare',
    capCents: 3_500,
    kind: 'want',
    note: '',
  },
  {
    id: CATEGORY_IDS.savings,
    label: 'Savings',
    capCents: 350_000,
    kind: 'save',
    note: 'The goal.',
  },
  {
    id: CATEGORY_IDS.income,
    label: 'Income',
    capCents: null,
    kind: 'save',
    note: 'Salary.',
  },
  {
    id: CATEGORY_IDS.oneOff,
    label: 'One-offs',
    capCents: null,
    kind: 'need',
    note: 'Visa, travel, moving — excluded from monthly pacing (§6).',
  },
  {
    id: CATEGORY_IDS.other,
    label: 'Other',
    capCents: null,
    kind: 'want',
    note: 'Fallback.',
  },
] as const;

/** Look up a category's monthly cap by id. `null` if uncapped or unknown. */
export function categoryCapCents(id: string): Cents | null {
  return PERSONAL_CATEGORIES.find((c) => c.id === id)?.capCents ?? null;
}

// ---------------------------------------------------------------------------
// Net housing — §3: "The app must show housing NET, not $2,600, or the
// largest line in the budget reads wrong."
//
// HOW THIS IS MODELLED: there is no separate "net housing" category. Instead
// three ordinary categories exist — cat-rent ($2,600 cap), cat-sublet (−$1,517
// cap, an income offset), cat-utilities ($210 cap) — and any UI that wants to
// show "Housing" as one figure sums their three budgets/actuals together.
// NET_HOUSING_CENTS below is that sum for the planned caps; computeNetHousingCents
// is the same arithmetic for actuals (e.g. a month's real spend across the
// three categories), so a dashboard/budgets screen never re-derives the formula.
// ---------------------------------------------------------------------------

export const NET_HOUSING_CENTS: Cents = 260_000 + -151_700 + 21_000; // = 129_300 ($1,293)

/** rentCents + subletCents (expected negative) + utilitiesCents = net housing. */
export function computeNetHousingCents(rentCents: Cents, subletCents: Cents, utilitiesCents: Cents): Cents {
  return rentCents + subletCents + utilitiesCents;
}

// ---------------------------------------------------------------------------
// Living-costs identity (§3): net housing + every other "need"/"want" category
// (excluding savings, income, one-offs, and the Other fallback) must equal
// exactly $2,957. Asserted in __checks__/run.ts.
// ---------------------------------------------------------------------------

export const LIVING_COSTS_CENTS: Cents =
  NET_HOUSING_CENTS +
  45_000 + // family
  37_000 + // groceries
  26_800 + // transport
  10_000 + // eating-out
  8_000 + // lunch
  6_000 + // coffee
  10_900 + // health
  8_100 + // phone
  7_500 + // shopping
  3_600 + // subscriptions (cap, per §3 — see the KNOWN_SUBSCRIPTIONS note re: $36 vs $36.17)
  3_500; // skincare
// = 295_700 ($2,957)

/** The category ids summed into LIVING_COSTS_CENTS, for a UI that wants to show the breakdown. */
export const LIVING_COST_CATEGORY_IDS: readonly PersonalCategoryId[] = [
  CATEGORY_IDS.rent,
  CATEGORY_IDS.sublet,
  CATEGORY_IDS.utilities,
  CATEGORY_IDS.family,
  CATEGORY_IDS.groceries,
  CATEGORY_IDS.transport,
  CATEGORY_IDS.eatingOut,
  CATEGORY_IDS.lunch,
  CATEGORY_IDS.coffee,
  CATEGORY_IDS.health,
  CATEGORY_IDS.phone,
  CATEGORY_IDS.shopping,
  CATEGORY_IDS.subscriptions,
  CATEGORY_IDS.skincare,
] as const;

// ---------------------------------------------------------------------------
// §4 — The food group, the app's central lever.
// ---------------------------------------------------------------------------

/** groceries + eating-out + lunch + coffee. */
export const FOOD_GROUP_CATEGORY_IDS: readonly PersonalCategoryId[] = [
  CATEGORY_IDS.groceries,
  CATEGORY_IDS.eatingOut,
  CATEGORY_IDS.lunch,
  CATEGORY_IDS.coffee,
] as const;

export const FOOD_GROUP_MONTHLY_CAP_CENTS: Cents = 37_000 + 10_000 + 8_000 + 6_000; // $610

/** Exact conversion of the monthly food cap to weekly, via ×12÷52. = 14_077c ($140.77). */
export const FOOD_GROUP_WEEKLY_TARGET_CENTS_PRECISE: Cents = monthlyToWeeklyCents(FOOD_GROUP_MONTHLY_CAP_CENTS);

/** The doc's rounded headline figure (§4: "$141/week is the headline target"). */
export const FOOD_GROUP_WEEKLY_TARGET_CENTS: Cents = 14_100; // $141

/** Current (pre-plan) food spend, approx, per §1/§9: "$260 this week, $141 budgeted". */
export const CURRENT_FOOD_SPEND_WEEKLY_CENTS_APPROX: Cents = 26_000;

/**
 * The $240/month "eating out & coffee" line is split $100/$80/$60 across
 * eating-out/lunch/coffee (see PERSONAL_CATEGORIES above). This split is an
 * ASSUMPTION, not from the source document (§4) — surface it as retune-able.
 */
export const EATING_OUT_SPLIT_IS_ASSUMPTION = true;

/** July 2026 actuals, per §4: essentially every meal bought ready-made. */
export const EATING_OUT_VS_GROCERIES_JULY_SPLIT = { eatingOutPct: 92, groceriesPct: 8 } as const;

// ---------------------------------------------------------------------------
// §5 — Subscriptions, seeded as truth.
// ---------------------------------------------------------------------------

export interface KnownSubscription {
  id: string;
  merchant: string;
  amountCents: Cents;
  /** Billing day of month. ASSUMPTION — PERSONAL.md does not specify billing days (§5). */
  billingDayOfMonth: number;
}

export const KNOWN_SUBSCRIPTIONS: readonly KnownSubscription[] = [
  { id: 'netflix', merchant: 'Netflix', amountCents: 1_450, billingDayOfMonth: 5 }, // user's half, split
  { id: 'amazon-prime', merchant: 'Amazon Prime', amountCents: 999, billingDayOfMonth: 12 },
  { id: 'crunchyroll', merchant: 'Crunchyroll', amountCents: 719, billingDayOfMonth: 18 },
  { id: 'google-one', merchant: 'Google One', amountCents: 449, billingDayOfMonth: 24 },
] as const;

/**
 * = 3_617 ($36.17). NOTE: this is 17c above the cat-subscriptions cap (3_600,
 * $36.00) declared in PERSONAL_CATEGORIES — both are transcribed exactly as
 * PERSONAL.md states them (§3 vs §5); they do not reconcile to the cent. See
 * this file's header note.
 */
export const KNOWN_SUBSCRIPTIONS_TOTAL_CENTS: Cents = KNOWN_SUBSCRIPTIONS.reduce((s, x) => s + x.amountCents, 0);

export const CANCELLED_SUBSCRIPTIONS = ['Bumble', 'Claude', 'Splitwise'] as const;

/**
 * The earlier analysis's "$206" figure (§5), which PERSONAL.md says was WRONG
 * — almost entirely two one-off Anthropic charges ($34 + $138.30), not a real
 * recurring subscription load. Kept here only so a UI can explain the
 * correction if it ever needs to reference the old, wrong number.
 */
export const MISLEADING_PRIOR_SUBSCRIPTIONS_FIGURE_CENTS: Cents = 20_600;
export const MISLEADING_PRIOR_SUBSCRIPTIONS_ANTHROPIC_CHARGES_CENTS: readonly Cents[] = [3_400, 13_830];

// ---------------------------------------------------------------------------
// §6 — Cash, one-offs and the goal.
// ---------------------------------------------------------------------------

export const STARTING_CASH_CENTS: Cents = 4_000_000; // $40,000
export const STARTING_CASH_DATE: DateStr = '2026-08-03';

export interface CashEvent {
  /** Exact date if PERSONAL.md gives one; `null` when it only gives a coarse label (e.g. "late Aug"). */
  date: DateStr | null;
  /** The label PERSONAL.md uses for the date, verbatim ("11 Aug", "late Aug", "Aug"). */
  dateLabel: string;
  label: string;
  /** Signed like Txn.amountCents: positive = cash out, negative = cash in. */
  amountCents: Cents;
}

/** August 2026 as planned (§6). */
export const AUGUST_2026_EVENTS: readonly CashEvent[] = [
  { date: '2026-08-11', dateLabel: '11 Aug', label: 'Amex due', amountCents: 113_100 },
  { date: '2026-08-15', dateLabel: '15 Aug', label: 'Salary', amountCents: -645_700 },
  { date: '2026-08-25', dateLabel: '25 Aug', label: 'CBA card due', amountCents: 125_000 },
  { date: null, dateLabel: 'late Aug', label: 'Moving costs', amountCents: 400_000 },
  { date: null, dateLabel: 'Aug', label: 'Repay aunt', amountCents: 500_000 },
  { date: null, dateLabel: 'Aug', label: 'Living (still boarding, no rent)', amountCents: 150_700 },
] as const;

/**
 * ~$33,569 (§6). Verified: STARTING_CASH_CENTS minus the signed sum of
 * AUGUST_2026_EVENTS reproduces this exactly (4,000,000 − 643,100 =
 * 3,356,900) — asserted in __checks__/run.ts.
 */
export const EXPECTED_END_OF_AUGUST_CASH_CENTS: Cents = 3_356_900;

/**
 * Moving costs breakdown (§6): bond + 2 weeks rent in advance + setup.
 * The bond is RECOVERABLE — an asset, not an expense; it comes back at end of
 * lease. Do not treat MOVING_COSTS_BREAKDOWN_TOTAL_CENTS as a pure expense.
 */
export const MOVING_COSTS_BREAKDOWN = {
  bondCents: 260_000 as Cents, // recoverable — comes back at end of lease
  rentInAdvanceCents: 130_000 as Cents, // 2 weeks @ $600/wk (unrelated to the sublet room)
  setupCents: 50_000 as Cents, // ~$500
} as const;

export const MOVING_COSTS_BREAKDOWN_TOTAL_CENTS: Cents =
  MOVING_COSTS_BREAKDOWN.bondCents + MOVING_COSTS_BREAKDOWN.rentInAdvanceCents + MOVING_COSTS_BREAKDOWN.setupCents; // $4,400

/**
 * INCONSISTENCY FLAGGED, NOT FUDGED: PERSONAL.md §6 states the August
 * cash-event line "Moving costs" as −$4,000 (see AUGUST_2026_EVENTS), but its
 * own breakdown two lines later — bond $2,600 + 2 weeks rent advance $1,300 +
 * setup ~$500 — sums to $4,400, $400 more. Both figures are transcribed
 * exactly as PERSONAL.md states them. EXPECTED_END_OF_AUGUST_CASH_CENTS uses
 * the −$4,000 event-table figure, because that is the number that makes the
 * document's own "~$33,569 end of August" total reconcile. See the report.
 */
export const MOVING_COSTS_DISCREPANCY_CENTS: Cents = MOVING_COSTS_BREAKDOWN_TOTAL_CENTS - 400_000; // $400

/** Flatmate's share of the bond, to be collected before lodging the full bond with NSW Fair Trading (§6). */
export const FLATMATE_BOND_SHARE_APPROX_CENTS: Cents = 140_000; // ~$1,400

export interface PlannedOneOff {
  month: MonthStr;
  label: string;
  /** Signed like Txn.amountCents: positive = spend. */
  amountCents: Cents;
}

/** Planned one-offs (§6) — must be modelled, or every projection is wrong. */
export const PLANNED_ONE_OFFS: readonly PlannedOneOff[] = [
  { month: '2026-10', label: 'PR / 189 visa + India ticket', amountCents: 950_000 }, // early Oct 2026
  { month: '2027-02', label: 'India trip balance', amountCents: 350_000 }, // Feb 2027
] as const;

export interface InterestPeriod {
  annualRatePct: number;
  /** Inclusive start; `null` = from the beginning of tracked history. */
  from: DateStr | null;
  /** Exclusive end; `null` = ongoing. */
  until: DateStr | null;
}

/** Savings interest schedule, Bankwest (§6). */
export const SAVINGS_INTEREST_SCHEDULE: readonly InterestPeriod[] = [
  { annualRatePct: 5.2, from: null, until: '2026-11-01' },
  { annualRatePct: 5.0, from: '2026-11-01', until: null },
] as const;

/**
 * The October 2026 trap (§6) — bonus-rate savers typically require deposits >
 * withdrawals each month. October fails: $9,500 out (PLANNED_ONE_OFFS) against
 * $3,500 in (the usual savings transfer). Flagged "to verify" in the source
 * document — `verified: false` on purpose. Present this as a check the user
 * still needs to confirm with Bankwest, never as established fact.
 */
export const OCTOBER_2026_TRAP = {
  month: '2026-10' as MonthStr,
  withdrawalsCents: 950_000 as Cents,
  depositsCents: 350_000 as Cents,
  /** ~$135 (§6) — the estimated cost of dropping to base rate for the month. */
  estimatedCostCents: 13_500 as Cents,
  /** Base (non-bonus) rate if the growth condition fails for the month. */
  baseRateFallbackPct: 0.65,
  verified: false,
  note:
    'Pay one-offs from an everyday account so the saver balance never dips. The growth ' +
    'condition usually has no minimum — a small fixed standing transfer on a fixed day satisfies it.',
} as const;

/** The goal (§6). */
export const GOAL = {
  targetCents: 7_233_900 as Cents, // $72,339
  targetDate: '2027-10-30' as DateStr,
  /** §10: reference only — not a calculator input. Do not build property-purchase logic around this. */
  purpose: 'Deposit for a ~$600k Sydney apartment at 10% down.',
} as const;

// ---------------------------------------------------------------------------
// §7 — Move-in date.
// ---------------------------------------------------------------------------

/**
 * Living cost while still boarding, before Settings.moveInDate (§7) — no rent,
 * no utilities, no sublet income. Matches the August 2026 "Living (still
 * boarding, no rent)" event above exactly ($1,507).
 */
export const BOARDING_MONTHLY_LIVING_COST_CENTS: Cents = 150_700;

// ---------------------------------------------------------------------------
// Savings target / payday (§0, §6, §8) — also the source for
// src/store/useStore.ts's DEFAULT_SETTINGS, so the figures aren't re-typed.
// ---------------------------------------------------------------------------

export const PLAN_DEFAULTS = {
  monthlyIncomeCents: INCOME.netMonthlyCents, // $6,457
  savingsTargetCents: 350_000 as Cents, // $3,500
  paydayDayOfMonth: 15,
  /** §8: "16th — automatic transfer to savings. Pay yourself first." Not part of the frozen Settings type. */
  autoTransferDayOfMonth: 16,
} as const;

// Sanity: the plan's own headline identity (§0) — take-home − living = savings.
// netMonthlyCents(645_700) − LIVING_COSTS_CENTS(295_700) = savingsTargetCents(350_000).
// Asserted in __checks__/run.ts.

// ---------------------------------------------------------------------------
// §9 — Risks worth surfacing in-app.
// ---------------------------------------------------------------------------

/** Room 2 vacancy: the user is liable for the full $600/wk regardless — same magnitude as the sublet offset. */
export const ROOM_VACANCY_MONTHLY_COST_CENTS: Cents = 151_700;

/**
 * A $10k raise is "+$570/month" per §9. NOTE: $10,000 × 0.68 (marginal
 * keep-rate, INCOME.marginalRatePct) ÷ 12 = $566.67/month, a ~$3/month
 * rounding difference from the document's stated $570 — minor, unlike the
 * subscriptions/moving-costs discrepancies above, so not separately flagged
 * as a check-suite assertion.
 */
export const SALARY_RAISE_SCENARIO = {
  raiseCents: 1_000_000 as Cents, // $10,000
  monthlyImpactCents: 57_000 as Cents, // "+$570/month" (§9, as stated)
} as const;
