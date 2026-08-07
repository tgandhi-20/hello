/**
 * Plain, node-runnable checks for the personal plan (no test framework is
 * installed). Run with: `npx tsx src/personal/__checks__/run.ts`
 *
 * Never logs a transaction, amount, or merchant — everything here is the
 * user's own frozen, non-secret budget plan (docs/PERSONAL.md), printed only
 * as pass/fail assertions, same as the other __checks__ suites in this repo.
 */
import {
  WEEKS_PER_MONTH,
  weeklyToMonthlyCents,
  monthlyToWeeklyCents,
  INCOME,
  PERSONAL_CATEGORIES,
  LIVING_COSTS_CENTS,
  NET_HOUSING_CENTS,
  computeNetHousingCents,
  FOOD_GROUP_CATEGORY_IDS,
  FOOD_GROUP_MONTHLY_CAP_CENTS,
  FOOD_GROUP_WEEKLY_TARGET_CENTS,
  KNOWN_SUBSCRIPTIONS,
  KNOWN_SUBSCRIPTIONS_TOTAL_CENTS,
  STARTING_CASH_CENTS,
  AUGUST_2026_EVENTS,
  EXPECTED_END_OF_AUGUST_CASH_CENTS,
  MOVING_COSTS_BREAKDOWN_TOTAL_CENTS,
  MOVING_COSTS_DISCREPANCY_CENTS,
  PLANNED_ONE_OFFS,
  SAVINGS_INTEREST_SCHEDULE,
  GOAL,
  PLAN_DEFAULTS,
  categoryCapCents,
} from '../plan';

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

function approx(name: string, actualCents: number, expectedCents: number, toleranceCents: number): void {
  const diff = Math.abs(actualCents - expectedCents);
  check(
    name,
    diff <= toleranceCents,
    `expected ~${(expectedCents / 100).toFixed(2)} (±${(toleranceCents / 100).toFixed(2)}), got ${(actualCents / 100).toFixed(2)}, diff ${(diff / 100).toFixed(2)}`
  );
}

async function main(): Promise<void> {
  console.log('--- Tally personal plan checks ---\n');

  // ===================================================================
  // 1. The conversion rule (§1): weekly → monthly is ×52÷12, never ×4.
  //    Assert with the user's own stated figure: $600/wk rent → $2,600/month.
  // ===================================================================
  eq('WEEKS_PER_MONTH is 52/12, not 4.348 or 4', WEEKS_PER_MONTH, 52 / 12);
  eq('weeklyToMonthlyCents($600/wk rent) === $2,600/month (user\'s own §3 figure)', weeklyToMonthlyCents(60_000), 260_000);
  check('weeklyToMonthlyCents is NOT the ×4 error', weeklyToMonthlyCents(60_000) !== 60_000 * 4, `×4 would give ${60_000 * 4}`);

  // ===================================================================
  // 2. Living costs identity (§3): must sum to exactly $2,957.
  // ===================================================================
  eq('Living costs sum to exactly $2,957', LIVING_COSTS_CENTS, 295_700);

  // ===================================================================
  // 3. Net housing (§3): rent − sublet-offset + utilities = $1,293.
  // ===================================================================
  eq('NET_HOUSING_CENTS is exactly $1,293', NET_HOUSING_CENTS, 129_300);
  eq(
    'computeNetHousingCents(rent, sublet, utilities) === $1,293',
    computeNetHousingCents(260_000, -151_700, 21_000),
    129_300
  );

  // ===================================================================
  // 4. Take-home identity (§0): $6,457 − $2,957 = $3,500 exactly.
  // ===================================================================
  eq('INCOME.netMonthlyCents is $6,457', INCOME.netMonthlyCents, 645_700);
  eq(
    'Take-home ($6,457) − living costs ($2,957) = savings target ($3,500), exactly',
    INCOME.netMonthlyCents - LIVING_COSTS_CENTS,
    PLAN_DEFAULTS.savingsTargetCents
  );
  eq('PLAN_DEFAULTS.savingsTargetCents is $3,500', PLAN_DEFAULTS.savingsTargetCents, 350_000);
  eq('PLAN_DEFAULTS.paydayDayOfMonth is the 15th', PLAN_DEFAULTS.paydayDayOfMonth, 15);

  // ===================================================================
  // 5. Food group (§4): caps sum to $610/month, convert to ~$141/week (±$1)
  //    using 52/12.
  // ===================================================================
  eq('Food group is exactly 4 categories', FOOD_GROUP_CATEGORY_IDS.length, 4);
  eq('Food group monthly caps sum to $610', FOOD_GROUP_MONTHLY_CAP_CENTS, 61_000);
  approx(
    'Food group $610/month converts to ~$141/week (±$1, via 52/12)',
    monthlyToWeeklyCents(FOOD_GROUP_MONTHLY_CAP_CENTS),
    FOOD_GROUP_WEEKLY_TARGET_CENTS,
    100
  );
  // Cross-check against the ×4 error, which must NOT be within a dollar of the true figure.
  check(
    'The ×4 error would NOT pass the ±$1 food-group check (proves the test is meaningful)',
    Math.abs(61_000 * 4 - FOOD_GROUP_WEEKLY_TARGET_CENTS) > 100
  );

  // ===================================================================
  // 6. Subscriptions (§5): the four known ones sum to ~$36 (±$1). Flagged
  //    (not silently equal): they actually sum to $36.17, 17c over the §3
  //    cap of exactly $36.00 — both figures are asserted distinctly below.
  // ===================================================================
  eq('Four known subscriptions', KNOWN_SUBSCRIPTIONS.length, 4);
  approx('The four subscriptions sum to ~$36 (±$1)', KNOWN_SUBSCRIPTIONS_TOTAL_CENTS, 3_600, 100);
  eq('Known subscriptions total is exactly $36.17 (§5)', KNOWN_SUBSCRIPTIONS_TOTAL_CENTS, 3_617);
  eq('cat-subscriptions cap is exactly $36.00 (§3)', categoryCapCents('cat-subscriptions'), 3_600);
  check(
    'FLAGGED: §3 cap ($36.00) and §5 real total ($36.17) do NOT reconcile to the cent — both kept, not fudged',
    KNOWN_SUBSCRIPTIONS_TOTAL_CENTS !== 3_600 && KNOWN_SUBSCRIPTIONS_TOTAL_CENTS - 3_600 === 17
  );

  // ===================================================================
  // 7. Cash, one-offs, goal (§6).
  // ===================================================================
  eq('Starting cash is $40,000', STARTING_CASH_CENTS, 4_000_000);
  {
    const netChange = -AUGUST_2026_EVENTS.reduce((s, e) => s + e.amountCents, 0);
    eq(
      'End-of-August cash reconciles exactly from the six August events',
      STARTING_CASH_CENTS + netChange,
      EXPECTED_END_OF_AUGUST_CASH_CENTS
    );
    eq('End-of-August cash is ~$33,569', EXPECTED_END_OF_AUGUST_CASH_CENTS, 3_356_900);
  }
  check(
    'FLAGGED: moving-costs breakdown ($4,400) does not match the August event line (−$4,000) — $400 apart, not fudged',
    MOVING_COSTS_DISCREPANCY_CENTS === 40_000 && MOVING_COSTS_BREAKDOWN_TOTAL_CENTS === 440_000
  );
  eq('Two planned one-offs modelled', PLANNED_ONE_OFFS.length, 2);
  eq('Oct 2026 one-off is $9,500', PLANNED_ONE_OFFS[0].amountCents, 950_000);
  eq('Feb 2027 one-off is $3,500', PLANNED_ONE_OFFS[1].amountCents, 350_000);
  eq('Interest schedule has 2 periods (5.2% then 5.0%)', SAVINGS_INTEREST_SCHEDULE.length, 2);
  eq('First interest period is 5.2%', SAVINGS_INTEREST_SCHEDULE[0].annualRatePct, 5.2);
  eq('First interest period ends 2026-11-01', SAVINGS_INTEREST_SCHEDULE[0].until, '2026-11-01');
  eq('Second interest period is 5.0%', SAVINGS_INTEREST_SCHEDULE[1].annualRatePct, 5.0);
  eq('Goal is $72,339', GOAL.targetCents, 7_233_900);
  eq('Goal date is 2027-10-30', GOAL.targetDate, '2027-10-30');

  // ===================================================================
  // 8. Category frozen ids (§3) — spot-check the ones other agents depend on.
  // ===================================================================
  const idSet = new Set<string>(PERSONAL_CATEGORIES.map((c) => c.id));
  for (const id of [
    'cat-groceries',
    'cat-eating-out',
    'cat-lunch',
    'cat-coffee',
    'cat-rent',
    'cat-sublet',
    'cat-utilities',
    'cat-subscriptions',
    'cat-savings',
    'cat-income',
    'cat-oneoff',
    'cat-other',
  ]) {
    check(`Frozen category id present: ${id}`, idSet.has(id));
  }
  eq('cat-rent cap is $2,600', categoryCapCents('cat-rent'), 260_000);
  eq('cat-sublet cap is −$1,517 (income offset)', categoryCapCents('cat-sublet'), -151_700);
  eq('cat-utilities cap is $210', categoryCapCents('cat-utilities'), 21_000);
  eq('cat-savings cap is $3,500', categoryCapCents('cat-savings'), 350_000);
  eq('cat-income has no cap', categoryCapCents('cat-income'), null);
  eq('cat-oneoff has no cap', categoryCapCents('cat-oneoff'), null);

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
