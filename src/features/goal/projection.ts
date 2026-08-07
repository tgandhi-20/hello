/**
 * Deposit-goal projection engine — pure, no store access, no React.
 *
 * Simulates the Bankwest savings balance month by month from the end of August 2026
 * (the plan's own baseline, docs/PERSONAL.md §6, `EXPECTED_END_OF_AUGUST_CASH_CENTS`
 * in src/personal/plan.ts) through to the settlement target, applying the $3,500/month
 * contribution, the two planned one-off withdrawals, and the two-tier interest rate.
 *
 * ===================================================================================
 * COMPOUNDING CONVENTION (read before changing any number in here)
 * ===================================================================================
 *
 * 1. NOMINAL annual rate ÷ 12, not an effective monthly rate. Australian ADIs quote
 *    savings rates as "X% p.a." compounding monthly — the monthly rate they actually
 *    apply is `annualRatePct / 100 / 12`, not `(1 + annualRatePct/100)^(1/12) - 1`.
 *    The nominal convention is what shows up on a Bankwest statement, so it's what a
 *    tracker reproducing that statement should use.
 *
 * 2. Interest for month M is computed on the OPENING balance — the balance carried in
 *    from month M−1's close, before month M's contribution or one-off is applied.
 *    Money that arrives (or leaves) during a month is treated as available for the
 *    *following* month's interest, not the current one. This is a simplification (a
 *    real account accrues daily on the actual daily balance) but it's the standard
 *    simplification for a monthly-granularity projection, and it has a defensible
 *    direction of error: it slightly OVERSTATES interest in a month with a large
 *    withdrawal (October 2026's $9,500 doesn't reduce that month's own interest base)
 *    and slightly UNDERSTATES it in a month with only a deposit. The two effects
 *    partially cancel over the projection, and neither is hidden — see the check
 *    suite's "one-offs land in the right month" assertions, which confirm the
 *    withdrawal still reduces the running balance starting that month even though it
 *    doesn't affect that month's own interest base.
 *
 * 3. Rounding: `grossInterestCents` and `taxCents` are each rounded to the nearest
 *    cent independently, every month, before being added to the running balance.
 *    That keeps every `closingBalanceCents` an exact integer at every step (no
 *    fractional cents ever accumulate silently across 14+ months of compounding).
 *
 * ===================================================================================
 * TAX CONVENTION — this projection is POST-TAX
 * ===================================================================================
 *
 * Interest income is taxable at the user's marginal rate (`INCOME.marginalRatePct`,
 * 32%, docs/PERSONAL.md §2). Every month, `netInterestCents = grossInterestCents −
 * round(grossInterestCents × 0.32)` is what actually compounds into the running
 * balance — not the full pre-tax amount a raw Bankwest statement would show.
 *
 * Two things are true at once and worth being explicit about:
 *   - In real life the ATO doesn't withhold this monthly; the user pays it as part of
 *     their income tax return, typically months later, as a lump sum. The actual bank
 *     balance on any given date in 2027 will read HIGHER than this projection's
 *     `closingBalanceCents` for that reason.
 *   - But money owed to the ATO isn't really "accessible cash for a deposit" — it's
 *     spoken for. A goal tracker whose whole job is "how much can I actually put
 *     toward the apartment" undercounts the risk if it compounds pre-tax dollars and
 *     calls the result available. Netting the tax out monthly is a conservative
 *     approximation of that reality: some of it is early (tax isn't actually owed
 *     until assessment), but the running total this module reports is a true
 *     lower-bound on spendable, not-owed-to-anyone cash.
 *
 * `GOAL.targetCents` ($72,339) is discussed against a plan that reasons about
 * interest "after tax" elsewhere (docs/PERSONAL.md §2's marginal-rate framing), which
 * is why post-tax was chosen here despite pre-tax landing much closer to that exact
 * number — see the check suite and the goal feature's report for the size of that gap
 * and the reading of it: pre-tax reproduces $72,339 to within about a dollar, which
 * suggests the plan's own $72,339 was computed WITHOUT netting out tax. This module
 * does not silently retune itself to match — it reports the gap instead.
 */
import type { Cents, DateStr, MonthStr } from '@/types';
import { daysInMonth } from '@/ui/format';
import {
  AUGUST_2026_EVENTS,
  EXPECTED_END_OF_AUGUST_CASH_CENTS,
  GOAL,
  INCOME,
  OCTOBER_2026_TRAP,
  PLAN_DEFAULTS,
  PLANNED_ONE_OFFS,
  SAVINGS_INTEREST_SCHEDULE,
  STARTING_CASH_CENTS,
  STARTING_CASH_DATE,
  type PlannedOneOff,
} from '@/personal/plan';

// ===================================================================================
// Month arithmetic — self-contained (this feature owns no shared date-math module and
// deliberately doesn't reach into another agent's feature directory for it).
// ===================================================================================

/** Extract the `YYYY-MM` MonthStr a DateStr falls in. */
export function monthOf(date: DateStr): MonthStr {
  return date.slice(0, 7);
}

/** `month` shifted by `delta` whole months (negative goes backward). Correct across
 *  year boundaries: `addMonths('2026-12', 1) === '2027-01'`. */
export function addMonths(month: MonthStr, delta: number): MonthStr {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

/** Number of whole months from `fromMonth` to `toMonth` (can be negative). */
export function monthsBetween(fromMonth: MonthStr, toMonth: MonthStr): number {
  const [fy, fm] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  return (ty * 12 + tm) - (fy * 12 + fm);
}

/** Day-of-month as a 0..1 fraction through the month (day 1 → 0, last day → 1). Used
 *  only for interpolating a balance to a specific day, never for interest maths. */
function dayFraction(date: DateStr): number {
  const day = Number(date.slice(8, 10));
  const total = daysInMonth(monthOf(date));
  if (total <= 1) return 0;
  return Math.max(0, Math.min(1, (day - 1) / (total - 1)));
}

/** The `YYYY-MM` baseline month the plan's starting balance is anchored to
 *  (end of August 2026 — derived from STARTING_CASH_DATE, not re-typed). */
export const BASELINE_MONTH: MonthStr = monthOf(STARTING_CASH_DATE);

/** Interest rate in effect for `month`, from `SAVINGS_INTEREST_SCHEDULE`. Periods use
 *  `from`/`until` as DateStrs (inclusive/exclusive) rather than MonthStrs, so this
 *  compares against the month's first day rather than the month string itself —
 *  string-comparing '2026-11' against '2026-11-01' directly would be wrong (a prefix
 *  sorts before the longer string it prefixes). */
function rateForMonth(month: MonthStr): number {
  const monthStart = `${month}-01`;
  for (const period of SAVINGS_INTEREST_SCHEDULE) {
    const afterFrom = period.from === null || monthStart >= period.from;
    const beforeUntil = period.until === null || monthStart < period.until;
    if (afterFrom && beforeUntil) return period.annualRatePct;
  }
  return 0; // defensive fallback; SAVINGS_INTEREST_SCHEDULE covers all time as written
}

// ===================================================================================
// The engine
// ===================================================================================

export interface MonthlyProjectionPoint {
  month: MonthStr;
  openingBalanceCents: Cents;
  annualRatePct: number;
  /** Standard recurring contribution applied this month (0 in a zero-contribution what-if). */
  contributionCents: Cents;
  /** Net signed effect of any one-off(s) landing this month: negative = withdrawal. 0 if none. */
  oneOffCents: Cents;
  oneOffLabels: readonly string[];
  grossInterestCents: Cents;
  taxCents: Cents;
  /** What actually compounds into the balance — see module doc comment. */
  netInterestCents: Cents;
  closingBalanceCents: Cents;
  /** Money IN this month (the contribution; one-offs are never modelled as deposits). */
  depositsCents: Cents;
  /** Money OUT this month (sum of one-off withdrawal magnitudes). */
  withdrawalsCents: Cents;
  /** PERSONAL.md §6's bonus-rate trap: true when withdrawals strictly exceed deposits.
   *  See bonusRateGuard.ts — this flag alone is the detector; that module adds the
   *  UNVERIFIED framing and the suggested fix. */
  withdrawalsExceedDeposits: boolean;
}

export interface ProjectionInput {
  startBalanceCents: Cents;
  /** The month whose END `startBalanceCents` represents — projection begins the month after. */
  startMonth: MonthStr;
  monthlyContributionCents: Cents;
  oneOffs: readonly PlannedOneOff[];
  marginalTaxRate: number;
  monthsToProject: number;
}

/** Simulate the account forward from `input.startMonth`'s end. Pure — same input,
 *  same output, every time. Every division in this module is either a fixed literal
 *  (÷100, ÷12) or guarded (`dayFraction` guards `total <= 1`), so there is no path to
 *  NaN/Infinity even with a zero contribution or an empty one-off list. */
export function projectMonths(input: ProjectionInput): MonthlyProjectionPoint[] {
  const points: MonthlyProjectionPoint[] = [];
  let balance = input.startBalanceCents;
  let month = addMonths(input.startMonth, 1);

  const horizon = Math.max(0, input.monthsToProject);
  for (let i = 0; i < horizon; i++) {
    const opening = balance;
    const annualRatePct = rateForMonth(month);
    const monthlyRate = annualRatePct / 100 / 12;
    const grossInterestCents = Math.round(opening * monthlyRate);
    const taxCents = Math.round(grossInterestCents * input.marginalTaxRate);
    const netInterestCents = grossInterestCents - taxCents;

    const oneOffsThisMonth = input.oneOffs.filter((o) => o.month === month);
    // PlannedOneOff.amountCents follows the Txn convention (positive = spend), so it's
    // already the withdrawal magnitude — no sign flip needed.
    const withdrawalsCents = oneOffsThisMonth.reduce((sum, o) => sum + Math.max(0, o.amountCents), 0);
    const oneOffCents = -withdrawalsCents;
    const oneOffLabels = oneOffsThisMonth.map((o) => o.label);

    const contributionCents = input.monthlyContributionCents;
    const depositsCents = Math.max(0, contributionCents);

    const closingBalanceCents = opening + netInterestCents + contributionCents + oneOffCents;

    points.push({
      month,
      openingBalanceCents: opening,
      annualRatePct,
      contributionCents,
      oneOffCents,
      oneOffLabels,
      grossInterestCents,
      taxCents,
      netInterestCents,
      closingBalanceCents,
      depositsCents,
      withdrawalsCents,
      withdrawalsExceedDeposits: withdrawalsCents > depositsCents,
    });

    balance = closingBalanceCents;
    month = addMonths(month, 1);
  }

  return points;
}

/** The exact number of months a default (plan-defaults) projection needs to reach the
 *  month the target date falls in, counting from the end-of-August baseline. */
export function defaultHorizonMonths(): number {
  return Math.max(0, monthsBetween(BASELINE_MONTH, monthOf(GOAL.targetDate)));
}

/** Build a `ProjectionInput` from docs/PERSONAL.md's own figures via src/personal/plan.ts,
 *  with any field overridable — e.g. `{ monthlyContributionCents: 0 }` for a stress test,
 *  or a different rate for a what-if. */
export function defaultProjectionInput(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    startBalanceCents: EXPECTED_END_OF_AUGUST_CASH_CENTS,
    startMonth: BASELINE_MONTH,
    monthlyContributionCents: PLAN_DEFAULTS.savingsTargetCents,
    oneOffs: PLANNED_ONE_OFFS,
    marginalTaxRate: INCOME.marginalRatePct / 100,
    monthsToProject: defaultHorizonMonths(),
    ...overrides,
  };
}

export interface GoalProjectionResult {
  input: ProjectionInput;
  points: MonthlyProjectionPoint[];
  /** Balance at `GOAL.targetDate`, linearly interpolated within its month by
   *  day-of-month (30 Oct 2027 is the 30th of a 31-day month, not the month's close). */
  finalBalanceCents: Cents;
  targetCents: Cents;
  targetDate: DateStr;
  /** finalBalanceCents − targetCents. Positive = ahead of target, negative = short. */
  gapCents: Cents;
}

/** Run the default (plan-figures) projection end to end and evaluate it against the
 *  plan's own $72,339 target. This is what the goal card/screen render by default;
 *  the what-if calculator (whatIf.ts) calls `projectMonths` directly with a different
 *  contribution instead of this convenience wrapper. */
export function buildGoalProjection(overrides: Partial<ProjectionInput> = {}): GoalProjectionResult {
  const input = defaultProjectionInput(overrides);
  const points = projectMonths(input);
  const finalBalanceCents = balanceAtDate(input, points, GOAL.targetDate);
  return {
    input,
    points,
    finalBalanceCents,
    targetCents: GOAL.targetCents,
    targetDate: GOAL.targetDate,
    gapCents: finalBalanceCents - GOAL.targetCents,
  };
}

// ===================================================================================
// "Planned balance as of an arbitrary date" — powers the ON/OFF-track comparison.
//
// Three phases, because the plan's own baseline (`EXPECTED_END_OF_AUGUST_CASH_CENTS`)
// is itself a few weeks in the FUTURE relative to whenever "today" happens to be
// early in the plan (e.g. the plan was written in the first days of August 2026,
// before its own August cashflow — salary, moving costs, the Amex bill — has
// happened yet). Treating "today" as always being after the baseline would silently
// invent a number for a period the plan hasn't reached. Instead:
//
//   1. Before STARTING_CASH_DATE (3 Aug 2026): the plan hasn't started. Report the
//      starting cash figure as-is.
//   2. Between STARTING_CASH_DATE and end of August 2026: reconstruct the running
//      balance from AUGUST_2026_EVENTS, the plan's own dated cashflow. Three of the
//      six events don't carry an exact day in the source document ("late Aug"/"Aug")
//      — those are treated as landing on the last day of August for this
//      reconstruction (a defensible placement given "late Aug" for one of them, and
//      the safest assumption for a progress check: it doesn't claim money has left
//      before it's confirmed to have).
//   3. From September 2026 onward: use the monthly-granularity `points`, linearly
//      interpolating within a month by day-of-month between its opening and closing
//      balance (a straight line is an approximation of monthly compounding + a single
//      contribution/withdrawal event, but it's continuous and never discontinuous at
//      a month boundary, which matters for a chart people will actually look at).
// ===================================================================================

/** Reconstruct the plan's own running balance across August 2026 from its dated
 *  cashflow events (docs/PERSONAL.md §6, `AUGUST_2026_EVENTS`), for dates that fall
 *  inside that month. `CashEvent.amountCents` follows the Txn convention (positive =
 *  cash out), so each event SUBTRACTS from the running balance. */
export function augustRunningBalance(date: DateStr): Cents {
  const monthEndDay = daysInMonth(monthOf(date));
  const monthEndDate: DateStr = `${monthOf(date)}-${String(monthEndDay).padStart(2, '0')}`;
  let balance = STARTING_CASH_CENTS;
  for (const event of AUGUST_2026_EVENTS) {
    const effectiveDate = event.date ?? monthEndDate; // undated events assumed to land at month-end
    if (effectiveDate <= date) balance -= event.amountCents;
  }
  return balance;
}

/** Balance the plan expects on an arbitrary date, given a projection's `points`. See
 *  the three-phase doc comment above. Never NaN/Infinity: every branch either returns
 *  a stored constant or a bounded interpolation. */
export function balanceAtDate(
  input: Pick<ProjectionInput, 'startMonth' | 'startBalanceCents'>,
  points: readonly MonthlyProjectionPoint[],
  date: DateStr
): Cents {
  if (date < STARTING_CASH_DATE) return STARTING_CASH_CENTS;

  const augustEnd = addMonths(input.startMonth, 1); // first month AFTER the baseline month
  if (date < `${augustEnd}-01`) return augustRunningBalance(date);

  if (points.length === 0) return input.startBalanceCents;

  const targetMonth = monthOf(date);
  if (targetMonth < points[0].month) return input.startBalanceCents;

  const last = points[points.length - 1];
  if (targetMonth > last.month) return last.closingBalanceCents;

  const point = points.find((p) => p.month === targetMonth);
  if (!point) return last.closingBalanceCents; // defensive; unreachable given the bounds above

  const frac = dayFraction(date);
  return Math.round(point.openingBalanceCents + (point.closingBalanceCents - point.openingBalanceCents) * frac);
}

/** Re-exported for callers that want the raw "to verify" trap object alongside the
 *  computed guard (bonusRateGuard.ts) without a second import. */
export { OCTOBER_2026_TRAP };
