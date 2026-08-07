/**
 * Plain, node-runnable checks for the weekly food tracker (no test framework is
 * installed in this repo — see src/import/__checks__/run.ts for the pattern).
 * Run with: `npx tsx src/features/food/__checks__/run.ts`
 *
 * Never logs a transaction, amount, or merchant beyond the small synthetic
 * fixtures constructed inline below.
 */
import type { Txn } from '../../../types';
import { mondayIndexOf, weekWindowFor, previousWeekBounds, isInWeek } from '../weekMath';
import { computeFoodWeekStats } from '../foodStats';
import {
  FOOD_CATEGORY_IDS,
  GROCERIES_CATEGORY_ID,
  EATING_OUT_CATEGORY_ID,
  LUNCH_CATEGORY_ID,
  COFFEE_CATEGORY_ID,
} from '../config';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(detail ? `${name} — ${detail}` : name);
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  const ok = actual === expected;
  check(name, ok, ok ? undefined : `expected ${String(expected)}, got ${String(actual)}`);
}

let txnSeq = 0;
function mkTxn(date: string, amountCents: number, categoryId: string, extra: Partial<Txn> = {}): Txn {
  txnSeq += 1;
  return {
    id: `txn-${txnSeq}`,
    date,
    amountCents,
    description: 'fixture',
    merchant: 'fixture',
    categoryId,
    account: 'cash',
    source: 'manual',
    hash: `hash-${txnSeq}`,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

async function main(): Promise<void> {
  console.log('--- Tally food-tracker checks ---\n');

  // ===================================================================
  // 1. Monday-start week boundaries — a Monday, a Sunday, and a mid-week date,
  //    including a case that crosses a month boundary.
  // ===================================================================
  {
    // 2026-08-03 is a Monday (2026-08-07, "today" per this run's system context, is a
    // Friday; Friday minus 4 days is Monday 3 Aug).
    eq('mondayIndexOf(Monday 2026-08-03) -> 0', mondayIndexOf('2026-08-03'), 0);
    eq('mondayIndexOf(Sunday 2026-08-09) -> 6', mondayIndexOf('2026-08-09'), 6);
    eq('mondayIndexOf(Wednesday 2026-08-05) -> 2', mondayIndexOf('2026-08-05'), 2);

    const monday = weekWindowFor('2026-08-03');
    eq('Monday: weekStart === itself', monday.weekStart, '2026-08-03');
    eq('Monday: weekEnd is the following Sunday', monday.weekEnd, '2026-08-09');
    eq('Monday: daysElapsed === 1', monday.daysElapsed, 1);
    eq('Monday: daysLeft === 7', monday.daysLeft, 7);

    const sunday = weekWindowFor('2026-08-09');
    eq('Sunday: weekStart is the preceding Monday', sunday.weekStart, '2026-08-03');
    eq('Sunday: weekEnd === itself', sunday.weekEnd, '2026-08-09');
    eq('Sunday: daysElapsed === 7', sunday.daysElapsed, 7);
    eq('Sunday: daysLeft === 1 (today still counts as remaining)', sunday.daysLeft, 1);

    const midweek = weekWindowFor('2026-08-05');
    eq('Wednesday: weekStart is that week\'s Monday', midweek.weekStart, '2026-08-03');
    eq('Wednesday: weekEnd is that week\'s Sunday', midweek.weekEnd, '2026-08-09');
    eq('Wednesday: daysElapsed === 3', midweek.daysElapsed, 3);
    // Wed, Thu, Fri, Sat, Sun = 5 days remaining (today counted as remaining).
    eq('Wednesday: daysLeft === 5', midweek.daysLeft, 5);

    // Every day of the week: elapsed + left always sums to 8 (today double-counted by
    // design, both conventions inclusive of "today") and both are always >= 1.
    for (let i = 0; i < 7; i++) {
      const w = weekWindowFor(`2026-08-0${3 + i}`);
      check(`day index ${i}: daysElapsed(${w.daysElapsed}) + daysLeft(${w.daysLeft}) === 8`, w.daysElapsed + w.daysLeft === 8);
      check(`day index ${i}: daysElapsed >= 1`, w.daysElapsed >= 1);
      check(`day index ${i}: daysLeft >= 1`, w.daysLeft >= 1);
    }

    // A week that crosses a month boundary: Monday 27 Jul 2026 -> Sunday 2 Aug 2026.
    const crossing = weekWindowFor('2026-07-30'); // Thursday
    eq('Month-crossing week: weekStart', crossing.weekStart, '2026-07-27');
    eq('Month-crossing week: weekEnd', crossing.weekEnd, '2026-08-02');

    const prev = previousWeekBounds(monday.weekStart);
    eq('previousWeekBounds: weekStart is 7 days earlier', prev.weekStart, '2026-07-27');
    eq('previousWeekBounds: weekEnd is the Sunday before this week starts', prev.weekEnd, '2026-08-02');

    check('isInWeek: boundary Monday included', isInWeek('2026-08-03', '2026-08-03', '2026-08-09'));
    check('isInWeek: boundary Sunday included', isInWeek('2026-08-09', '2026-08-03', '2026-08-09'));
    check('isInWeek: day before week excluded', !isInWeek('2026-08-02', '2026-08-03', '2026-08-09'));
    check('isInWeek: day after week excluded', !isInWeek('2026-08-10', '2026-08-03', '2026-08-09'));
  }

  // ===================================================================
  // 2. Weekly total only counts the four food categories, and a non-food
  //    category never leaks into the sum.
  // ===================================================================
  {
    const today = '2026-08-05'; // Wednesday of the 3-9 Aug week
    const txns: Txn[] = [
      mkTxn('2026-08-04', 5000, GROCERIES_CATEGORY_ID), // $50
      mkTxn('2026-08-04', 3000, EATING_OUT_CATEGORY_ID), // $30
      mkTxn('2026-08-04', 1500, LUNCH_CATEGORY_ID), // $15
      mkTxn('2026-08-04', 500, COFFEE_CATEGORY_ID), // $5
      mkTxn('2026-08-04', 999900, 'cat-rent'), // $9,999 rent — must NOT be counted
      mkTxn('2026-08-04', 7500, 'cat-shopping'), // $75 shopping — must NOT be counted
    ];

    const stats = computeFoodWeekStats(txns, 14100, today);
    eq('Food total counts only the 4 food categories', stats.spentCents, 5000 + 3000 + 1500 + 500);
    eq('Groceries bucket', stats.buckets.groceriesCents, 5000);
    eq('Eating-out bucket', stats.buckets.eatingOutCents, 3000);
    eq('Lunch bucket', stats.buckets.lunchCents, 1500);
    eq('Coffee bucket', stats.buckets.coffeeCents, 500);
    eq('Away bucket = eating-out + lunch + coffee', stats.buckets.awayCents, 3000 + 1500 + 500);
    eq('Rent/shopping never appear in the food total', stats.spentCents, stats.buckets.totalCents);
    eq('FOOD_CATEGORY_IDS excludes cat-rent and cat-shopping', FOOD_CATEGORY_IDS.includes('cat-rent'), false);
  }

  // ===================================================================
  // 3. Excluded transactions are omitted from the weekly total.
  // ===================================================================
  {
    const today = '2026-08-05';
    const txns: Txn[] = [
      mkTxn('2026-08-04', 5000, GROCERIES_CATEGORY_ID),
      mkTxn('2026-08-04', 3000, EATING_OUT_CATEGORY_ID, { excluded: true }), // reimbursed — excluded
    ];
    const stats = computeFoodWeekStats(txns, 14100, today);
    eq('Excluded eating-out transaction is not counted', stats.spentCents, 5000);
    eq('Excluded transaction does not appear in txnCount', stats.txnCount, 1);
  }

  // ===================================================================
  // 4. Empty input yields zeroes, never NaN — the zero-data / start-of-week case.
  // ===================================================================
  {
    const stats = computeFoodWeekStats([], 14100, '2026-08-03'); // Monday, week just started
    eq('Empty: spentCents === 0', stats.spentCents, 0);
    eq('Empty: remainingCents === targetCents', stats.remainingCents, 14100);
    eq('Empty: groceriesRatio === 0 (not NaN)', stats.groceriesRatio, 0);
    eq('Empty: awayRatio === 0 (not NaN)', stats.awayRatio, 0);
    eq('Empty: projectedWeekTotalCents === 0', stats.projectedWeekTotalCents, 0);
    eq('Empty: paceStatus is on-track, not a false "over"', stats.paceStatus, 'on-track');
    eq('Empty: coffee.count === 0', stats.coffee.count, 0);
    eq('Empty: coffee.avgCents === 0 (not NaN)', stats.coffee.avgCents, 0);
    eq('Empty: lastWeek.spentCents === 0', stats.lastWeek.spentCents, 0);
    eq('Empty: vsLastWeekDeltaCents === 0', stats.vsLastWeekDeltaCents, 0);
    check('Empty: every numeric field is finite', [
      stats.spentCents,
      stats.remainingCents,
      stats.groceriesRatio,
      stats.awayRatio,
      stats.projectedWeekTotalCents,
      stats.paceDeltaCents,
      stats.coffee.avgCents,
    ].every((n) => Number.isFinite(n)));
  }

  // ===================================================================
  // 5. Pace calculation — mid-week and on day 7 (Sunday).
  // ===================================================================
  {
    // Mid-week: Wednesday, daysElapsed=3. $60 spent over 3 days -> run-rate projects
    // $140 by Sunday (60/3*7 = 140), which is $1 under a $141 target.
    const midweekTxns: Txn[] = [
      mkTxn('2026-08-03', 2000, GROCERIES_CATEGORY_ID),
      mkTxn('2026-08-04', 2000, EATING_OUT_CATEGORY_ID),
      mkTxn('2026-08-05', 2000, LUNCH_CATEGORY_ID),
    ];
    const midweek = computeFoodWeekStats(midweekTxns, 14100, '2026-08-05');
    eq('Mid-week: daysElapsed === 3', midweek.daysElapsed, 3);
    eq('Mid-week: spentCents === $60', midweek.spentCents, 6000);
    eq('Mid-week: projected run-rate === $140 by Sunday', midweek.projectedWeekTotalCents, 14000);
    eq('Mid-week: paceDeltaCents === -100 (projected $1 under target)', midweek.paceDeltaCents, -100);
    eq('Mid-week: paceStatus === under', midweek.paceStatus, 'under');

    // Same weekly rate, but now it's Sunday and the week is over: projection must
    // collapse to the actual total, not keep extrapolating past day 7.
    const fullWeekTxns: Txn[] = [
      ...midweekTxns,
      mkTxn('2026-08-06', 3000, EATING_OUT_CATEGORY_ID),
      mkTxn('2026-08-07', 3000, LUNCH_CATEGORY_ID),
      mkTxn('2026-08-08', 3000, COFFEE_CATEGORY_ID),
      mkTxn('2026-08-09', 3000, GROCERIES_CATEGORY_ID),
    ];
    const day7 = computeFoodWeekStats(fullWeekTxns, 14100, '2026-08-09');
    eq('Day 7: daysElapsed === 7', day7.daysElapsed, 7);
    eq('Day 7: daysLeft === 1', day7.daysLeft, 1);
    eq('Day 7: spentCents === $180', day7.spentCents, 18000);
    eq(
      'Day 7: projected run-rate equals the actual total exactly (no over-extrapolation)',
      day7.projectedWeekTotalCents,
      day7.spentCents
    );
    eq('Day 7: paceDeltaCents === spentCents - target', day7.paceDeltaCents, 18000 - 14100);
    eq('Day 7: paceStatus === over ($180 > $141 target)', day7.paceStatus, 'over');
  }

  // ===================================================================
  // 6. Living-costs identity sanity check on the frozen target (PERSONAL.md §4):
  //    $370 + $100 + $80 + $60 = $610/month -> x12/52 = $140.77 exactly, which the
  //    document then quotes as the rounded headline "$141/week". This is a
  //    documentation cross-check, not a re-derivation of plan.ts's own constant
  //    (that constant is imported, never recomputed, by config.ts).
  // ===================================================================
  {
    const monthlyFoodCents = 37000 + 10000 + 8000 + 6000;
    eq('Monthly food budget identity from PERSONAL.md §4', monthlyFoodCents, 61000);
    const exactWeeklyCents = Math.round((monthlyFoodCents * 12) / 52);
    eq('Monthly -> weekly at the mandatory 52/12 rate is $140.77 exactly', exactWeeklyCents, 14077);
    const headlineWholeDollarCents = Math.round(exactWeeklyCents / 100) * 100;
    eq('...which rounds to the document\'s stated "$141/week" headline', headlineWholeDollarCents, 14100);
  }

  // ===================================================================
  console.log(`\n--- ${passed} passed, ${failed} failed ---`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Check script crashed:', err);
  process.exitCode = 1;
});
