/**
 * Tally — the one money model (DESIGN-V4.md §1, FROZEN).
 *
 * Before this module, four separate engines each answered "am I OK?" and could
 * disagree with each other on identical data: `safeToSpend.ts` (Today's hero
 * number), `foodStats.ts` (food vs $141/week), budget-cap progress (recomputed
 * ad hoc per screen), and `projection.ts` (deposit goal on/off track). This
 * module replaces all four with exactly one calculation:
 *
 *   Income  − Bills − Savings = To spend
 *   To spend − spent so far  = Left
 *   Left ÷ days remaining    = per day
 *
 * Every other figure the app shows — left today, left this week, the category
 * breakdown, food this week, the deposit-plan projection — is a VIEW of this
 * same pool, derived here, never recomputed independently by a caller. "If two
 * numbers on screen could ever disagree, one of them must go" (DESIGN-V4.md §1).
 *
 * Pure function, no store access — same convention as every other money engine
 * in this codebase (`safeToSpend.ts`, `foodStats.ts`, `projection.ts`): the
 * caller reads `useStore` and passes plain state in.
 *
 * WHY "SPENT" EXCLUDES COMMITTED-RECURRING TRANSACTIONS (read before touching
 * this): a rent payment already posted this month is counted once, as `Bills`
 * (`billsCents`, the monthly-equivalent of every active recurring series) — it
 * must NOT also be counted a second time inside `spentCents`, or committed
 * bills get double-subtracted from what's left. This exact double-count was a
 * previously-fixed P0 in `safeToSpend.ts`; the fix (excluding every txn id
 * that belongs to a currently-ACTIVE, non-muted `RecurringSeries.txnIds`) is
 * reproduced here unchanged, not re-derived. A MUTED series contributes
 * nothing to `billsCents`, so its transactions correctly fall through into
 * ordinary `spentCents` once muted — every dollar is counted exactly once,
 * either as "committed" or as "already spent", never both, never neither.
 *
 * DIVISION SAFETY: every division in this module goes through `safeDiv`
 * (`src/charts/utils.ts`) or a fixed, non-zero, non-data-dependent divisor
 * (e.g. `86_400_000` ms/day). Nothing here can produce NaN or Infinity —
 * income unset, zero transactions, no recurring detected, a past or future
 * `month`, and the last day of the month are all exercised in
 * `__checks__/run.ts`.
 */
import type { Category, Cents, DateStr, MonthStr, RecurringSeries, Settings, Txn } from '@/types';
import { safeDiv } from '@/charts/utils';
import { daysInMonth, todayStr } from '@/ui/format';
import { currentMonth } from '@/features/insights/monthMath';
import { weekWindowFor } from '@/features/food/weekMath';
import { monthlyEquivalentCents } from '@/features/recurring/detect';
import { CATEGORY_IDS, FOOD_GROUP_WEEKLY_TARGET_CENTS, GOAL } from '@/personal/plan';
import { balanceAtDate, buildGoalProjection } from '@/features/goal/projection';
import { sumFoodGroupCents } from './food';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface MonthMoneyCategoryRow {
  categoryId: string;
  label: string;
  /** Design-token name (e.g. `'cat-3'`), never a raw hex. `'ink-3'` when the
   *  category id no longer resolves to a known `Category` (deleted/unknown). */
  colorToken: string;
  spentCents: Cents;
}

export interface MonthMoneyFoodThisWeek {
  weekStart: DateStr;
  weekEnd: DateStr;
  /** 1..7, today counted as remaining (never 0 — see `weekWindowFor`). */
  daysLeft: number;
  /** PERSONAL.md §4's frozen $141/week headline, imported from `src/personal/plan.ts`. */
  targetCents: Cents;
  spentCents: Cents;
  /** targetCents − spentCents. Negative = over target. No tone attached — callers
   *  decide how (or whether) to colour it (DESIGN-V4.md §5: never the hero figure). */
  remainingCents: Cents;
  groceriesCents: Cents;
  /** eating-out + lunch + coffee. */
  awayCents: Cents;
}

export interface MonthMoneySavingsProgress {
  /** This month's Savings line — the same figure the equation subtracts. */
  monthlyTargetCents: Cents;
  goalTargetCents: Cents;
  goalTargetDate: DateStr;
  /** The plan's projected balance as of `today`, computed by re-running the SAME
   *  projection engine (`src/features/goal/projection.ts`) with `monthlyTargetCents`
   *  as its monthly contribution — never a second, independently-typed number. */
  projectedBalanceCents: Cents;
  /** The user's actual entered balance, or the projection when never entered. */
  actualBalanceCents: Cents;
  /** False when `actualBalanceCents` is really `projectedBalanceCents` standing in —
   *  the app can't observe a bank balance, only what's been logged (DESIGN-V4.md §4). */
  isBalanceUserEntered: boolean;
  /** projectedBalanceCents − actualBalanceCents. Positive = behind plan. */
  behindCents: Cents;
  onTrack: boolean;
  /** Whole days from `today` to `goalTargetDate`. Can be negative if the date has passed. */
  daysUntilTarget: number;
}

export interface MonthMoney {
  month: MonthStr;
  today: DateStr;

  /** True when `settings.monthlyIncomeCents` is 0/unset — caller must show a prompt in
   *  the Income line, never a fake number (DESIGN-V4.md §1/§3). */
  incomeUnset: boolean;
  incomeCents: Cents;
  /** Monthly-equivalent cost of active (non-muted) recurring series — rent, utilities,
   *  subscriptions. Single definition, reused from `src/features/recurring/detect.ts`. */
  billsCents: Cents;
  /** `settings.savingsTargetCents`, floored at 0. */
  savingsCents: Cents;
  /** Income − Bills − Savings. The discretionary pool for the whole month. Can be negative. */
  toSpendCents: Cents;
  /** Discretionary spend already logged this month — excludes committed-recurring
   *  transactions (see this module's doc comment on double-counting). */
  spentCents: Cents;
  /** toSpendCents − spentCents. Can be negative. */
  leftCents: Cents;
  /** Always >= 1 for the current month; 0 for a month that's already fully in the past. */
  daysRemaining: number;
  /** leftCents ÷ daysRemaining, rounded to the nearest cent. */
  leftTodayCents: Cents;
  /** 1..7 — days left in the Monday-Sunday week containing `today`. */
  daysLeftInWeek: number;
  /** leftTodayCents × daysLeftInWeek exactly — never recomputed independently. */
  leftThisWeekCents: Cents;
  /** The breakdown of `spentCents`, largest first. Sums to `spentCents` exactly by
   *  construction (both are built from the same filtered transaction set). */
  byCategory: MonthMoneyCategoryRow[];
  foodThisWeek: MonthMoneyFoodThisWeek;
  savingsProgress: MonthMoneySavingsProgress;
}

export interface ComputeMonthMoneyParams {
  txns: Txn[];
  recurring: RecurringSeries[];
  settings: Settings;
  categories: Category[];
  /** Defaults to the current calendar month. */
  month?: MonthStr;
  /** Defaults to today. Exposed for testability. */
  today?: DateStr;
}

// ---------------------------------------------------------------------------
// The one calculation
// ---------------------------------------------------------------------------

export function computeMonthMoney({
  txns,
  recurring,
  settings,
  categories,
  month = currentMonth(),
  today = todayStr(),
}: ComputeMonthMoneyParams): MonthMoney {
  const incomeCents = settings.monthlyIncomeCents;
  const incomeUnset = !incomeCents || incomeCents <= 0;

  const activeSeries = recurring.filter((r) => !r.muted);
  const billsCents = activeSeries.reduce((sum, r) => sum + monthlyEquivalentCents(r), 0);

  // Every txn id belonging to a currently-active series is already represented in
  // `billsCents` — exclude it from `spentCents` (and from `foodThisWeek`, below) so
  // it is never double-counted. See the module doc comment.
  const committedTxnIds = new Set<string>();
  for (const series of activeSeries) {
    for (const txnId of series.txnIds) committedTxnIds.add(txnId);
  }

  const savingsCents = Math.max(0, settings.savingsTargetCents);
  const toSpendCents = incomeCents - billsCents - savingsCents;

  const monthTxns = txns.filter(
    (t) => t.date.startsWith(month) && !t.excluded && t.amountCents > 0 && !committedTxnIds.has(t.id)
  );
  const spentCents = monthTxns.reduce((sum, t) => sum + t.amountCents, 0);
  const leftCents = toSpendCents - spentCents;

  const daysRemaining = daysRemainingInMonth(month, today);
  const leftTodayCents = Math.round(safeDiv(leftCents, daysRemaining, 0));

  const week = weekWindowFor(today);
  const leftThisWeekCents = leftTodayCents * week.daysLeft;

  const byCategory = buildCategoryBreakdown(monthTxns, categories);
  const foodThisWeek = buildFoodThisWeek(txns, committedTxnIds, week.weekStart, week.weekEnd, week.daysLeft);
  const savingsProgress = buildSavingsProgress(settings, savingsCents, today);

  return {
    month,
    today,
    incomeUnset,
    incomeCents,
    billsCents,
    savingsCents,
    toSpendCents,
    spentCents,
    leftCents,
    daysRemaining,
    leftTodayCents,
    daysLeftInWeek: week.daysLeft,
    leftThisWeekCents,
    byCategory,
    foodThisWeek,
    savingsProgress,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildCategoryBreakdown(monthTxns: Txn[], categories: Category[]): MonthMoneyCategoryRow[] {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, Cents>();
  for (const t of monthTxns) {
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amountCents);
  }

  const rows: MonthMoneyCategoryRow[] = Array.from(totals.entries()).map(([categoryId, spentCents]) => {
    const cat = catById.get(categoryId);
    return {
      categoryId,
      label: cat?.label ?? categoryId,
      colorToken: cat?.colorToken ?? 'ink-3',
      spentCents,
    };
  });

  return rows.sort((a, b) => b.spentCents - a.spentCents);
}

function buildFoodThisWeek(
  txns: Txn[],
  committedTxnIds: ReadonlySet<string>,
  weekStart: DateStr,
  weekEnd: DateStr,
  daysLeft: number
): MonthMoneyFoodThisWeek {
  const targetCents = FOOD_GROUP_WEEKLY_TARGET_CENTS;
  const totals = sumFoodGroupCents(txns, weekStart, weekEnd, committedTxnIds);
  return {
    weekStart,
    weekEnd,
    daysLeft,
    targetCents,
    spentCents: totals.totalCents,
    remainingCents: targetCents - totals.totalCents,
    groceriesCents: totals.groceriesCents,
    awayCents: totals.awayCents,
  };
}

function buildSavingsProgress(settings: Settings, monthlyTargetCents: Cents, today: DateStr): MonthMoneySavingsProgress {
  // Reuse the goal feature's own compounding-projection engine rather than a second
  // one — but pass THIS month's live Savings line as its monthly contribution, so
  // the equation's Savings figure and the deposit plan's assumed contribution can
  // never drift apart (DESIGN-V4.md §1: "Deposit goal = the Savings line, projected
  // forward. Same number, longer view.").
  const projection = buildGoalProjection({ monthlyContributionCents: monthlyTargetCents });
  const projectedBalanceCents = balanceAtDate(projection.input, projection.points, today);

  const stored = settings.goalCurrentBalanceCents;
  const isBalanceUserEntered = stored !== undefined && stored !== null;
  const actualBalanceCents = isBalanceUserEntered ? (stored as Cents) : projectedBalanceCents;

  const behindCents = projectedBalanceCents - actualBalanceCents;

  return {
    monthlyTargetCents,
    goalTargetCents: GOAL.targetCents,
    goalTargetDate: GOAL.targetDate,
    projectedBalanceCents,
    actualBalanceCents,
    isBalanceUserEntered,
    behindCents,
    onTrack: behindCents <= 0,
    daysUntilTarget: daysBetween(today, GOAL.targetDate),
  };
}

/**
 * Days remaining in `month`, counting `today` as remaining (i.e. "today included"),
 * always >= 1 for the month containing `today` so a same-day divide is never by
 * zero. A past month collapses to 0; a future month returns its full length.
 *
 * Mirrors `src/features/insights/monthMath.ts`'s `daysRemainingInMonth` exactly, but
 * takes an injectable `today` — that module hardcodes real `todayStr()` internally
 * and has no way to accept one, which would make this whole module untestable with a
 * fixed date (every check would silently depend on the real calendar date it happens
 * to run on). Reimplemented locally rather than reused for that reason alone; the
 * algorithm itself is not a second definition of anything — see this function's own
 * check-suite coverage (past/future month, last day of month).
 */
function daysRemainingInMonth(month: MonthStr, today: DateStr): number {
  const total = daysInMonth(month);
  const todayMonth = today.slice(0, 7);
  if (month > todayMonth) return total;
  if (month < todayMonth) return 0;
  const day = Number(today.slice(8, 10));
  return Math.max(1, total - day + 1);
}

/** Whole days from `from` to `to` (can be negative if `to` has already passed). The
 *  divisor is a fixed ms-per-day constant, not data-dependent, so this never divides
 *  by zero. Computed locally (rather than importing `goal/dateMath.ts`'s `daysUntil`)
 *  because that helper hardcodes real `todayStr()` internally and can't take an
 *  injected `today` — this module must stay fully testable with a fixed date. */
function daysBetween(from: DateStr, to: DateStr): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = new Date(fy, fm - 1, fd).getTime();
  const b = new Date(ty, tm - 1, td).getTime();
  return Math.round((b - a) / 86_400_000);
}

// `CATEGORY_IDS` re-exported for callers that want to point at the frozen food/
// income/savings category ids without importing `@/personal/plan` a second time.
export { CATEGORY_IDS };
