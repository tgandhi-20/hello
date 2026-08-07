/**
 * Plain, node-runnable checks for the routine feature (no test framework is installed).
 * Run with: `npx tsx src/features/routine/__checks__/run.ts`
 *
 * Never logs a transaction, amount, or merchant. The only "money" here is the
 * synthetic subscription baseline from PERSONAL.md §5, which is not a real financial
 * record.
 */
import type { RecurringSeries } from '../../../types';
import {
  lastBusinessDayOfMonth,
  firstSaturdayOfMonth,
  nthDayOfMonth,
  isWeekend,
} from '../dates';
import {
  resolveMonthlyItems,
  resolveDailyItem,
  dueOrSoon,
  ROUTINE_ITEM_DEFS,
} from '../items';
import {
  emptyChecklistState,
  rolloverIfNeeded,
  toggleMonthlyItem,
  toggleDailyLog,
} from '../state';
import { detectUnknownSubscriptions } from '../subscriptions';
import { KNOWN_SUBSCRIPTIONS, KNOWN_SUBSCRIPTIONS_TOTAL_CENTS, PLAN_DEFAULTS, CATEGORY_IDS } from '../../../personal/plan';
import { DEFAULT_AMEX_DUE_DAY_OF_MONTH } from '../planExtras';
import type { RoutineChecklistState, RoutineMonthState } from '../types';
import { DEFAULT_OPTIONS as RECURRING_DEFAULT_OPTIONS } from '../../recurring/detect';

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

function main(): void {
  console.log('--- Tally routine checks ---\n');

  // ===================================================================
  // 1. Last business day — months ending on a Saturday, a Sunday, and a weekday.
  //    Real 2026/2027 months, cross-checked independently against the calendar
  //    (see the report for how these were derived).
  // ===================================================================
  {
    // January 2026: 31 Jan 2026 is a Saturday -> roll back to Friday 30 Jan.
    eq('Last business day: Jan 2026 (ends Sat)', lastBusinessDayOfMonth('2026-01'), '2026-01-30');
    check('Jan 2026: 31st really is a Saturday', isWeekend('2026-01-31'));

    // May 2026: 31 May 2026 is a Sunday -> roll back to Friday 29 May.
    eq('Last business day: May 2026 (ends Sun)', lastBusinessDayOfMonth('2026-05'), '2026-05-29');
    check('May 2026: 31st really is a Sunday', isWeekend('2026-05-31'));

    // March 2026: 31 Mar 2026 is a Tuesday (weekday) -> stays put.
    eq('Last business day: Mar 2026 (ends weekday)', lastBusinessDayOfMonth('2026-03'), '2026-03-31');
    check('Mar 2026: 31st is a weekday', !isWeekend('2026-03-31'));

    // January 2027: 31 Jan 2027 is a Sunday -> roll back to Friday 29 Jan.
    eq('Last business day: Jan 2027 (ends Sun)', lastBusinessDayOfMonth('2027-01'), '2027-01-29');

    // July 2027: 31 Jul 2027 is a Saturday -> roll back to Friday 30 Jul.
    eq('Last business day: Jul 2027 (ends Sat)', lastBusinessDayOfMonth('2027-07'), '2027-07-30');

    // September 2027: 30 Sep 2027 is a Thursday (weekday) -> stays put.
    eq('Last business day: Sep 2027 (ends weekday)', lastBusinessDayOfMonth('2027-09'), '2027-09-30');

    // August 2026 — the plan's own reference month (PERSONAL.md §6): 31 Aug 2026 is a
    // Monday, a weekday, so the guard should not move it at all.
    eq('Last business day: Aug 2026 (the plan\'s own month)', lastBusinessDayOfMonth('2026-08'), '2026-08-31');
  }

  // ===================================================================
  // 2. First Saturday — including a month that STARTS on a Saturday.
  // ===================================================================
  {
    // August 2026: 1 Aug 2026 is itself a Saturday.
    eq('First Saturday: Aug 2026 (starts on Sat)', firstSaturdayOfMonth('2026-08'), '2026-08-01');

    // May 2027: 1 May 2027 is itself a Saturday.
    eq('First Saturday: May 2027 (starts on Sat)', firstSaturdayOfMonth('2027-05'), '2027-05-01');

    // January 2026: starts on a Thursday -> first Saturday is the 3rd.
    eq('First Saturday: Jan 2026 (starts Thu)', firstSaturdayOfMonth('2026-01'), '2026-01-03');

    // November 2026: starts on a Sunday -> first Saturday is the 7th.
    eq('First Saturday: Nov 2026 (starts Sun)', firstSaturdayOfMonth('2026-11'), '2026-11-07');

    // February 2027: starts on a Monday -> first Saturday is the 6th.
    eq('First Saturday: Feb 2027 (starts Mon)', firstSaturdayOfMonth('2027-02'), '2027-02-06');
  }

  // ===================================================================
  // 3. nthDayOfMonth clamping — a configured day must never overflow a short month.
  // ===================================================================
  {
    eq('nthDayOfMonth: 31st of Feb 2027 clamps to the 28th', nthDayOfMonth('2027-02', 31), '2027-02-28');
    eq('nthDayOfMonth: 16th of Aug 2026 is exact', nthDayOfMonth('2026-08', 16), '2026-08-16');
    eq('nthDayOfMonth: day 0 clamps up to the 1st', nthDayOfMonth('2026-08', 0), '2026-08-01');
  }

  // ===================================================================
  // 4. Monthly item due dates for the plan's own reference month (Aug 2026), against
  //    default settings — matches PERSONAL.md §6's "11 Aug Amex due / 15 Aug salary".
  // ===================================================================
  {
    const settings = { paydayDayOfMonth: 15, amexDueDayOfMonth: undefined as number | undefined };
    const emptyMonth: RoutineMonthState = { done: {}, dailyLogDates: [] };
    const resolved = resolveMonthlyItems('2026-08', settings, emptyMonth, '2026-08-01');
    const byId = new Map(resolved.map((r) => [r.id, r]));

    eq('Aug 2026: salary due 15th', byId.get('salary')?.dueDate, `2026-08-${PLAN_DEFAULTS.paydayDayOfMonth}`);
    eq(
      'Aug 2026: transfer due 16th (plan default autoTransferDayOfMonth)',
      byId.get('transfer-savings')?.dueDate,
      `2026-08-${PLAN_DEFAULTS.autoTransferDayOfMonth}`
    );
    eq('Aug 2026: last business day = 31st (a Monday)', byId.get('last-business-day')?.dueDate, '2026-08-31');
    eq('Aug 2026: first Saturday = 1st', byId.get('first-saturday')?.dueDate, '2026-08-01');
    eq(
      'Aug 2026: Amex due on the plan-derived default day',
      byId.get('pay-amex')?.dueDate,
      `2026-08-${String(DEFAULT_AMEX_DUE_DAY_OF_MONTH).padStart(2, '0')}`
    );
    eq('Aug 2026: default Amex due day is the 11th (derived from @/personal/plan)', DEFAULT_AMEX_DUE_DAY_OF_MONTH, 11);
    eq('Aug 2026: resolves all 5 monthly items', resolved.length, ROUTINE_ITEM_DEFS.length);

    // Configurable Amex due day — changing settings changes the due date, not August 11
    // hardcoded (deliverable 3's explicit requirement).
    const customSettings = { paydayDayOfMonth: 15, amexDueDayOfMonth: 20, transferToSavingsDayOfMonth: undefined as number | undefined };
    const resolvedCustom = resolveMonthlyItems('2026-09', customSettings, emptyMonth, '2026-09-01');
    const amexCustom = resolvedCustom.find((r) => r.id === 'pay-amex');
    eq('Amex due day honours a non-default setting', amexCustom?.dueDate, '2026-09-20');

    // A changed payday setting shifts salary, but NOT the transfer-to-savings day — that
    // now has its own independent default/override (@/personal/plan's
    // PLAN_DEFAULTS.autoTransferDayOfMonth), matching how the two are modelled as
    // separately configurable rather than transfer always being "payday + 1".
    const shiftedPayday = { paydayDayOfMonth: 20, amexDueDayOfMonth: undefined as number | undefined, transferToSavingsDayOfMonth: undefined as number | undefined };
    const resolvedShifted = resolveMonthlyItems('2026-08', shiftedPayday, emptyMonth, '2026-08-01');
    eq('Changed payday shifts salary', resolvedShifted.find((r) => r.id === 'salary')?.dueDate, '2026-08-20');
    eq(
      "Changed payday does NOT move the transfer day (it's independently configurable)",
      resolvedShifted.find((r) => r.id === 'transfer-savings')?.dueDate,
      `2026-08-${PLAN_DEFAULTS.autoTransferDayOfMonth}`
    );

    // An explicit transferToSavingsDayOfMonth override IS honoured.
    const explicitTransfer = { paydayDayOfMonth: 15, amexDueDayOfMonth: undefined as number | undefined, transferToSavingsDayOfMonth: 18 };
    const resolvedExplicitTransfer = resolveMonthlyItems('2026-08', explicitTransfer, emptyMonth, '2026-08-01');
    eq(
      'Explicit transferToSavingsDayOfMonth override is honoured',
      resolvedExplicitTransfer.find((r) => r.id === 'transfer-savings')?.dueDate,
      '2026-08-18'
    );
  }

  // ===================================================================
  // 5. Due-soon logic across a MONTH boundary and a YEAR boundary (Dec 2026 -> Jan 2027).
  // ===================================================================
  {
    const settings = { paydayDayOfMonth: 15, amexDueDayOfMonth: undefined as number | undefined };
    const emptyMonth: RoutineMonthState = { done: {}, dailyLogDates: [] };

    // Today is 29 Dec 2026. December's own items are all long past (payday 15th,
    // transfer 16th, etc. all fell earlier in the month) and done=false, so they read
    // as overdue, not "due soon" — only January 2027's items within the 5-day horizon
    // (up to and including 3 Jan 2027) should surface.
    const decItems = resolveMonthlyItems('2026-12', settings, emptyMonth, '2026-12-29');
    const janItems = resolveMonthlyItems('2027-01', settings, emptyMonth, '2026-12-29');
    const combined = [...decItems, ...janItems];
    const dueSoon = dueOrSoon(combined, '2026-12-29', 5);

    // Horizon is 2026-12-29 + 5 days = 2027-01-03 — crosses both the month AND year
    // boundary in the addDays arithmetic that backs it.
    check(
      'Due-soon horizon crosses the year boundary correctly',
      dueSoon.every((i) => i.dueDate <= '2027-01-03'),
      `dueDates: ${dueSoon.map((i) => i.dueDate).join(', ')}`
    );
    check(
      'Due-soon still includes December\'s now-overdue items (undone, due date in the past)',
      dueSoon.some((i) => i.id === 'salary' && i.dueDate === '2026-12-15')
    );
    check(
      'Due-soon does NOT include a January item whose due date is past the 5-day horizon',
      !dueSoon.some((i) => i.id === 'last-business-day' && i.dueDate > '2027-01-03')
    );

    // The January salary item (due 2027-01-15) is well outside the 5-day horizon from
    // 29 Dec 2026, so it must not appear yet — proves the boundary crossing didn't
    // accidentally pull in everything from the new year.
    check(
      'January salary (15th) is NOT yet due-soon from 29 Dec',
      !dueSoon.some((i) => i.id === 'salary' && i.dueDate === '2027-01-15')
    );
  }

  // ===================================================================
  // 6. Checklist state resets on a new month WITHOUT losing history.
  // ===================================================================
  {
    const julyState: RoutineChecklistState = {
      currentMonth: '2026-07',
      current: { done: { salary: true, 'transfer-savings': true }, dailyLogDates: ['2026-07-02', '2026-07-03'] },
      history: { '2026-06': { done: { salary: true }, dailyLogDates: ['2026-06-01'] } },
    };

    const rolledIntoAugust = rolloverIfNeeded(julyState, '2026-08-05');
    eq('Rollover: currentMonth advances to August', rolledIntoAugust.currentMonth, '2026-08');
    eq('Rollover: August starts with a clean (empty) bucket', rolledIntoAugust.current, {
      done: {},
      dailyLogDates: [],
    });
    eq(
      "Rollover: July's completed state is archived into history, not dropped",
      rolledIntoAugust.history['2026-07'],
      julyState.current
    );
    eq(
      "Rollover: June's history from before is still there too",
      rolledIntoAugust.history['2026-06'],
      julyState.history['2026-06']
    );

    // Calling rollover again on the SAME month is a no-op (idempotent — a component
    // re-rendering shouldn't silently wipe today's ticks).
    const rolledAgain = rolloverIfNeeded(rolledIntoAugust, '2026-08-20');
    check('Rollover is a no-op within the same month', rolledAgain === rolledIntoAugust);

    // Ticking an item in August does not touch July's archived history.
    const withAugustSalaryTicked = toggleMonthlyItem(rolledIntoAugust, 'salary');
    eq('Ticking August salary does not resurrect it in July\'s archive', withAugustSalaryTicked.history['2026-07'], julyState.current);
    check('August salary is now ticked', Boolean(withAugustSalaryTicked.current.done.salary));

    // Undefined starting state (never used the checklist before) still produces a
    // sane, empty bucket for the current month rather than throwing.
    const fresh = rolloverIfNeeded(undefined, '2026-03-14');
    eq('Rollover from undefined starts fresh for the right month', fresh.currentMonth, '2026-03');
    eq('Rollover from undefined has an empty current bucket', fresh.current, { done: {}, dailyLogDates: [] });
    eq('emptyChecklistState matches rolloverIfNeeded(undefined, today)', emptyChecklistState('2026-03-14'), fresh);

    // History is capped (bounded growth across years of use) — rolling through 20
    // consecutive months keeps only the most recent 12 in history.
    let state = rolloverIfNeeded(undefined, '2025-01-15');
    for (let i = 2; i <= 21; i++) {
      const month = i <= 12 ? `2025-${String(i).padStart(2, '0')}` : `2026-${String(i - 12).padStart(2, '0')}`;
      state = rolloverIfNeeded(state, `${month}-15`);
    }
    check('History is capped at 12 months', Object.keys(state.history).length <= 12, `got ${Object.keys(state.history).length}`);
  }

  // ===================================================================
  // 7. Daily log toggling — independent of the monthly items, keyed by date.
  // ===================================================================
  {
    const empty: RoutineMonthState = { done: {}, dailyLogDates: [] };
    const state: RoutineChecklistState = { currentMonth: '2026-08', current: empty, history: {} };

    const afterFirstTick = toggleDailyLog(state, '2026-08-05');
    eq('Daily log: ticking today adds today\'s date', afterFirstTick.current.dailyLogDates, ['2026-08-05']);

    const daily = resolveDailyItem(afterFirstTick.current, '2026-08-05');
    check('resolveDailyItem reflects today\'s tick as done', daily.done);

    const dailyYesterday = resolveDailyItem(afterFirstTick.current, '2026-08-04');
    check('resolveDailyItem for a DIFFERENT day is not done', !dailyYesterday.done);

    const afterUntick = toggleDailyLog(afterFirstTick, '2026-08-05');
    eq('Daily log: ticking again removes today\'s date', afterUntick.current.dailyLogDates, []);
  }

  // ===================================================================
  // 8. Subscription baseline — PERSONAL.md §5.
  // ===================================================================
  {
    eq('Known subscriptions: exactly 4 entries', KNOWN_SUBSCRIPTIONS.length, 4);
    // Exact sum of the four real figures: 1450 + 999 + 719 + 449 = 3617 cents ($36.17).
    // PERSONAL.md §3's cat-subscriptions cap rounds this to "$36" — the two are allowed
    // to differ by that ~17c of rounding (see @/personal/plan.ts's header note). This
    // check asserts the true, exact figure, integer cents throughout.
    eq('Known subscriptions sum to exactly $36.17 (3617c)', KNOWN_SUBSCRIPTIONS_TOTAL_CENTS, 3617);
    check(
      'That total rounds to the plan\'s "$36/month" headline',
      Math.round(KNOWN_SUBSCRIPTIONS_TOTAL_CENTS / 100) === 36
    );
    check(
      'Every known subscription amount is an integer cents value',
      KNOWN_SUBSCRIPTIONS.every((s) => Number.isInteger(s.amountCents))
    );
  }

  // ===================================================================
  // 9. Unknown-subscription detection — flags a genuinely new recurring charge,
  //    leaves the four known ones alone, and structurally can't be fooled by a
  //    one-off (the "$206 was really two one-off Anthropic charges" mistake).
  // ===================================================================
  {
    const netflix = makeSeries('rec-netflix', 'Netflix', CATEGORY_IDS.subscriptions, 'monthly', 1450);
    const disneyPlus = makeSeries('rec-disney', 'Disney Plus', CATEGORY_IDS.subscriptions, 'monthly', 1299);
    const mutedUnknown = makeSeries('rec-muted', 'Some Other App', CATEGORY_IDS.subscriptions, 'monthly', 999, true);
    const groceryRecurring = makeSeries('rec-woolies', 'Woolworths', CATEGORY_IDS.groceries, 'weekly', 8500);

    const unknown = detectUnknownSubscriptions([netflix, disneyPlus, mutedUnknown, groceryRecurring]);
    eq('Unknown subscriptions: exactly 1 flagged', unknown.length, 1);
    eq('Unknown subscriptions: it is Disney Plus', unknown[0]?.merchant, 'Disney Plus');
    check('Known Netflix is never flagged as unknown', !unknown.some((s) => s.merchant === 'Netflix'));
    check('Muted series is never flagged even if unknown', !unknown.some((s) => s.id === 'rec-muted'));
    check(
      'A recurring charge outside cat-subscriptions is not flagged as a subscription',
      !unknown.some((s) => s.merchant === 'Woolworths')
    );

    // Structural guarantee, not re-implemented logic: a series can only exist here at
    // all once the detector has confirmed 3+ occurrences at a regular cadence — a
    // single large one-off charge (the PERSONAL.md §5 "$206" mistake) never clusters
    // into a RecurringSeries in the first place, so it can never reach this function.
    check(
      "Recurring detection's own occurrence floor (>= 3) is what keeps a one-off from ever looking like a subscription",
      RECURRING_DEFAULT_OPTIONS.minOccurrences >= 3,
      `got ${RECURRING_DEFAULT_OPTIONS.minOccurrences}`
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

function makeSeries(
  id: string,
  merchant: string,
  categoryId: string,
  cadence: RecurringSeries['cadence'],
  amountCents: number,
  muted = false
): RecurringSeries {
  return {
    id,
    merchant,
    categoryId,
    cadence,
    amountCents,
    lastSeen: '2026-08-01',
    nextDue: '2026-09-01',
    txnIds: [],
    muted,
  };
}

main();
