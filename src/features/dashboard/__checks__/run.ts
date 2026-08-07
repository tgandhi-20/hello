/**
 * Plain, node-runnable checks for the dashboard's Safe-to-Spend hero number.
 * Run with: `npx tsx src/features/dashboard/__checks__/run.ts`
 *
 * Regression coverage for the "Safe-to-Spend double-counts every posted recurring
 * bill" bug (CONTRACTS.md §7): a rent payment that has already posted this month
 * must be subtracted from income exactly once — as "committed" — never again as
 * ordinary "already spent".
 *
 * Never logs a transaction, amount, or merchant — fixtures below are synthetic.
 */
import type { Settings, Txn } from '../../../types';
import { computeSafeToSpend } from '../safeToSpend';
import { detectRecurring } from '../../recurring/detect';
import { todayStr, addDays } from '../../../ui/format';

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

function mkTxn(partial: Partial<Txn> & Pick<Txn, 'id' | 'date' | 'amountCents' | 'categoryId'>): Txn {
  return {
    description: partial.merchant ?? 'txn',
    merchant: 'txn',
    account: 'cash',
    source: 'manual',
    hash: `hash-${partial.id}`,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

const DEFAULT_SETTINGS: Settings = {
  currency: 'AUD',
  locale: 'en-AU',
  paydayDayOfMonth: 15,
  monthlyIncomeCents: 500_000, // $5,000
  savingsTargetCents: 0,
  lockTimeoutMs: 120_000,
  biometricEnabled: false,
  pinnedCategoryIds: [],
};

async function main(): Promise<void> {
  console.log('--- Tally dashboard checks ---\n');

  const today = todayStr();

  // ===================================================================
  // 1. Safe-to-Spend must not double-count an already-posted recurring bill.
  //    4 months of $1,500 rent (this month's already posted), $5,000 income,
  //    $50 groceries -> poolCents must be $3,450, not $1,950.
  // ===================================================================
  {
    const rentDates = [addDays(today, -90), addDays(today, -60), addDays(today, -30), today];
    const rentTxns: Txn[] = rentDates.map((date, i) =>
      mkTxn({
        id: `rent-${i}`,
        date,
        amountCents: 150_000, // $1,500
        categoryId: 'cat-rent',
        merchant: 'RENT XYZ PROPERTY',
        description: 'RENT XYZ PROPERTY',
      })
    );
    const groceries = mkTxn({
      id: 'groceries-1',
      date: today,
      amountCents: 5_000, // $50
      categoryId: 'cat-groceries',
      merchant: 'WOOLWORTHS',
      description: 'WOOLWORTHS',
    });
    const txns = [...rentTxns, groceries];

    const detected = detectRecurring(txns, [], { today });
    const rentSeries = detected.find((s) => s.merchant.includes('RENT'));
    check('Rent detected as a recurring series', Boolean(rentSeries));
    eq('Rent series cadence is monthly', rentSeries?.cadence, 'monthly');
    eq('Rent series has all 4 occurrences linked via txnIds', rentSeries?.txnIds.length, 4);

    const result = computeSafeToSpend({ txns, recurring: detected, settings: DEFAULT_SETTINGS });

    console.log(
      `  income=$${DEFAULT_SETTINGS.monthlyIncomeCents / 100} committed=$${result.committedCents / 100} ` +
        `savings=$${result.savingsTargetCents / 100} spentSoFar=$${result.spentSoFarCents / 100} ` +
        `-> poolCents=$${result.poolCents / 100}`
    );

    eq('Safe-to-Spend: committedCents is the $1,500 monthly rent', result.committedCents, 150_000);
    eq(
      'Safe-to-Spend: spentSoFarCents is ONLY the $50 groceries (rent excluded, already committed)',
      result.spentSoFarCents,
      5_000
    );
    eq('Safe-to-Spend: poolCents is $3,450 (income − committed − spent), NOT $1,950', result.poolCents, 345_000);

    // ---- Consistency check: muting the series must not change the total money
    // accounted for (never counted zero times, never counted twice). A muted
    // series contributes nothing to `committedCents`, but its posted transactions
    // must then fall through into ordinary `spentSoFarCents` — for a monthly
    // cadence the monthly-equivalent committed figure equals the actual posted
    // amount, so the resulting pool is identical either way.
    const mutedSeries = detected.map((s) => (s === rentSeries ? { ...s, muted: true } : s));
    const mutedResult = computeSafeToSpend({ txns, recurring: mutedSeries, settings: DEFAULT_SETTINGS });
    eq('Safe-to-Spend: muted series contributes $0 to committedCents', mutedResult.committedCents, 0);
    eq(
      'Safe-to-Spend: muted series posted rent now counts as ordinary spend',
      mutedResult.spentSoFarCents,
      5_000 + 150_000
    );
    eq(
      'Safe-to-Spend: poolCents unchanged by muting (money counted exactly once either way)',
      mutedResult.poolCents,
      result.poolCents
    );
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
