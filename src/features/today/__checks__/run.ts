/**
 * Plain, node-runnable checks for the Today screen's composition logic (no
 * test framework is installed). Run with:
 *   npx tsx src/features/today/__checks__/run.ts
 *
 * Covers three things DESIGN-V3.md §4 calls out specifically:
 *   1. "Coming up" — the 14-day merge of recurring/card-payment/statement-close/
 *      income/savings-transfer, correctly windowed and ordered.
 *   2. The empty-state suppression rule — a section with nothing to say
 *      produces no rows (`buildNeedsYou` returns `[]`; `buildComingUp` returns
 *      `[]` for a vault with nothing scheduled).
 *   3. Every figure Today derives stays finite for empty input — no
 *      NaN/Infinity may ever render (CONTRACTS.md §6).
 *
 * Never logs a transaction, amount, or merchant — every fixture below is
 * synthetic.
 */
import type { RecurringSeries, Settings, Txn } from '../../../types';
import type { RoutineMonthState } from '../../routine/types';
import { addDays } from '../../../ui/format';
import { buildComingUp, COMING_UP_HORIZON_DAYS } from '../comingUp';
import { buildNeedsYou } from '../needsYou';
import { computeSafeToSpend } from '../safeToSpend';
import { computeFoodWeekStats } from '../../food/foodStats';
import { FOOD_WEEKLY_TARGET_CENTS } from '../../food/config';

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
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, ok ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function finite(name: string, value: number): void {
  check(name, Number.isFinite(value), `expected a finite number, got ${value}`);
}

let txnCounter = 0;
function mkTxn(partial: Partial<Txn> & Pick<Txn, 'date' | 'amountCents' | 'account'>): Txn {
  txnCounter++;
  return {
    id: `txn-${txnCounter}`,
    description: 'txn',
    merchant: 'Merchant',
    categoryId: 'cat-other',
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

/** Every monthly routine item marked done — used to isolate a single "needs you"
 *  trigger under test from the routine checklist's own due/overdue state, which
 *  (deliberately, per PERSONAL.md §8) accumulates "due" items as a real month
 *  progresses regardless of which calendar date a fixture picks. */
const ALL_ROUTINE_DONE: RoutineMonthState = {
  done: { salary: true, 'transfer-savings': true, 'last-business-day': true, 'first-saturday': true, 'pay-amex': true },
  dailyLogDates: [],
};

function mkSeries(partial: Partial<RecurringSeries> & Pick<RecurringSeries, 'id' | 'nextDue'>): RecurringSeries {
  return {
    merchant: 'Merchant',
    categoryId: 'cat-other',
    cadence: 'weekly',
    amountCents: 1_000,
    lastSeen: partial.nextDue,
    txnIds: [],
    muted: false,
    ...partial,
  };
}

async function main(): Promise<void> {
  console.log('--- Tally Today screen checks ---\n');

  // ===================================================================
  // 1. "Coming up" — merge across recurring, card payment due, statement
  //    close, income and savings-transfer, correctly ordered and windowed.
  // ===================================================================
  {
    const today = '2026-08-01';

    const settings = mkSettings({
      monthlyIncomeCents: 645_700,
      paydayDayOfMonth: 15, // -> next payday 2026-08-15, inside the 14-day window (boundary)
      savingsTargetCents: 350_000,
      transferToSavingsDayOfMonth: 8, // -> 2026-08-08, inside the window
      statementCycles: {
        amex: { closingDay: 3, dueDay: 10, setAt: 0 }, // user override -> deterministic, no txn history needed
      },
    });

    const recurring: RecurringSeries[] = [
      mkSeries({ id: 'rec-weekly', nextDue: '2026-08-05', cadence: 'weekly', amountCents: 1_450 }),
    ];

    const items = buildComingUp({ txns: [], recurring, settings, today });

    // Expected, in date order: 08-03 statement-close (amex), 08-05 recurring,
    // 08-08 savings-transfer, 08-10 card-payment (amex due), 08-12 recurring
    // (the weekly series' second occurrence), 08-15 income (salary).
    eq(
      'Coming up: dates in soonest-first order',
      items.map((i) => i.date),
      ['2026-08-03', '2026-08-05', '2026-08-08', '2026-08-10', '2026-08-12', '2026-08-15']
    );
    eq(
      'Coming up: kinds match the merged sources at each date',
      items.map((i) => i.kind),
      ['statement-close', 'recurring', 'savings-transfer', 'card-payment', 'recurring', 'income']
    );
    check(
      'Coming up: statement-close carries no amount (a date, not a transaction)',
      items[0].kind === 'statement-close' && items[0].amountCents === null
    );
    check('Coming up: recurring row carries the series amount', items[1].amountCents === 1_450);
    check(
      'Coming up: 14-day horizon constant matches DESIGN-V3.md §4 ("next 14 days")',
      COMING_UP_HORIZON_DAYS === 14
    );
  }

  // ===================================================================
  // 2. "Coming up" — window boundary is inclusive at exactly +14 days and
  //    excludes +15.
  // ===================================================================
  {
    const today = '2026-08-01';
    const settings = mkSettings();

    const onBoundary = buildComingUp({
      txns: [],
      recurring: [mkSeries({ id: 'on-boundary', nextDue: addDays(today, 14), cadence: 'monthly' })],
      settings,
      today,
    });
    eq('Coming up: an event exactly 14 days out IS included', onBoundary.length, 1);

    const pastBoundary = buildComingUp({
      txns: [],
      recurring: [mkSeries({ id: 'past-boundary', nextDue: addDays(today, 15), cadence: 'monthly' })],
      settings,
      today,
    });
    eq('Coming up: an event 15 days out is NOT included', pastBoundary.length, 0);
  }

  // ===================================================================
  // 3. "Coming up" — empty-state suppression: nothing scheduled -> no rows.
  // ===================================================================
  {
    const items = buildComingUp({
      txns: [],
      recurring: [],
      settings: mkSettings(), // income/savings both 0 -> neither event type fires; no card history -> no cycle
      today: '2026-08-01',
    });
    eq('Coming up: nothing scheduled produces an empty list, not placeholder rows', items, []);
  }

  // ===================================================================
  // 4. "Needs you" — empty-state suppression: a clean vault produces no rows.
  // ===================================================================
  {
    const items = buildNeedsYou({
      txns: [],
      recurring: [],
      settings: mkSettings(),
      routineState: ALL_ROUTINE_DONE,
      today: '2026-08-01',
    });
    eq('Needs you: a brand-new vault with nothing outstanding produces an empty list', items, []);
  }

  // ===================================================================
  // 5. "Needs you" — each trigger fires independently and is labelled correctly.
  // ===================================================================
  {
    // (a) Uncategorised imported transaction. Account is `bankwest` (not a card
    //     account per `CARD_ACCOUNT_IDS`) so this fixture exercises exactly one
    //     trigger — an `amex`/`cba` txn here would also light up the
    //     unconfirmed-cycle trigger tested separately in (c).
    const uncategorisedItems = buildNeedsYou({
      txns: [mkTxn({ date: '2026-08-01', amountCents: 500, account: 'bankwest', source: 'csv', categoryId: 'cat-other' })],
      recurring: [],
      settings: mkSettings(),
      routineState: ALL_ROUTINE_DONE,
      today: '2026-08-01',
    });
    eq('Needs you: one uncategorised csv txn -> exactly one item', uncategorisedItems.length, 1);
    eq('Needs you: uncategorised item kind', uncategorisedItems[0]?.kind, 'uncategorised');

    // A manually-logged (not imported) uncategorised txn must NOT trigger this —
    // there's nothing to "clean up" from an import that didn't happen.
    const manualUncategorised = buildNeedsYou({
      txns: [mkTxn({ date: '2026-08-01', amountCents: 500, account: 'cash', source: 'manual', categoryId: 'cat-other' })],
      recurring: [],
      settings: mkSettings(),
      routineState: ALL_ROUTINE_DONE,
      today: '2026-08-01',
    });
    eq('Needs you: a manually-logged cat-other txn does not trigger the uncategorised prompt', manualUncategorised.length, 0);

    // (b) Detected price rise.
    const priceRiseItems = buildNeedsYou({
      txns: [],
      recurring: [
        mkSeries({ id: 'rec-1', nextDue: '2026-08-10', merchant: 'Netflix', priceIncreaseCents: 300 }),
      ],
      settings: mkSettings(),
      routineState: ALL_ROUTINE_DONE,
      today: '2026-08-01',
    });
    eq('Needs you: one price-risen series -> exactly one item', priceRiseItems.length, 1);
    eq('Needs you: price-rise item kind', priceRiseItems[0]?.kind, 'price-rise');
    eq('Needs you: price-rise item carries the delta amount', priceRiseItems[0]?.amountCents, 300);

    // A muted series' price rise must not surface.
    const mutedPriceRise = buildNeedsYou({
      txns: [],
      recurring: [
        mkSeries({ id: 'rec-2', nextDue: '2026-08-10', priceIncreaseCents: 300, muted: true }),
      ],
      settings: mkSettings(),
      routineState: ALL_ROUTINE_DONE,
      today: '2026-08-01',
    });
    eq('Needs you: a MUTED series price rise does not surface', mutedPriceRise.length, 0);

    // (c) Unconfirmed statement cycle — card has history but no payment-like
    //     txns yet, so inference is 'unknown', and there's no user override.
    const unconfirmedCycleItems = buildNeedsYou({
      txns: [mkTxn({ date: '2026-08-01', amountCents: 2_000, account: 'amex', categoryId: 'cat-shopping' })],
      recurring: [],
      settings: mkSettings(),
      routineState: ALL_ROUTINE_DONE,
      today: '2026-08-01',
    });
    eq('Needs you: amex history with an unknown cycle -> exactly one item', unconfirmedCycleItems.length, 1);
    eq('Needs you: unconfirmed-cycle item kind', unconfirmedCycleItems[0]?.kind, 'unconfirmed-cycle');

    // A user override must suppress it — that's the user's own stated fact,
    // never re-flagged as "needs you".
    const overriddenCycleItems = buildNeedsYou({
      txns: [mkTxn({ date: '2026-08-01', amountCents: 2_000, account: 'amex', categoryId: 'cat-shopping' })],
      recurring: [],
      settings: mkSettings({ statementCycles: { amex: { closingDay: 3, dueDay: 10, setAt: 0 } } }),
      routineState: ALL_ROUTINE_DONE,
      today: '2026-08-01',
    });
    eq('Needs you: a user-overridden cycle is never flagged as unconfirmed', overriddenCycleItems.length, 0);

    // (d) Routine item overdue.
    const routineItems = buildNeedsYou({
      txns: [],
      recurring: [],
      settings: mkSettings({ paydayDayOfMonth: 15 }),
      routineState: { done: {}, dailyLogDates: [] },
      today: '2026-08-20', // -> "salary" (due the 15th) is overdue and undone
    });
    const salaryItem = routineItems.find((i) => i.id === 'routine-salary');
    check('Needs you: an overdue, undone routine item surfaces', Boolean(salaryItem));
    eq('Needs you: overdue routine item kind', salaryItem?.kind, 'routine');

    // Ticking it off must remove it.
    const routineDoneItems = buildNeedsYou({
      txns: [],
      recurring: [],
      settings: mkSettings({ paydayDayOfMonth: 15 }),
      routineState: { done: { salary: true }, dailyLogDates: [] },
      today: '2026-08-20',
    });
    check(
      'Needs you: a ticked-off routine item no longer surfaces',
      !routineDoneItems.some((i) => i.id === 'routine-salary')
    );
  }

  // ===================================================================
  // 6. Every derived figure stays finite for empty input (CONTRACTS.md §6:
  //    "no NaN/Infinity may ever render") — Safe-to-Spend, Coming Up and the
  //    food-week stats Today's Food section reuses.
  // ===================================================================
  {
    const stsUnset = computeSafeToSpend({ txns: [], recurring: [], settings: mkSettings() });
    check('Safe-to-Spend: incomeUnset is true for a fresh vault', stsUnset.incomeUnset);
    finite('Safe-to-Spend (empty, income unset): incomeCents', stsUnset.incomeCents);
    finite('Safe-to-Spend (empty, income unset): committedCents', stsUnset.committedCents);
    finite('Safe-to-Spend (empty, income unset): savingsTargetCents', stsUnset.savingsTargetCents);
    finite('Safe-to-Spend (empty, income unset): spentSoFarCents', stsUnset.spentSoFarCents);
    finite('Safe-to-Spend (empty, income unset): poolCents', stsUnset.poolCents);
    finite('Safe-to-Spend (empty, income unset): daysRemaining', stsUnset.daysRemaining);
    finite('Safe-to-Spend (empty, income unset): perDayCents', stsUnset.perDayCents);
    check('Safe-to-Spend (empty, income unset): daysRemaining is at least 1', stsUnset.daysRemaining >= 1);

    // Also finite once income IS set but nothing else has happened yet.
    const stsSet = computeSafeToSpend({
      txns: [],
      recurring: [],
      settings: mkSettings({ monthlyIncomeCents: 645_700, savingsTargetCents: 350_000 }),
    });
    finite('Safe-to-Spend (income set, no txns): poolCents', stsSet.poolCents);
    finite('Safe-to-Spend (income set, no txns): perDayCents', stsSet.perDayCents);

    const emptyComingUp = buildComingUp({ txns: [], recurring: [], settings: mkSettings(), today: '2026-08-01' });
    for (const item of emptyComingUp) {
      if (item.amountCents !== null) finite(`Coming up item ${item.id}: amountCents finite`, item.amountCents);
    }
    eq('Coming up (empty input): produces no rows', emptyComingUp, []);

    const foodStats = computeFoodWeekStats([], FOOD_WEEKLY_TARGET_CENTS, '2026-08-01');
    finite('Food stats (empty week): spentCents', foodStats.spentCents);
    finite('Food stats (empty week): remainingCents', foodStats.remainingCents);
    finite('Food stats (empty week): groceriesRatio', foodStats.groceriesRatio);
    finite('Food stats (empty week): awayRatio', foodStats.awayRatio);
    finite('Food stats (empty week): projectedWeekTotalCents', foodStats.projectedWeekTotalCents);
    finite('Food stats (empty week): paceDeltaCents', foodStats.paceDeltaCents);
    finite('Food stats (empty week): coffee.avgCents', foodStats.coffee.avgCents);
    eq('Food stats (empty week): pace reads on-track, not a false "over"', foodStats.paceStatus, 'on-track');
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
