/**
 * Food-week statistics — the pure math behind the Home screen's hero card
 * (PERSONAL.md §4). No store access; the caller reads `useStore` and passes
 * `txns` in, same convention as `../dashboard/safeToSpend.ts`.
 *
 * Every division is guarded via `safeDiv` (src/charts/utils.ts) so a
 * brand-new week (zero transactions) or a week with no coffee never produces
 * NaN/Infinity — PERSONAL.md's "start-of-week case" and CONTRACTS.md §4's
 * "guard every division" apply everywhere below.
 */
import type { Cents, DateStr, Txn } from '@/types';
import { todayStr } from '@/ui/format';
import { safeDiv } from '@/charts';
import { weekWindowFor, previousWeekBounds, isInWeek } from './weekMath';
import {
  GROCERIES_CATEGORY_ID,
  EATING_OUT_CATEGORY_ID,
  LUNCH_CATEGORY_ID,
  COFFEE_CATEGORY_ID,
  isFoodCategoryId,
} from './config';

export type PaceStatus = 'under' | 'over' | 'on-track';

export interface FoodBucketTotals {
  groceriesCents: Cents;
  eatingOutCents: Cents;
  lunchCents: Cents;
  coffeeCents: Cents;
  /** eating-out + lunch + coffee — "someone else made it" vs groceries "cooked at home". */
  awayCents: Cents;
  /** groceries + away. */
  totalCents: Cents;
}

export interface CoffeeStats {
  count: number;
  totalCents: Cents;
  /** Guarded — 0 (not NaN) when `count` is 0. */
  avgCents: Cents;
}

export interface FoodWeekStats {
  weekStart: DateStr;
  weekEnd: DateStr;
  today: DateStr;
  /** 1..7, today counted as elapsed. */
  daysElapsed: number;
  /** 1..7, today counted as remaining. */
  daysLeft: number;
  targetCents: Cents;
  spentCents: Cents;
  /** targetCents - spentCents. Negative = over target. Purely informational — no tone
   *  attached here; callers decide how (or whether) to colour it. */
  remainingCents: Cents;
  buckets: FoodBucketTotals;
  /** groceries / (groceries + away), guarded to 0 when nothing's been spent. */
  groceriesRatio: number;
  /** away / (groceries + away), guarded to 0 when nothing's been spent. */
  awayRatio: number;
  /** Run-rate extrapolated to Sunday: spentCents / daysElapsed * 7, rounded. */
  projectedWeekTotalCents: Cents;
  /** 'on-track' when nothing has been spent yet — a guess this early is noise, not signal. */
  paceStatus: PaceStatus;
  /** projectedWeekTotalCents - targetCents. */
  paceDeltaCents: Cents;
  coffee: CoffeeStats;
  txnCount: number;
  lastWeek: {
    spentCents: Cents;
    coffee: CoffeeStats;
  };
  /** spentCents - lastWeek.spentCents. */
  vsLastWeekDeltaCents: Cents;
}

function isFoodSpend(t: Txn): boolean {
  return !t.excluded && t.amountCents > 0 && isFoodCategoryId(t.categoryId);
}

function sumBuckets(txns: Txn[]): FoodBucketTotals & { coffeeCount: number } {
  let groceriesCents = 0;
  let eatingOutCents = 0;
  let lunchCents = 0;
  let coffeeCents = 0;
  let coffeeCount = 0;

  for (const t of txns) {
    if (t.categoryId === GROCERIES_CATEGORY_ID) {
      groceriesCents += t.amountCents;
    } else if (t.categoryId === LUNCH_CATEGORY_ID) {
      lunchCents += t.amountCents;
    } else if (t.categoryId === COFFEE_CATEGORY_ID) {
      coffeeCents += t.amountCents;
      coffeeCount += 1;
    } else if (t.categoryId === EATING_OUT_CATEGORY_ID) {
      eatingOutCents += t.amountCents;
    }
  }

  const awayCents = eatingOutCents + lunchCents + coffeeCents;
  return {
    groceriesCents,
    eatingOutCents,
    lunchCents,
    coffeeCents,
    awayCents,
    totalCents: groceriesCents + awayCents,
    coffeeCount,
  };
}

function coffeeStatsFrom(bucket: { coffeeCents: Cents; coffeeCount: number }): CoffeeStats {
  return {
    count: bucket.coffeeCount,
    totalCents: bucket.coffeeCents,
    avgCents: Math.round(safeDiv(bucket.coffeeCents, bucket.coffeeCount, 0)),
  };
}

/**
 * Compute this week's (and last week's, for comparison) food-group stats from raw
 * transactions. `targetCents` comes from `./config`'s `FOOD_WEEKLY_TARGET_CENTS`
 * (imported from the plan, never hardcoded) — passed as a parameter here so this
 * function stays a pure, easily-tested unit, same pattern as `computeSafeToSpend`.
 */
export function computeFoodWeekStats(
  txns: Txn[],
  targetCents: Cents,
  today: DateStr = todayStr()
): FoodWeekStats {
  const window = weekWindowFor(today);
  const prev = previousWeekBounds(window.weekStart);

  const thisWeekTxns = txns.filter((t) => isFoodSpend(t) && isInWeek(t.date, window.weekStart, window.weekEnd));
  const lastWeekTxns = txns.filter((t) => isFoodSpend(t) && isInWeek(t.date, prev.weekStart, prev.weekEnd));

  const thisBuckets = sumBuckets(thisWeekTxns);
  const lastBuckets = sumBuckets(lastWeekTxns);

  const spentCents = thisBuckets.totalCents;
  const remainingCents = targetCents - spentCents;
  const groceriesRatio = safeDiv(thisBuckets.groceriesCents, thisBuckets.totalCents, 0);
  const awayRatio = safeDiv(thisBuckets.awayCents, thisBuckets.totalCents, 0);

  const projectedWeekTotalCents = Math.round(safeDiv(spentCents, window.daysElapsed, 0) * 7);
  const paceDeltaCents = projectedWeekTotalCents - targetCents;
  const paceStatus: PaceStatus =
    spentCents === 0 ? 'on-track' : paceDeltaCents > 0 ? 'over' : paceDeltaCents < 0 ? 'under' : 'on-track';

  return {
    weekStart: window.weekStart,
    weekEnd: window.weekEnd,
    today,
    daysElapsed: window.daysElapsed,
    daysLeft: window.daysLeft,
    targetCents,
    spentCents,
    remainingCents,
    buckets: {
      groceriesCents: thisBuckets.groceriesCents,
      eatingOutCents: thisBuckets.eatingOutCents,
      lunchCents: thisBuckets.lunchCents,
      coffeeCents: thisBuckets.coffeeCents,
      awayCents: thisBuckets.awayCents,
      totalCents: thisBuckets.totalCents,
    },
    groceriesRatio,
    awayRatio,
    projectedWeekTotalCents,
    paceStatus,
    paceDeltaCents,
    coffee: coffeeStatsFrom(thisBuckets),
    txnCount: thisWeekTxns.length,
    lastWeek: {
      spentCents: lastBuckets.totalCents,
      coffee: coffeeStatsFrom(lastBuckets),
    },
    vsLastWeekDeltaCents: spentCents - lastBuckets.totalCents,
  };
}
