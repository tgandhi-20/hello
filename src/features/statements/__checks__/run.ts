/**
 * Plain, node-runnable checks for the statements & bill-prediction feature
 * (no test framework is installed). Run with:
 *   npx tsx src/features/statements/__checks__/run.ts
 *
 * Never logs a transaction, amount, or merchant beyond the synthetic
 * fixtures constructed below — none of this is real financial data.
 */
import type { RecurringSeries, Txn } from '../../../types';
import { addDays } from '../../../ui/format';
import { addMonthsClamped, dateFromParts, diffDaysLocal, nextAfter, nextOnOrAfter } from '../dates';
import { currentCycleWindow, inferCycle } from '../cycle';
import { computeCurrentCycleBalance } from '../balance';
import { buildCashflowCalendar } from '../upcoming';
import { confirmSeries, replaceSeries, unconfirmSeries } from '../confirmSeries';
import { detectRecurring, DEFAULT_OPTIONS } from '../../recurring/detect';

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

let txnCounter = 0;
function mkTxn(partial: Partial<Txn> & Pick<Txn, 'date' | 'amountCents' | 'account'>): Txn {
  txnCounter++;
  return {
    id: `txn-${txnCounter}`,
    description: partial.merchant ?? 'txn',
    merchant: partial.merchant ?? 'txn',
    categoryId: 'cat-other',
    source: 'csv',
    hash: `hash-${txnCounter}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}

function mkSeries(partial: Partial<RecurringSeries> & Pick<RecurringSeries, 'id' | 'merchant' | 'amountCents' | 'nextDue'>): RecurringSeries {
  return {
    categoryId: 'cat-subscriptions',
    cadence: 'monthly',
    lastSeen: '2026-08-01',
    txnIds: [],
    muted: false,
    ...partial,
  };
}

function main(): void {
  console.log('--- Tally statements checks ---\n');

  // ===================================================================
  // 1. Local date math — month/year rollover, no Date/timezone traps.
  // ===================================================================
  {
    eq('dateFromParts clamps 31 Feb to 28 (non-leap 2027)', dateFromParts(2027, 2, 31), '2027-02-28');
    eq('dateFromParts clamps 31 Feb to 29 (leap 2028)', dateFromParts(2028, 2, 31), '2028-02-29');

    eq('addMonthsClamped: 31 Jan 2027 + 1 month -> 28 Feb (clamped, not rolled into March)', addMonthsClamped('2027-01-31', 1), '2027-02-28');
    eq('addMonthsClamped: Dec 2026 + 1 month -> Jan 2027 (year rollover)', addMonthsClamped('2026-12-15', 1), '2027-01-15');
    eq('addMonthsClamped: Jan 2027 - 1 month -> Dec 2026 (year rollback)', addMonthsClamped('2027-01-15', -1), '2026-12-15');

    eq('nextOnOrAfter: candidate this month, on/after -> unchanged', nextOnOrAfter('2026-08-10', 20), '2026-08-20');
    eq('nextOnOrAfter: candidate this month already passed -> rolls to next month', nextOnOrAfter('2026-08-25', 20), '2026-09-20');
    eq('nextOnOrAfter: Dec -> Jan rollover', nextOnOrAfter('2026-12-29', 15), '2027-01-15');

    eq('nextAfter: strictly after, same-day pushes to next occurrence', nextAfter('2026-08-20', 20), '2026-09-20');
    eq('nextAfter: due day numerically before close day still lands next month', nextAfter('2026-08-20', 11), '2026-09-11');
    eq('nextAfter: Dec close -> Jan due (year rollover)', nextAfter('2026-12-28', 20), '2027-01-20');

    eq('diffDaysLocal: simple same-month gap', diffDaysLocal('2026-08-05', '2026-08-10'), 5);
    eq('diffDaysLocal: month rollover gap', diffDaysLocal('2026-08-28', '2026-09-03'), 6);
    eq('diffDaysLocal: zero gap', diffDaysLocal('2026-08-05', '2026-08-05'), 0);
  }

  // ===================================================================
  // 2. Cycle inference — synthetic 4-month Amex history.
  // ===================================================================
  {
    const months = ['2026-04', '2026-05', '2026-06', '2026-07'];
    const amexTxns: Txn[] = [];
    for (const m of months) {
      amexTxns.push(mkTxn({ date: `${m}-03`, amountCents: 5000, account: 'amex', merchant: 'Woolworths' }));
      amexTxns.push(mkTxn({ date: `${m}-10`, amountCents: 8000, account: 'amex', merchant: 'JB Hi-Fi' }));
      amexTxns.push(mkTxn({ date: `${m}-20`, amountCents: 12000, account: 'amex', merchant: 'Dan Murphy\'s' }));
      // Payment: money IN (negative), $600, far larger than any charge above -> recognised structurally, not by text.
      amexTxns.push(mkTxn({ date: `${m}-11`, amountCents: -60000, account: 'amex', merchant: 'PAYMENT RECEIVED' }));
    }

    const cycle = inferCycle(amexTxns, 'amex', { today: '2026-08-01' });
    eq('Amex 4-month history: due day learned as the 11th', cycle.dueDay, 11);
    eq('Amex 4-month history: due day confidence is high (4 consistent payments)', cycle.dueDayConfidence, 'high');
    eq('Amex 4-month history: closing day derived as 25 days before due (11 - 25, wrapped)', cycle.closingDay, 14);
    eq('Amex 4-month history: closing day confidence capped at medium (never observed directly)', cycle.closingDayConfidence, 'medium');
    eq('Amex 4-month history: source is inferred, not a default guess', cycle.source, 'inferred');
    eq('Amex 4-month history: 4 payment occurrences counted', cycle.paymentOccurrences, 4);
    check('Amex 4-month history: note is a non-empty, honest explanation', cycle.note.length > 20);

    // Due-date arithmetic across a year boundary, using the inferred cycle.
    const decWindow = currentCycleWindow(cycle, '2026-12-20');
    check('Cycle window exists once dueDay/closingDay are known', decWindow !== null);
    if (decWindow) {
      eq('Dec->Jan: close date lands in December (14th)', decWindow.cycleCloseDate, '2026-12-14');
      eq('Dec->Jan: payment due date rolls into January', decWindow.paymentDueDate, '2027-01-11');
      check('Dec->Jan: payment due date year rolled over correctly', decWindow.paymentDueDate > decWindow.cycleCloseDate);
    }
  }

  // ===================================================================
  // 3. Insufficient / zero history -> honest "unknown", never a fabricated
  //    date, never a NaN.
  // ===================================================================
  {
    const cycle = inferCycle([], 'amex', { today: '2026-08-01' });
    eq('No history: closingDay is null, not a guess', cycle.closingDay, null);
    eq('No history: dueDay is null, not a guess', cycle.dueDay, null);
    eq('No history: closingDayConfidence is unknown', cycle.closingDayConfidence, 'unknown');
    eq('No history: dueDayConfidence is unknown', cycle.dueDayConfidence, 'unknown');
    eq('No history: source is default, not inferred', cycle.source, 'default');
    check('No history: note explains why, non-empty', cycle.note.length > 10);

    check('No history: currentCycleWindow returns null (never a fabricated window)', currentCycleWindow(cycle, '2026-08-01') === null);

    const balance = computeCurrentCycleBalance([], [], 'amex', cycle, '2026-08-01');
    eq('No history: balance status is insufficient-history', balance.status, 'insufficient-history');
    eq('No history: closedToDateCents is 0, not NaN', balance.closedToDateCents, 0);
    eq('No history: projectedTotalCents is 0, not NaN', balance.projectedTotalCents, 0);
    check('No history: projectedTotalCents is a real number', Number.isFinite(balance.projectedTotalCents));
    eq('No history: cycleCloseDate is null', balance.cycleCloseDate, null);
    eq('No history: paymentDueDate is null', balance.paymentDueDate, null);

    // A single stray large-ish credit (e.g. one refund) must not be enough to
    // report a confident cycle — this is "prefer under-claiming" in action.
    const oneOff = inferCycle(
      [mkTxn({ date: '2026-08-05', amountCents: 4000, account: 'amex' }), mkTxn({ date: '2026-08-11', amountCents: -20000, account: 'amex' })],
      'amex',
      { today: '2026-08-15' }
    );
    eq('Single payment occurrence: due day confidence is only low', oneOff.dueDayConfidence, 'low');
    eq('Single payment occurrence: closing day confidence is only low too', oneOff.closingDayConfidence, 'low');
  }

  // ===================================================================
  // 4. User override always wins, and is reported honestly as "you set this".
  // ===================================================================
  {
    const cycle = inferCycle([], 'amex', {
      today: '2026-08-01',
      override: { closingDay: 3, dueDay: 28, setAt: Date.now() },
    });
    eq('Override: closingDay is exactly what the user set', cycle.closingDay, 3);
    eq('Override: dueDay is exactly what the user set', cycle.dueDay, 28);
    eq('Override: source is user-override', cycle.source, 'user-override');
    eq('Override: confidence is high (it is the user\'s own stated fact)', cycle.closingDayConfidence, 'high');
  }

  // ===================================================================
  // 5. Current-cycle balance — excludes charges before close, includes ones
  //    after; projected additions only count series due before close.
  // ===================================================================
  {
    const cycle = inferCycle([], 'amex', { override: { closingDay: 20, dueDay: 15, setAt: 0 } });
    const window = currentCycleWindow(cycle, '2026-08-10');
    check('Fixture window computed', window !== null);
    if (window) {
      eq('Fixture window: cycleStartDate', window.cycleStartDate, '2026-07-20');
      eq('Fixture window: cycleCloseDate', window.cycleCloseDate, '2026-08-20');
      eq('Fixture window: paymentDueDate', window.paymentDueDate, '2026-09-15');
    }

    const txns: Txn[] = [
      mkTxn({ date: '2026-07-15', amountCents: 5000, account: 'amex' }), // BEFORE the cycle start -> excluded
      mkTxn({ date: '2026-07-25', amountCents: 3000, account: 'amex' }), // within cycle, before today -> included
      mkTxn({ date: '2026-08-05', amountCents: 4500, account: 'amex' }), // within cycle, before today -> included
      mkTxn({ date: '2026-08-03', amountCents: 9999, account: 'cba' }), // different account entirely -> excluded
    ];

    const recurring: RecurringSeries[] = [
      mkSeries({ id: 's1', merchant: 'Netflix', amountCents: 1450, accountId: 'amex', confirmed: true, nextDue: '2026-08-15' }), // > today, <= close -> included
      mkSeries({ id: 's2', merchant: 'Too far out', amountCents: 999, accountId: 'amex', nextDue: '2026-08-25' }), // > close -> excluded
      mkSeries({ id: 's3', merchant: 'Muted thing', amountCents: 500, accountId: 'amex', nextDue: '2026-08-14', muted: true }), // muted -> excluded
      mkSeries({ id: 's4', merchant: 'Wrong card', amountCents: 2000, accountId: 'cba', nextDue: '2026-08-14' }), // different account -> excluded
      mkSeries({ id: 's5', merchant: 'Due exactly today', amountCents: 300, accountId: 'amex', nextDue: '2026-08-10' }), // == today, not strictly after -> excluded (already-posted boundary)
      mkSeries({ id: 's6', merchant: 'Due tomorrow', amountCents: 300, accountId: 'amex', nextDue: '2026-08-11' }), // > today -> included
    ];

    const balance = computeCurrentCycleBalance(txns, recurring, 'amex', cycle, '2026-08-10');
    eq('Balance: status ok', balance.status, 'ok');
    eq('Balance: closedToDateCents excludes the pre-cycle charge, includes the two in-cycle ones', balance.closedToDateCents, 7500);
    eq('Balance: projectedAdditionalCents only counts series due before close, after today', balance.projectedAdditionalCents, 1750);
    eq('Balance: projectedTotalCents = closed + projected', balance.projectedTotalCents, 9250);
    eq('Balance: exactly 2 projected items counted', balance.projectedItems.length, 2);
    check('Balance: projected items are the right two (s1, s6)', balance.projectedItems.every((i) => i.seriesId === 's1' || i.seriesId === 's6'));

    // Staleness: last data point is 26 days old -> flagged, with the exact day count.
    const staleTxns: Txn[] = [mkTxn({ date: '2026-07-15', amountCents: 5000, account: 'amex' })];
    const staleBalance = computeCurrentCycleBalance(staleTxns, [], 'amex', cycle, '2026-08-10');
    eq('Staleness: daysSinceLastData computed exactly', staleBalance.daysSinceLastData, 26);
    check('Staleness: flagged stale past the threshold', staleBalance.stale);
    check('Staleness: note states the exact day count', staleBalance.note.includes('26'));

    // Freshness: a recent import is not flagged stale.
    const freshBalance = computeCurrentCycleBalance(txns, [], 'amex', cycle, '2026-08-10');
    check('Freshness: not stale when the last data point is only 5 days old', !freshBalance.stale);
    eq('Freshness: daysSinceLastData is 5', freshBalance.daysSinceLastData, 5);
  }

  // ===================================================================
  // 6. Upcoming / cashflow calendar.
  // ===================================================================
  {
    const today = '2026-08-01';
    const recurring: RecurringSeries[] = [
      mkSeries({ id: 'coffee', merchant: 'Coffee shop', amountCents: 550, cadence: 'weekly', nextDue: '2026-08-03' }),
      mkSeries({
        id: 'netflix-amex',
        merchant: 'Netflix',
        amountCents: 1450,
        cadence: 'monthly',
        nextDue: '2026-08-24',
        accountId: 'amex',
        confirmed: true,
      }),
      mkSeries({ id: 'muted-one', merchant: 'Should not appear', amountCents: 999, cadence: 'weekly', nextDue: '2026-08-03', muted: true }),
    ];

    const amexCycle = inferCycle([], 'amex', { override: { closingDay: 20, dueDay: 15, setAt: 0 } });
    const currentBalances = {
      amex: computeCurrentCycleBalance([], [], 'amex', amexCycle, today),
    };
    // Force a known projected total for the very next due date, independent of the empty txns above.
    currentBalances.amex = { ...currentBalances.amex, projectedTotalCents: 113100 };

    const summary = buildCashflowCalendar(
      recurring,
      { paydayDayOfMonth: 15, monthlyIncomeCents: 645_700, savingsTargetCents: 350_000, transferToSavingsDayOfMonth: 16 },
      { amex: amexCycle },
      currentBalances,
      { today, horizonDays: 60 }
    );

    eq('Cashflow: endDate is exactly 60 days after start', summary.endDate, addDays(today, 60));

    const coffeeEvents = summary.events.filter((e) => e.sourceId.startsWith('coffee::'));
    eq('Cashflow: weekly coffee projects 9 occurrences across 60 days', coffeeEvents.length, 9);
    check('Cashflow: every projected coffee event affects the running balance (no account link -> direct cash hit)', coffeeEvents.every((e) => e.affectsBalance));

    const netflixEvents = summary.events.filter((e) => e.sourceId.startsWith('netflix-amex::'));
    eq('Cashflow: card-linked Netflix projects 2 monthly occurrences', netflixEvents.length, 2);
    check('Cashflow: card-linked recurring charges do NOT directly hit the running balance (only the card payment does)', netflixEvents.every((e) => !e.affectsBalance));

    check('Cashflow: muted series contributes no events at all', !summary.events.some((e) => e.sourceId.startsWith('muted-one::')));

    const cardPayments = summary.events.filter((e) => e.kind === 'card-payment');
    eq('Cashflow: 2 Amex due dates fall within the 60-day horizon', cardPayments.length, 2);
    const firstDue = cardPayments.find((e) => e.date === '2026-08-15');
    check('Cashflow: first Amex due date found', !!firstDue);
    eq('Cashflow: first due date uses the real projected-cycle total', firstDue?.amountCents, 113100);
    eq('Cashflow: first due date is basis projected-cycle', firstDue?.amountBasis, 'projected-cycle');
    const secondDue = cardPayments.find((e) => e.date === '2026-09-15');
    check('Cashflow: second Amex due date found', !!secondDue);
    eq('Cashflow: second (further-out) due date falls back to the typical-monthly estimate', secondDue?.amountCents, 1450);
    eq('Cashflow: second due date is honestly labelled an estimate, not a real projection', secondDue?.amountBasis, 'typical-monthly-estimate');

    const salaryEvents = summary.events.filter((e) => e.kind === 'income');
    check('Cashflow: at least one salary event on/after the 15th', salaryEvents.some((e) => e.date === '2026-08-15'));
    eq('Cashflow: salary is cash IN (negative signed amount)', salaryEvents[0]?.amountCents, -645_700);

    const transferEvents = summary.events.filter((e) => e.kind === 'savings-transfer');
    check('Cashflow: savings transfer lands on the 16th', transferEvents.some((e) => e.date === '2026-08-16'));
    eq('Cashflow: savings transfer is cash OUT (positive signed amount)', transferEvents[0]?.amountCents, 350_000);

    // Running balance sign sanity: an income day should raise the running
    // balance, a spend/payment day should lower it.
    const beforeSalary = summary.events.filter((e) => e.date < '2026-08-15').slice(-1)[0];
    const salaryEvent = summary.events.find((e) => e.kind === 'income' && e.date === '2026-08-15');
    if (beforeSalary && salaryEvent) {
      check(
        'Cashflow: running balance goes UP on salary day, not down',
        salaryEvent.runningBalanceCents > beforeSalary.runningBalanceCents
      );
    }
  }

  // ===================================================================
  // 7. Squeeze detection — a running balance that goes negative is flagged;
  //    one that stays positive is not.
  // ===================================================================
  {
    const heavySpend: RecurringSeries[] = [
      mkSeries({ id: 'huge', merchant: 'Something huge', amountCents: 1_000_000, cadence: 'weekly', nextDue: '2026-08-01' }),
    ];
    const squeezed = buildCashflowCalendar(
      heavySpend,
      { paydayDayOfMonth: 15, monthlyIncomeCents: 0, savingsTargetCents: 0 },
      {},
      {},
      { today: '2026-08-01', horizonDays: 14, startingBalanceCents: 0 }
    );
    check('Squeeze: heavy recurring spend with no income triggers a squeeze warning', squeezed.squeezeWarning);
    check('Squeeze: lowest point is negative', squeezed.lowestPointCents < 0);

    const comfortable = buildCashflowCalendar(
      [],
      { paydayDayOfMonth: 15, monthlyIncomeCents: 645_700, savingsTargetCents: 0 },
      {},
      {},
      { today: '2026-08-01', horizonDays: 14, startingBalanceCents: 0 }
    );
    check('Comfortable: income-only window never dips below the starting balance', !comfortable.squeezeWarning);
    eq('Comfortable: lowest point equals the starting balance (never dips)', comfortable.lowestPointCents, 0);
  }

  // ===================================================================
  // 8. Confirmed recurring series are authoritative and durable — the
  //    "can recurring transactions be saved too" deliverable.
  // ===================================================================
  {
    // Three monthly occurrences of the same merchant -> a fresh detection.
    const initialTxns: Txn[] = [
      mkTxn({ date: '2026-05-05', amountCents: 1699, account: 'amex', merchant: 'Streamflix' }),
      mkTxn({ date: '2026-06-05', amountCents: 1699, account: 'amex', merchant: 'Streamflix' }),
      mkTxn({ date: '2026-07-05', amountCents: 1699, account: 'amex', merchant: 'Streamflix' }),
    ];
    const firstPass = detectRecurring(initialTxns, [], { today: '2026-07-06' });
    eq('Detection: exactly 1 series detected from the fixture', firstPass.length, 1);
    const detected = firstPass[0];
    eq('Detection: not confirmed yet', Boolean(detected.confirmed), false);
    eq('Detection: raw detected amount matches the transactions', detected.amountCents, 1699);

    // User confirms it, correcting the amount and linking it to a card.
    const confirmed = confirmSeries(detected, { amountCents: 1799, categoryId: 'cat-subscriptions', accountId: 'amex' }, 1_700_000_000_000);
    eq('Confirm: confirmed flag set', confirmed.confirmed, true);
    eq('Confirm: amount edit applied', confirmed.amountCents, 1799);
    eq('Confirm: account link applied', confirmed.accountId, 'amex');
    eq('Confirm: confirmedAt stamped', confirmed.confirmedAt, 1_700_000_000_000);

    const afterConfirm = replaceSeries(firstPass, confirmed);

    // A later pass, with a genuinely different (higher) charge posted, must
    // NOT silently overwrite the user's confirmed amount/account/category —
    // only txnIds/lastSeen should move.
    const laterTxns: Txn[] = [...initialTxns, mkTxn({ date: '2026-08-05', amountCents: 1899, account: 'amex', merchant: 'Streamflix' })];
    const secondPass = detectRecurring(laterTxns, afterConfirm, { today: '2026-08-06' });
    const stillThere = secondPass.find((s) => s.id === confirmed.id);
    check('Preservation: confirmed series still present after re-detection', !!stillThere);
    eq('Preservation: confirmed amount survives a differently-priced new transaction', stillThere?.amountCents, 1799);
    eq('Preservation: confirmed account link survives re-detection', stillThere?.accountId, 'amex');
    eq('Preservation: confirmed category survives re-detection', stillThere?.categoryId, 'cat-subscriptions');
    check('Preservation: lastSeen still moves forward with new data', stillThere?.lastSeen === '2026-08-05');
    check('Preservation: txnIds picked up the new transaction', (stillThere?.txnIds.length ?? 0) === 4);

    // The merchant stops appearing entirely in new history -> the confirmed
    // series must still not be dropped, and its stale nextDue rolls forward.
    const unrelatedTxns: Txn[] = [
      mkTxn({ date: '2026-09-01', amountCents: 4000, account: 'cba', merchant: 'Something else entirely' }),
      mkTxn({ date: '2026-09-08', amountCents: 4200, account: 'cba', merchant: 'Something else entirely' }),
      mkTxn({ date: '2026-09-15', amountCents: 3900, account: 'cba', merchant: 'Something else entirely' }),
    ];
    const staleConfirmed = { ...stillThere!, nextDue: '2026-08-05' };
    const thirdPass = detectRecurring(unrelatedTxns, replaceSeries(secondPass, staleConfirmed), { today: '2026-10-10' });
    const survivedDrop = thirdPass.find((s) => s.id === confirmed.id);
    check('Survival: confirmed series is NOT dropped even when its merchant vanishes from new history', !!survivedDrop);
    check('Survival: its stale nextDue rolled forward past today rather than staying frozen in the past', (survivedDrop?.nextDue ?? '') >= '2026-10-10');
    eq('Survival: amount/account/category are still untouched', survivedDrop?.amountCents, 1799);

    // Unconfirm reverts authority — a later pass is free to recompute again.
    const reverted = unconfirmSeries(confirmed);
    eq('Unconfirm: confirmed flag cleared', reverted.confirmed, false);
  }

  // ===================================================================
  // 9. Regression floor from the shared detection engine — still 3+
  //    occurrences required before anything is surfaced at all (this
  //    feature builds on that floor rather than loosening it).
  // ===================================================================
  {
    check('Detection floor unchanged at >= 3 occurrences', DEFAULT_OPTIONS.minOccurrences >= 3, `got ${DEFAULT_OPTIONS.minOccurrences}`);
  }

  // ===================================================================
  console.log(`\n--- ${passed} passed, ${failed} failed ---`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main();
