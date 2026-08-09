/**
 * Plain, node-runnable checks for `src/money` — the one money model
 * (DESIGN-V4.md §1). No test framework is installed; run with:
 *   npx tsx src/money/__checks__/run.ts
 *
 * Never logs a transaction, amount, or merchant beyond the small, synthetic
 * fixtures constructed inline below — same convention as every other check
 * suite in this repo (see src/import/__checks__/run.ts).
 */
import type { Category, RecurringSeries, Settings, Txn } from '../../types';
import { computeMonthMoney } from '../index';

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

function finite(name: string, value: number): void {
  check(name, Number.isFinite(value), `expected a finite number, got ${value}`);
}

let txnCounter = 0;
function mkTxn(partial: Partial<Txn> & Pick<Txn, 'date' | 'amountCents' | 'categoryId'>): Txn {
  txnCounter++;
  return {
    id: `txn-${txnCounter}`,
    description: 'fixture',
    merchant: 'fixture',
    account: 'cash',
    source: 'manual',
    hash: `hash-${txnCounter}`,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

function mkSettings(partial: Partial<Settings> = {}): Settings {
  return {
    currency: 'AUD',
    locale: 'en-AU',
    paydayDayOfMonth: 15,
    monthlyIncomeCents: 0,
    savingsTargetCents: 0,
    lockTimeoutMs: 120_000,
    biometricEnabled: false,
    pinnedCategoryIds: [],
    ...partial,
  };
}

function mkSeries(partial: Partial<RecurringSeries> & Pick<RecurringSeries, 'id' | 'nextDue'>): RecurringSeries {
  return {
    merchant: 'Merchant',
    categoryId: 'cat-rent',
    cadence: 'monthly',
    amountCents: 100_000,
    lastSeen: partial.nextDue,
    txnIds: [],
    muted: false,
    ...partial,
  };
}

const CATEGORIES: Category[] = [
  { id: 'cat-rent', label: 'Rent', icon: 'Home', colorToken: 'cat-1', kind: 'need', builtin: true, order: 0 },
  { id: 'cat-groceries', label: 'Groceries', icon: 'ShoppingCart', colorToken: 'cat-2', kind: 'need', builtin: true, order: 1 },
  { id: 'cat-eating-out', label: 'Eating out', icon: 'Utensils', colorToken: 'cat-3', kind: 'want', builtin: true, order: 2 },
  { id: 'cat-lunch', label: 'Lunch', icon: 'Sandwich', colorToken: 'cat-4', kind: 'want', builtin: true, order: 3 },
  { id: 'cat-coffee', label: 'Coffee', icon: 'Coffee', colorToken: 'cat-5', kind: 'want', builtin: true, order: 4 },
  { id: 'cat-shopping', label: 'Shopping', icon: 'Bag', colorToken: 'cat-6', kind: 'want', builtin: true, order: 5 },
];

async function main(): Promise<void> {
  console.log('--- Tally money-model checks ---\n');

  // ===================================================================
  // 1. The equation balances: income - bills - savings - spent === left,
  //    across several scenarios (income set, income unset, over-committed).
  // ===================================================================
  {
    const scenarios: { name: string; settings: Settings; recurring: RecurringSeries[]; txns: Txn[] }[] = [
      {
        name: 'a typical month',
        settings: mkSettings({ monthlyIncomeCents: 645_700, savingsTargetCents: 350_000 }),
        recurring: [mkSeries({ id: 'rent', nextDue: '2026-08-01', amountCents: 129_300, cadence: 'monthly', txnIds: ['r1'] })],
        txns: [
          mkTxn({ id: 'r1', date: '2026-08-01', amountCents: 129_300, categoryId: 'cat-rent' }),
          mkTxn({ date: '2026-08-05', amountCents: 5_000, categoryId: 'cat-groceries' }),
        ],
      },
      {
        name: 'income unset',
        settings: mkSettings({ monthlyIncomeCents: 0, savingsTargetCents: 350_000 }),
        recurring: [],
        txns: [mkTxn({ date: '2026-08-05', amountCents: 5_000, categoryId: 'cat-groceries' })],
      },
      {
        name: 'no recurring detected',
        settings: mkSettings({ monthlyIncomeCents: 645_700, savingsTargetCents: 350_000 }),
        recurring: [],
        txns: [mkTxn({ date: '2026-08-05', amountCents: 5_000, categoryId: 'cat-groceries' })],
      },
      {
        name: 'over-committed (bills + savings exceed income)',
        settings: mkSettings({ monthlyIncomeCents: 100_000, savingsTargetCents: 350_000 }),
        recurring: [mkSeries({ id: 'rent2', nextDue: '2026-08-01', amountCents: 200_000, cadence: 'monthly' })],
        txns: [],
      },
      {
        name: 'zero transactions',
        settings: mkSettings({ monthlyIncomeCents: 645_700, savingsTargetCents: 350_000 }),
        recurring: [],
        txns: [],
      },
    ];

    for (const s of scenarios) {
      const m = computeMonthMoney({
        txns: s.txns,
        recurring: s.recurring,
        settings: s.settings,
        categories: CATEGORIES,
        month: '2026-08',
        today: '2026-08-10',
      });
      eq(
        `Equation balances (${s.name}): income - bills - savings - spent === left`,
        m.incomeCents - m.billsCents - m.savingsCents - m.spentCents,
        m.leftCents
      );
      eq(`toSpend === income - bills - savings (${s.name})`, m.toSpendCents, m.incomeCents - m.billsCents - m.savingsCents);
      eq(`left === toSpend - spent (${s.name})`, m.leftCents, m.toSpendCents - m.spentCents);
    }
  }

  // ===================================================================
  // 2. byCategory sums exactly to spentCents.
  // ===================================================================
  {
    const txns: Txn[] = [
      mkTxn({ date: '2026-08-02', amountCents: 5_000, categoryId: 'cat-groceries' }),
      mkTxn({ date: '2026-08-03', amountCents: 3_000, categoryId: 'cat-eating-out' }),
      mkTxn({ date: '2026-08-04', amountCents: 1_500, categoryId: 'cat-lunch' }),
      mkTxn({ date: '2026-08-05', amountCents: 500, categoryId: 'cat-coffee' }),
      mkTxn({ date: '2026-08-06', amountCents: 7_500, categoryId: 'cat-shopping' }),
    ];
    const m = computeMonthMoney({
      txns,
      recurring: [],
      settings: mkSettings({ monthlyIncomeCents: 645_700, savingsTargetCents: 0 }),
      categories: CATEGORIES,
      month: '2026-08',
      today: '2026-08-10',
    });
    const byCategorySum = m.byCategory.reduce((sum, row) => sum + row.spentCents, 0);
    eq('byCategory sums exactly to spentCents', byCategorySum, m.spentCents);
    eq('byCategory has one row per distinct category', m.byCategory.length, 5);
    check(
      'byCategory is sorted largest first',
      m.byCategory.every((row, i) => i === 0 || m.byCategory[i - 1].spentCents >= row.spentCents)
    );
  }

  // ===================================================================
  // 3. Committed recurring spend is counted exactly ONCE — the old
  //    double-count regression (previously fixed in safeToSpend.ts).
  // ===================================================================
  {
    const rentTxn = mkTxn({ id: 'rent-txn', date: '2026-08-01', amountCents: 129_300, categoryId: 'cat-rent' });
    const groceriesTxn = mkTxn({ date: '2026-08-05', amountCents: 5_000, categoryId: 'cat-groceries' });

    const activeSeries: RecurringSeries[] = [
      mkSeries({ id: 'rent-series', nextDue: '2026-09-01', amountCents: 129_300, txnIds: [rentTxn.id] }),
    ];
    const settings = mkSettings({ monthlyIncomeCents: 645_700, savingsTargetCents: 0 });

    const m = computeMonthMoney({
      txns: [rentTxn, groceriesTxn],
      recurring: activeSeries,
      settings,
      categories: CATEGORIES,
      month: '2026-08',
      today: '2026-08-10',
    });

    eq('billsCents counts the rent series once', m.billsCents, 129_300);
    eq('spentCents excludes the committed rent txn (only groceries remains)', m.spentCents, 5_000);
    eq(
      'The rent txn never appears in byCategory once its series is active',
      m.byCategory.find((r) => r.categoryId === 'cat-rent'),
      undefined
    );
    eq(
      'income - bills - savings - spent === left even with a committed txn present',
      m.incomeCents - m.billsCents - m.savingsCents - m.spentCents,
      m.leftCents
    );

    // Muting the series must make its transaction fall through into ordinary spend —
    // counted exactly once, never zero times.
    const mutedSeries: RecurringSeries[] = [
      mkSeries({ id: 'rent-series', nextDue: '2026-09-01', amountCents: 129_300, txnIds: [rentTxn.id], muted: true }),
    ];
    const mMuted = computeMonthMoney({
      txns: [rentTxn, groceriesTxn],
      recurring: mutedSeries,
      settings,
      categories: CATEGORIES,
      month: '2026-08',
      today: '2026-08-10',
    });
    eq('A muted series contributes nothing to billsCents', mMuted.billsCents, 0);
    eq('A muted series\' txn falls through into spentCents', mMuted.spentCents, 129_300 + 5_000);
  }

  // ===================================================================
  // 4. leftTodayCents × daysLeftInWeek === leftThisWeekCents, always
  //    (by construction, but pinned as a regression check).
  // ===================================================================
  {
    for (const today of ['2026-08-03', '2026-08-05', '2026-08-09', '2026-08-31']) {
      const m = computeMonthMoney({
        txns: [],
        recurring: [],
        settings: mkSettings({ monthlyIncomeCents: 645_700, savingsTargetCents: 350_000 }),
        categories: CATEGORIES,
        month: '2026-08',
        today,
      });
      eq(
        `leftToday x daysLeftInWeek === leftThisWeek (today=${today})`,
        m.leftTodayCents * m.daysLeftInWeek,
        m.leftThisWeekCents
      );
      check(`daysLeftInWeek is 1..7 (today=${today})`, m.daysLeftInWeek >= 1 && m.daysLeftInWeek <= 7);
    }
  }

  // ===================================================================
  // 5. Zero-income, zero-txn, last-day-of-month and empty-recurring cases
  //    all return finite numbers — nothing may ever be NaN/Infinity.
  // ===================================================================
  {
    const zeroEverything = computeMonthMoney({
      txns: [],
      recurring: [],
      settings: mkSettings(),
      categories: [],
      month: '2026-08',
      today: '2026-08-10',
    });
    check('Zero-income, zero-txn: incomeUnset is true', zeroEverything.incomeUnset);
    for (const [name, value] of Object.entries({
      incomeCents: zeroEverything.incomeCents,
      billsCents: zeroEverything.billsCents,
      savingsCents: zeroEverything.savingsCents,
      toSpendCents: zeroEverything.toSpendCents,
      spentCents: zeroEverything.spentCents,
      leftCents: zeroEverything.leftCents,
      daysRemaining: zeroEverything.daysRemaining,
      leftTodayCents: zeroEverything.leftTodayCents,
      daysLeftInWeek: zeroEverything.daysLeftInWeek,
      leftThisWeekCents: zeroEverything.leftThisWeekCents,
      'foodThisWeek.spentCents': zeroEverything.foodThisWeek.spentCents,
      'foodThisWeek.remainingCents': zeroEverything.foodThisWeek.remainingCents,
      'savingsProgress.projectedBalanceCents': zeroEverything.savingsProgress.projectedBalanceCents,
      'savingsProgress.behindCents': zeroEverything.savingsProgress.behindCents,
      'savingsProgress.daysUntilTarget': zeroEverything.savingsProgress.daysUntilTarget,
    })) {
      finite(`Zero-income, zero-txn: ${name}`, value);
    }
    eq('Zero-income, zero-txn: byCategory is empty', zeroEverything.byCategory.length, 0);

    // A past month: daysRemaining collapses to 0 — leftToday/leftThisWeek must still
    // guard the division rather than divide by zero.
    const pastMonth = computeMonthMoney({
      txns: [],
      recurring: [],
      settings: mkSettings({ monthlyIncomeCents: 645_700, savingsTargetCents: 350_000 }),
      categories: CATEGORIES,
      month: '2026-01',
      today: '2026-08-10',
    });
    eq('Past month: daysRemaining is 0', pastMonth.daysRemaining, 0);
    eq('Past month: leftToday is guarded to 0, not NaN/Infinity', pastMonth.leftTodayCents, 0);
    finite('Past month: leftThisWeekCents', pastMonth.leftThisWeekCents);

    // A future month.
    const futureMonth = computeMonthMoney({
      txns: [],
      recurring: [],
      settings: mkSettings({ monthlyIncomeCents: 645_700, savingsTargetCents: 350_000 }),
      categories: CATEGORIES,
      month: '2027-03',
      today: '2026-08-10',
    });
    finite('Future month: daysRemaining', futureMonth.daysRemaining);
    finite('Future month: leftTodayCents', futureMonth.leftTodayCents);
    check('Future month: daysRemaining is the full month length', futureMonth.daysRemaining === 31);

    // The last day of the month: daysRemaining must be exactly 1, never 0.
    const lastDay = computeMonthMoney({
      txns: [],
      recurring: [],
      settings: mkSettings({ monthlyIncomeCents: 645_700, savingsTargetCents: 350_000 }),
      categories: CATEGORIES,
      month: '2026-08',
      today: '2026-08-31',
    });
    eq('Last day of month: daysRemaining === 1', lastDay.daysRemaining, 1);
    finite('Last day of month: leftTodayCents', lastDay.leftTodayCents);
    finite('Last day of month: leftThisWeekCents', lastDay.leftThisWeekCents);
  }

  // ===================================================================
  // 6. Food-this-week agrees with the same categories the breakdown uses —
  //    both are built from FOOD_GROUP_CATEGORY_IDS / CATEGORY_IDS in
  //    src/personal/plan.ts, never a separately-invented category list.
  // ===================================================================
  {
    // Wednesday 5 Aug 2026 -> week is Mon 3 Aug .. Sun 9 Aug, fully inside August.
    const today = '2026-08-05';
    const txns: Txn[] = [
      mkTxn({ date: '2026-08-04', amountCents: 5_000, categoryId: 'cat-groceries' }),
      mkTxn({ date: '2026-08-04', amountCents: 3_000, categoryId: 'cat-eating-out' }),
      mkTxn({ date: '2026-08-05', amountCents: 1_500, categoryId: 'cat-lunch' }),
      mkTxn({ date: '2026-08-05', amountCents: 500, categoryId: 'cat-coffee' }),
      mkTxn({ date: '2026-08-06', amountCents: 999_900, categoryId: 'cat-rent' }), // must not leak in
    ];
    const m = computeMonthMoney({
      txns,
      recurring: [],
      settings: mkSettings({ monthlyIncomeCents: 645_700, savingsTargetCents: 0 }),
      categories: CATEGORIES,
      month: '2026-08',
      today,
    });

    const FOOD_IDS = new Set(['cat-groceries', 'cat-eating-out', 'cat-lunch', 'cat-coffee']);
    const byCategoryFoodSum = m.byCategory
      .filter((row) => FOOD_IDS.has(row.categoryId))
      .reduce((sum, row) => sum + row.spentCents, 0);

    eq('foodThisWeek.spentCents agrees with the same 4 category ids summed in byCategory', m.foodThisWeek.spentCents, byCategoryFoodSum);
    eq('foodThisWeek.spentCents === 5000+3000+1500+500', m.foodThisWeek.spentCents, 10_000);
    eq('foodThisWeek target is the frozen $141/week headline', m.foodThisWeek.targetCents, 14_100);
    eq('foodThisWeek groceries bucket', m.foodThisWeek.groceriesCents, 5_000);
    eq('foodThisWeek away bucket (eating-out + lunch + coffee)', m.foodThisWeek.awayCents, 3_000 + 1_500 + 500);
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
