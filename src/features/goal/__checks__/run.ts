/**
 * Plain, node-runnable checks for the deposit-goal tracker (no test framework is
 * installed). Run with: `npx tsx src/features/goal/__checks__/run.ts`
 *
 * Never logs a dollar figure the user didn't put in this repo themselves — every
 * number here comes from docs/PERSONAL.md via src/personal/plan.ts, which is already
 * public within this codebase, not live user data.
 */
import {
  addMonths,
  balanceAtDate,
  buildGoalProjection,
  BASELINE_MONTH,
  defaultHorizonMonths,
  defaultProjectionInput,
  monthOf,
  monthsBetween,
  projectMonths,
} from '../projection';
import { findBonusRateGuardWarnings } from '../bonusRateGuard';
import { buildWhatIfPresets, NON_FOOD_FIXED_LIVING_COSTS_CENTS } from '../whatIf';
import {
  EXPECTED_END_OF_AUGUST_CASH_CENTS,
  FOOD_GROUP_WEEKLY_TARGET_CENTS_PRECISE,
  GOAL,
  INCOME,
  LIVING_COSTS_CENTS,
  OCTOBER_2026_TRAP,
  PLAN_DEFAULTS,
  PLANNED_ONE_OFFS,
  STARTING_CASH_DATE,
  STARTING_CASH_CENTS,
} from '@/personal/plan';

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

function within(name: string, actual: number, expected: number, toleranceCents: number): void {
  const diff = Math.abs(actual - expected);
  check(
    name,
    diff <= toleranceCents,
    `expected within ${toleranceCents}c of ${expected}, got ${actual} (diff ${diff}c)`
  );
}

async function main(): Promise<void> {
  console.log('--- Tally deposit-goal checks ---\n');

  // ===================================================================
  // 0. src/personal/plan.ts identities this feature depends on
  // ===================================================================
  eq('LIVING_COSTS_CENTS matches PERSONAL.md §3 ($2,957)', LIVING_COSTS_CENTS, 295_700);
  eq(
    "The plan's own headline identity (§0): net − living = savings",
    INCOME.netMonthlyCents - LIVING_COSTS_CENTS,
    PLAN_DEFAULTS.savingsTargetCents
  );
  eq('End-of-August baseline matches PERSONAL.md §6 (~$33,569)', EXPECTED_END_OF_AUGUST_CASH_CENTS, 3_356_900);
  eq('Target matches PERSONAL.md §6 ($72,339)', GOAL.targetCents, 7_233_900);
  eq('Target date matches PERSONAL.md §6', GOAL.targetDate, '2027-10-30');

  // ===================================================================
  // 1. Month arithmetic — correct across the 2026 → 2027 year boundary
  // ===================================================================
  eq('addMonths("2026-12", 1) crosses into 2027', addMonths('2026-12', 1), '2027-01');
  eq('addMonths("2026-11", 2) crosses into 2027', addMonths('2026-11', 2), '2027-01');
  eq('addMonths("2027-01", -1) crosses back into 2026', addMonths('2027-01', -1), '2026-12');
  eq('addMonths("2026-08", 5) lands on 2027-01', addMonths('2026-08', 5), '2027-01');
  eq('monthsBetween("2026-08", "2027-10") is 14', monthsBetween('2026-08', '2027-10'), 14);
  eq('monthsBetween("2026-11", "2027-01") is 2', monthsBetween('2026-11', '2027-01'), 2);
  eq('monthOf extracts YYYY-MM', monthOf('2027-10-30'), '2027-10');
  eq('BASELINE_MONTH derived from STARTING_CASH_DATE', BASELINE_MONTH, monthOf(STARTING_CASH_DATE));
  eq('BASELINE_MONTH is 2026-08', BASELINE_MONTH, '2026-08');
  eq('defaultHorizonMonths() is 14 (Sep 2026 .. Oct 2027 inclusive)', defaultHorizonMonths(), 14);

  const points = projectMonths(defaultProjectionInput());
  eq('Default projection produces exactly 14 monthly points', points.length, 14);
  check(
    'Points run consecutively Sep 2026 → Oct 2027 with no skipped/duplicated month',
    points.every((p, i) => (i === 0 ? p.month === '2026-09' : p.month === addMonths(points[i - 1].month, 1))),
    points.map((p) => p.month).join(', ')
  );
  check(
    'Every closing balance becomes the next month\'s opening balance (continuity)',
    points.every((p, i) => i === 0 || p.openingBalanceCents === points[i - 1].closingBalanceCents)
  );

  // ===================================================================
  // 2. Interest rate changes at November 2026 (5.2% → 5.0%, PERSONAL.md §6)
  // ===================================================================
  const sep2026 = points.find((p) => p.month === '2026-09');
  const oct2026 = points.find((p) => p.month === '2026-10');
  const nov2026 = points.find((p) => p.month === '2026-11');
  const dec2026 = points.find((p) => p.month === '2026-12');
  eq('Sep 2026 uses the 5.2% promo rate', sep2026?.annualRatePct, 5.2);
  eq('Oct 2026 still uses the 5.2% promo rate', oct2026?.annualRatePct, 5.2);
  eq('Nov 2026 switches to the 5.0% ongoing rate', nov2026?.annualRatePct, 5.0);
  eq('Dec 2026 stays at the 5.0% ongoing rate', dec2026?.annualRatePct, 5.0);

  // ===================================================================
  // 3. Both one-offs land in the right month AND reduce the balance
  // ===================================================================
  eq('Oct 2026 one-off is exactly -$9,500', oct2026?.oneOffCents, -950_000);
  eq('Oct 2026 one-off label mentions the visa', oct2026?.oneOffLabels.join(','), 'PR / 189 visa + India ticket');
  const feb2027 = points.find((p) => p.month === '2027-02');
  eq('Feb 2027 one-off is exactly -$3,500', feb2027?.oneOffCents, -350_000);
  eq('Feb 2027 one-off label mentions the India trip balance', feb2027?.oneOffLabels.join(','), 'India trip balance');
  check(
    'No other month carries a one-off',
    points.filter((p) => p.oneOffCents !== 0).length === 2
  );

  // Counterfactual: the same engine with no one-offs at all must produce a HIGHER
  // balance in and after October 2026 than the real projection — direct proof the
  // one-offs actually reduce the running balance, not just that the field is set.
  // Isolated one at a time (rather than removing both together) so each comparison
  // holds everything else — including the OTHER one-off's compounding effect —
  // identical, and the observed difference is attributable to exactly one withdrawal.
  const octOnly = PLANNED_ONE_OFFS.filter((o) => o.month === '2026-10');
  const febOnly = PLANNED_ONE_OFFS.filter((o) => o.month === '2027-02');
  const withoutFebPoints = projectMonths(defaultProjectionInput({ oneOffs: octOnly }));
  const withoutOctPoints = projectMonths(defaultProjectionInput({ oneOffs: febOnly }));
  const withoutOctOct = withoutOctPoints.find((p) => p.month === '2026-10');
  const withoutFebFeb = withoutFebPoints.find((p) => p.month === '2027-02');
  check(
    'Removing ONLY the Oct one-off raises that month\'s closing balance by exactly $9,500',
    !!oct2026 && !!withoutOctOct && withoutOctOct.closingBalanceCents - oct2026.closingBalanceCents === 950_000
  );
  check(
    'Removing ONLY the Feb one-off (Oct one-off still applied identically in both) raises that month\'s closing balance by exactly $3,500',
    !!feb2027 && !!withoutFebFeb && withoutFebFeb.closingBalanceCents - feb2027.closingBalanceCents === 350_000
  );
  const noOneOffPoints = projectMonths(defaultProjectionInput({ oneOffs: [] }));
  const noOneOffFinal = noOneOffPoints[noOneOffPoints.length - 1].closingBalanceCents;
  const realFinal = points[points.length - 1].closingBalanceCents;
  check(
    'Removing both one-offs raises the FINAL balance (they compound forward too)',
    noOneOffFinal > realFinal,
    `no-one-off final ${noOneOffFinal} vs real final ${realFinal}`
  );

  // ===================================================================
  // 4. The October 2026 withdrawals > deposits condition is detected — and ONLY
  //    that month (Feb 2027's $3,500 withdrawal exactly equals, not exceeds, the
  //    $3,500 deposit, so it must NOT be flagged).
  // ===================================================================
  const warnings = findBonusRateGuardWarnings(points);
  eq('Exactly one month is flagged by the bonus-rate guard', warnings.length, 1);
  eq('The flagged month is October 2026', warnings[0]?.month, '2026-10');
  eq('Flagged withdrawals match the plan ($9,500)', warnings[0]?.withdrawalsCents, 950_000);
  eq('Flagged deposits match the plan ($3,500)', warnings[0]?.depositsCents, 350_000);
  check('Warning text is worded as unverified, not as fact', /typically|hasn.t been confirmed/i.test(warnings[0]?.notice ?? ''));
  eq('OCTOBER_2026_TRAP.verified is explicitly false (source doc flags "to verify")', OCTOBER_2026_TRAP.verified, false);
  check(
    'Guard\'s independent cost estimate is in the same rough order of magnitude as the source\'s own ~$135 estimate',
    Math.abs(warnings[0].approxCostIfDroppedCentsUnverified - OCTOBER_2026_TRAP.estimatedCostCents) < 5_000,
    `guard estimate ${warnings[0].approxCostIfDroppedCentsUnverified}c vs source ${OCTOBER_2026_TRAP.estimatedCostCents}c`
  );

  // ===================================================================
  // 5. Zero-contribution scenario never produces NaN/Infinity
  // ===================================================================
  const zeroContribPoints = projectMonths(defaultProjectionInput({ monthlyContributionCents: 0 }));
  check(
    'Zero-contribution projection: every numeric field on every point is finite',
    zeroContribPoints.every((p) =>
      [
        p.openingBalanceCents,
        p.closingBalanceCents,
        p.grossInterestCents,
        p.taxCents,
        p.netInterestCents,
        p.depositsCents,
        p.withdrawalsCents,
        p.contributionCents,
        p.oneOffCents,
        p.annualRatePct,
      ].every((n) => Number.isFinite(n))
    )
  );
  eq('Zero-contribution: contribution is exactly 0 every month', zeroContribPoints.every((p) => p.contributionCents === 0), true);
  check(
    'Zero-contribution: balance still declines across the one-off months (only interest offsets it)',
    (() => {
      const withZero = zeroContribPoints.find((p) => p.month === '2026-10');
      return !!withZero && withZero.closingBalanceCents < withZero.openingBalanceCents;
    })()
  );
  // Zero-length horizon and negative horizon must also degrade gracefully, not throw.
  const zeroHorizon = projectMonths(defaultProjectionInput({ monthsToProject: 0 }));
  eq('monthsToProject: 0 returns an empty series, not a crash', zeroHorizon.length, 0);
  const negativeHorizon = projectMonths(defaultProjectionInput({ monthsToProject: -5 }));
  eq('Negative monthsToProject is clamped to an empty series, not NaN/negative-length', negativeHorizon.length, 0);

  // ===================================================================
  // 6. The projection vs the plan's own $72,339 target — tolerance and reasoning
  // ===================================================================
  // Tolerance rationale: the check suite is not asserting the plan's headline figure
  // is exactly reproduced — see the module's own doc comment and the P3 report. This
  // asserts (a) the DEFAULT post-tax projection is in the right ballpark (a broken
  // engine would be off by thousands, not hundreds) at a $1,500 sanity tolerance, and
  // (b) a PRE-TAX variant of the *same* engine reproduces the target almost exactly
  // at a $10 tolerance — the concrete evidence behind the "the source figure looks
  // pre-tax" finding, not a claim that pre-tax is the convention actually used.
  const defaultResult = buildGoalProjection();
  within(
    'Default (post-tax) projection is within $1,500 of the $72,339 target (sanity bound, not a match claim)',
    defaultResult.finalBalanceCents,
    GOAL.targetCents,
    150_000
  );
  check(
    'Default (post-tax) projection undershoots the target (interest taxed away, as expected)',
    defaultResult.finalBalanceCents < GOAL.targetCents
  );

  const preTaxPoints = projectMonths(defaultProjectionInput({ marginalTaxRate: 0 }));
  const preTaxFinalMonthEnd = preTaxPoints[preTaxPoints.length - 1].closingBalanceCents;
  within(
    'A PRE-TAX variant\'s month-end close reproduces $72,339 almost exactly (evidence, not the chosen convention)',
    preTaxFinalMonthEnd,
    GOAL.targetCents,
    100 // within $1.00
  );

  // ===================================================================
  // 7. balanceAtDate / augustRunningBalance — the three-phase lookup
  // ===================================================================
  const input = defaultProjectionInput();
  eq(
    'Before STARTING_CASH_DATE, planned balance is the starting cash figure',
    balanceAtDate(input, points, '2026-07-15'),
    STARTING_CASH_CENTS
  );
  eq(
    'On STARTING_CASH_DATE itself, planned balance is still the starting cash figure',
    balanceAtDate(input, points, STARTING_CASH_DATE),
    STARTING_CASH_CENTS
  );
  eq(
    'Just after the starting date but before any August event has posted, balance is unchanged',
    balanceAtDate(input, points, '2026-08-07'),
    STARTING_CASH_CENTS
  );
  eq(
    'At the end of August, the reconstructed running balance matches the plan\'s own figure exactly',
    balanceAtDate(input, points, '2026-08-31'),
    EXPECTED_END_OF_AUGUST_CASH_CENTS
  );
  check(
    'Mid-projection date (e.g. 2027-01-15) returns a finite, plausible interpolated balance',
    (() => {
      const v = balanceAtDate(input, points, '2027-01-15');
      const jan = points.find((p) => p.month === '2027-01');
      return Number.isFinite(v) && !!jan && v >= jan.openingBalanceCents && v <= jan.closingBalanceCents;
    })()
  );
  check(
    'A date past the projection horizon clamps to the last point\'s closing balance',
    balanceAtDate(input, points, '2030-01-01') === points[points.length - 1].closingBalanceCents
  );

  // ===================================================================
  // 8. Savings-rate what-if — internal consistency with the plan's own food figures
  // ===================================================================
  eq(
    'NON_FOOD_FIXED_LIVING_COSTS_CENTS derived correctly from plan.ts',
    NON_FOOD_FIXED_LIVING_COSTS_CENTS,
    LIVING_COSTS_CENTS - 61_000
  );
  const presets = buildWhatIfPresets();
  const planPreset = presets.find((s) => s.monthlySavingsCents === 350_000);
  eq(
    'The $3,500/mo preset\'s weekly food budget matches plan.ts\'s own $141/wk figure exactly',
    planPreset?.weeklyFoodBudgetCents,
    FOOD_GROUP_WEEKLY_TARGET_CENTS_PRECISE
  );
  check('$3,500/mo preset is feasible (food budget is non-negative)', planPreset?.feasible === true);
  const lowSavingsPreset = presets.find((s) => s.monthlySavingsCents === 250_000);
  const highSavingsPreset = presets.find((s) => s.monthlySavingsCents === 450_000);
  check(
    'Lower savings rate leaves a larger weekly food budget than a higher one',
    !!lowSavingsPreset && !!highSavingsPreset && lowSavingsPreset.weeklyFoodBudgetCents > highSavingsPreset.weeklyFoodBudgetCents
  );
  check(
    'Higher savings rate produces a larger final pool than a lower one',
    !!lowSavingsPreset && !!highSavingsPreset && highSavingsPreset.finalPoolCents > lowSavingsPreset.finalPoolCents
  );
  check(
    'Every preset\'s numbers are finite (no divide-by-zero anywhere in the what-if)',
    presets.every((s) =>
      [s.monthlySavingsCents, s.monthlyFoodBudgetCents, s.weeklyFoodBudgetCents, s.finalPoolCents, s.finalPoolGapVsTargetCents].every(
        Number.isFinite
      )
    )
  );

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
