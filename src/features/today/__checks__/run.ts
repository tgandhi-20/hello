/**
 * Plain, node-runnable checks for the Home screen's two list builders.
 * No test framework is installed; run with:
 *   npx tsx src/features/today/__checks__/run.ts
 *
 * The money figures themselves are NOT re-tested here — they belong to the one
 * model in `src/money` and are covered by `src/money/__checks__/run.ts`. That
 * separation is the point of DESIGN-V4.md §1: Home renders a single
 * `computeMonthMoney()` result, so there is nothing left on this screen that
 * could disagree with it.
 *
 * What IS this screen's own logic, and so is tested here:
 *   - the merged 14-day "Bills due soon" window, its ordering and its boundaries
 *   - the "renders nothing when there's nothing to say" rule, both lists
 *
 * Never logs a real transaction, amount or merchant — only the small synthetic
 * fixtures built inline, same convention as every other suite in this repo.
 */
import type { RecurringSeries, Settings, Txn } from '@/types';
import { buildBillsDueSoon, BILLS_DUE_SOON_HORIZON_DAYS } from '../billsDueSoon';
import { buildToSortOut } from '../toSortOut';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  const ok = actual === expected;
  check(name, ok, ok ? undefined : `expected ${String(expected)}, got ${String(actual)}`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TODAY = '2026-08-09';

const SETTINGS: Settings = {
  currency: 'AUD',
  locale: 'en-AU',
  paydayDayOfMonth: 15,
  monthlyIncomeCents: 645_700,
  savingsTargetCents: 350_000,
  lockTimeoutMs: 120_000,
  biometricEnabled: false,
  pinnedCategoryIds: [],
};

/** Routine state with nothing ticked and nothing due — the quiet baseline. */
const EMPTY_ROUTINE = { done: {}, dailyLogDates: [] } as never;

function series(over: Partial<RecurringSeries> = {}): RecurringSeries {
  return {
    id: 'r1',
    merchant: 'Test Bill',
    categoryId: 'cat-utilities',
    cadence: 'monthly',
    amountCents: 21_000,
    lastSeen: '2026-07-12',
    nextDue: '2026-08-12',
    txnIds: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Bills due soon — window, ordering, boundaries
// ---------------------------------------------------------------------------

{
  const items = buildBillsDueSoon({ txns: [], recurring: [series()], settings: SETTINGS, today: TODAY });
  check('bill inside the window is included', items.some((i) => i.label.includes('Test Bill')));
}

{
  // Exactly on the horizon edge: today + 14 days must still be included, and
  // one day past it must not. Off-by-one here silently hides a rent payment.
  const onEdge = series({ id: 'edge', merchant: 'Edge Bill', nextDue: '2026-08-23' });
  const past = series({ id: 'past', merchant: 'Past Bill', nextDue: '2026-08-24' });
  const items = buildBillsDueSoon({
    txns: [],
    recurring: [onEdge, past],
    settings: SETTINGS,
    today: TODAY,
  });
  check('bill on the horizon edge is included', items.some((i) => i.label.includes('Edge Bill')));
  check('bill past the horizon is excluded', !items.some((i) => i.label.includes('Past Bill')));
}

{
  // A bill that was due yesterday is history, not something "due soon".
  const items = buildBillsDueSoon({
    txns: [],
    recurring: [series({ merchant: 'Yesterday Bill', nextDue: '2026-08-08' })],
    settings: SETTINGS,
    today: TODAY,
  });
  check('bill before today is excluded', !items.some((i) => i.label.includes('Yesterday Bill')));
}

{
  const items = buildBillsDueSoon({
    txns: [],
    recurring: [
      series({ id: 'late', merchant: 'Later', nextDue: '2026-08-20' }),
      series({ id: 'soon', merchant: 'Sooner', nextDue: '2026-08-11' }),
    ],
    settings: SETTINGS,
    today: TODAY,
  });
  const dates = items.map((i) => i.date);
  const sorted = [...dates].sort();
  eq('bills are sorted by date, soonest first', dates.join(','), sorted.join(','));
}

{
  const items = buildBillsDueSoon({ txns: [], recurring: [], settings: SETTINGS, today: TODAY });
  check(
    'every item carries a finite amount or an explicit null',
    items.every((i) => i.amountCents === null || Number.isFinite(i.amountCents))
  );
  check('every item has a date', items.every((i) => typeof i.date === 'string' && i.date.length === 10));
}

{
  eq('horizon is 14 days', BILLS_DUE_SOON_HORIZON_DAYS, 14);
}

// ---------------------------------------------------------------------------
// Empty-state suppression — the rule that keeps Home from becoming a wall again
// ---------------------------------------------------------------------------

{
  const items = buildToSortOut({
    txns: [],
    recurring: [],
    settings: SETTINGS,
    routineState: EMPTY_ROUTINE,
    today: TODAY,
  });
  eq('nothing to sort out on a clean vault', items.length, 0);
}

{
  // One uncategorised imported transaction is genuinely something to sort out.
  const txn: Txn = {
    id: 't1',
    date: TODAY,
    amountCents: 1_250,
    description: 'UNKNOWN MERCHANT',
    merchant: 'Unknown Merchant',
    categoryId: 'cat-other',
    account: 'cba',
    source: 'csv',
    hash: 'h1',
    createdAt: 0,
    updatedAt: 0,
  };
  const items = buildToSortOut({
    txns: [txn],
    recurring: [],
    settings: SETTINGS,
    routineState: EMPTY_ROUTINE,
    today: TODAY,
  });
  check('an uncategorised import surfaces', items.some((i) => i.kind === 'uncategorised'));
  check('every item has somewhere to go', items.every((i) => typeof i.to === 'string' && i.to.length > 0));
}

{
  // A manually logged transaction left on the fallback category is a deliberate
  // choice, not an import to clean up — it must not nag.
  const manual: Txn = {
    id: 't2',
    date: TODAY,
    amountCents: 500,
    description: 'Coffee',
    merchant: 'Coffee',
    categoryId: 'cat-other',
    account: 'cash',
    source: 'manual',
    hash: 'h2',
    createdAt: 0,
    updatedAt: 0,
  };
  const items = buildToSortOut({
    txns: [manual],
    recurring: [],
    settings: SETTINGS,
    routineState: EMPTY_ROUTINE,
    today: TODAY,
  });
  check('a manual entry on the fallback category does not nag', !items.some((i) => i.kind === 'uncategorised'));
}

{
  const excluded: Txn = {
    id: 't3',
    date: TODAY,
    amountCents: 24_900,
    description: 'TRANSFER',
    merchant: 'Transfer',
    categoryId: 'cat-other',
    account: 'cba',
    source: 'csv',
    hash: 'h3',
    excluded: true,
    createdAt: 0,
    updatedAt: 0,
  };
  const items = buildToSortOut({
    txns: [excluded],
    recurring: [],
    settings: SETTINGS,
    routineState: EMPTY_ROUTINE,
    today: TODAY,
  });
  check('an excluded transfer does not ask to be categorised', !items.some((i) => i.kind === 'uncategorised'));
}

// ---------------------------------------------------------------------------
// Degenerate inputs must stay finite — nothing may render as NaN
// ---------------------------------------------------------------------------

{
  const zeroIncome: Settings = { ...SETTINGS, monthlyIncomeCents: 0, savingsTargetCents: 0 };
  const bills = buildBillsDueSoon({ txns: [], recurring: [], settings: zeroIncome, today: TODAY });
  const sort = buildToSortOut({
    txns: [],
    recurring: [],
    settings: zeroIncome,
    routineState: EMPTY_ROUTINE,
    today: TODAY,
  });
  check('zero income produces no non-finite bill amounts', bills.every((i) => i.amountCents === null || Number.isFinite(i.amountCents)));
  check('zero income produces a finite to-sort-out list', Array.isArray(sort));
}

{
  const items = buildBillsDueSoon({
    txns: [],
    recurring: [series()],
    settings: SETTINGS,
    today: TODAY,
    horizonDays: 0,
  });
  check('a zero-day horizon never throws', Array.isArray(items));
}

// ---------------------------------------------------------------------------

console.log('\n--- Tally Home checks ---\n');
console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
