/**
 * Plain, node-runnable checks for the weekly-review flow's pure logic (no test
 * framework is installed). Run with: `npx tsx src/features/review/__checks__/run.ts`
 *
 * Never logs a transaction, amount, or merchant — fixtures below are synthetic.
 */
import { otherCategoryId, uncategorisedTxns, unconfirmedRecurring } from '../selectors';
import { resolveInitialStep, nextStep, previousStep, makeBookmark, REVIEW_STEP_ORDER } from '../state';
import type { Category, RecurringSeries, Txn, WeeklyReviewBookmark } from '../../../types';

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

function mkCategory(id: string, label: string): Category {
  return { id, label, icon: 'Circle', colorToken: 'cat-1', kind: 'want', builtin: true, order: 0 };
}

function mkTxn(id: string, categoryId: string, opts: Partial<Txn> = {}): Txn {
  return {
    id,
    date: '2026-08-01',
    amountCents: 1000,
    description: 'test',
    merchant: 'Test Merchant',
    categoryId,
    account: 'cash',
    source: 'csv',
    hash: `hash-${id}`,
    createdAt: 0,
    updatedAt: 0,
    ...opts,
  };
}

function mkSeries(id: string, opts: Partial<RecurringSeries> = {}): RecurringSeries {
  return {
    id,
    merchant: 'Some Merchant',
    categoryId: 'cat-subscriptions',
    cadence: 'monthly',
    amountCents: 999,
    lastSeen: '2026-08-01',
    nextDue: '2026-09-01',
    txnIds: [],
    ...opts,
  };
}

async function main(): Promise<void> {
  console.log('--- Tally weekly-review checks ---\n');

  // ===================================================================
  // 1. otherCategoryId — the frozen cat-other id wins; falls back to a label
  //    match if a vault's category set doesn't carry that exact id.
  // ===================================================================
  {
    const categories = [mkCategory('cat-groceries', 'Groceries'), mkCategory('cat-other', 'Other')];
    eq('otherCategoryId finds the frozen cat-other id', otherCategoryId(categories), 'cat-other');

    const relabelled = [mkCategory('cat-groceries', 'Groceries'), mkCategory('cat-99', 'Uncategorised')];
    eq('otherCategoryId falls back to a label match when the frozen id is absent', otherCategoryId(relabelled), 'cat-99');

    const none = [mkCategory('cat-groceries', 'Groceries')];
    eq('otherCategoryId is null when no catch-all category exists at all', otherCategoryId(none), null);
  }

  // ===================================================================
  // 2. uncategorisedTxns — the queue the weekly review's step 2 is built on.
  // ===================================================================
  {
    const categories = [mkCategory('cat-groceries', 'Groceries'), mkCategory('cat-other', 'Other')];
    const txns = [
      mkTxn('t1', 'cat-groceries'),
      mkTxn('t2', 'cat-other'),
      mkTxn('t3', 'cat-other'),
      mkTxn('t4', 'cat-other', { excluded: true }), // excluded — deliberately out of scope
    ];
    const queue = uncategorisedTxns(txns, categories);
    eq('uncategorisedTxns: only the two non-excluded Other-category txns', queue.map((t) => t.id), ['t2', 't3']);
    check('uncategorisedTxns: a genuinely-categorised (Groceries) txn is never in the queue', !queue.some((t) => t.id === 't1'));
    check('uncategorisedTxns: an excluded Other-category txn is never in the queue', !queue.some((t) => t.id === 't4'));

    eq('uncategorisedTxns: empty when nothing is in Other', uncategorisedTxns([mkTxn('t1', 'cat-groceries')], categories), []);
    eq('uncategorisedTxns: empty (never throws) when the vault has no Other category at all', uncategorisedTxns(txns, [mkCategory('cat-groceries', 'Groceries')]), []);
    eq('uncategorisedTxns: empty on an empty transaction list', uncategorisedTxns([], categories), []);
  }

  // ===================================================================
  // 3. unconfirmedRecurring — series needing a confirm/dismiss decision.
  // ===================================================================
  {
    const confirmed = mkSeries('s1', { confirmed: true });
    const muted = mkSeries('s2', { muted: true });
    const untouched1 = mkSeries('s3');
    const untouched2 = mkSeries('s4', { confirmed: false, muted: false });

    const result = unconfirmedRecurring([confirmed, muted, untouched1, untouched2]);
    eq('unconfirmedRecurring: only the two neither-confirmed-nor-muted series', result.map((s) => s.id), ['s3', 's4']);
    check('unconfirmedRecurring: a confirmed series is never flagged', !result.some((s) => s.id === 's1'));
    check('unconfirmedRecurring: a muted (dismissed) series is never flagged', !result.some((s) => s.id === 's2'));
    eq('unconfirmedRecurring: empty on an empty list', unconfirmedRecurring([]), []);
  }

  // ===================================================================
  // 4. resolveInitialStep — bookmark + live-data resolution, the resumability
  //    contract the review flow is built on.
  // ===================================================================
  {
    // Never used before: no bookmark at all -> always starts at 'import', even
    // if there happens to be nothing outstanding elsewhere.
    const noWork = { uncategorisedCount: 0, unconfirmedRecurringCount: 0, amexPaid: true };
    eq('No bookmark: starts at import even with nothing else outstanding', resolveInitialStep(undefined, '2026-08-01', noWork), 'import');

    // Bookmarked at 'import' from earlier this month: stays at import — never
    // auto-skipped, always a deliberate step.
    const importBookmark: WeeklyReviewBookmark = { month: '2026-08', step: 'import' };
    eq("Bookmarked at 'import': stays there even with nothing outstanding", resolveInitialStep(importBookmark, '2026-08-15', noWork), 'import');

    // Bookmarked at 'categorise', but categorisation is now clear and recurring
    // still has 2 unconfirmed: skips forward to 'recurring'.
    const categoriseBookmark: WeeklyReviewBookmark = { month: '2026-08', step: 'categorise' };
    const someRecurring = { uncategorisedCount: 0, unconfirmedRecurringCount: 2, amexPaid: false };
    eq(
      'Bookmarked at categorise, now clear: skips forward to recurring',
      resolveInitialStep(categoriseBookmark, '2026-08-15', someRecurring),
      'recurring'
    );

    // Bookmarked at 'categorise', and there's STILL uncategorised work: stays put.
    const stillUncategorised = { uncategorisedCount: 3, unconfirmedRecurringCount: 0, amexPaid: true };
    eq(
      'Bookmarked at categorise, still work to do: stays at categorise',
      resolveInitialStep(categoriseBookmark, '2026-08-15', stillUncategorised),
      'categorise'
    );

    // Bookmarked at 'amex', not yet paid: stays at amex.
    const amexBookmark: WeeklyReviewBookmark = { month: '2026-08', step: 'amex' };
    const amexUnpaid = { uncategorisedCount: 0, unconfirmedRecurringCount: 0, amexPaid: false };
    eq('Bookmarked at amex, unpaid: stays at amex', resolveInitialStep(amexBookmark, '2026-08-20', amexUnpaid), 'amex');

    // Bookmarked at 'amex', now paid, everything else clear: resolves to 'done'.
    eq('Bookmarked at amex, now clear: resolves to done', resolveInitialStep(amexBookmark, '2026-08-20', noWork), 'done');

    // A bookmark from a DIFFERENT (earlier) month is stale — a new month always
    // starts fresh at 'import', regardless of what it says.
    const staleBookmark: WeeklyReviewBookmark = { month: '2026-07', step: 'done' };
    eq(
      "A bookmark from last month is stale: new month starts fresh at 'import'",
      resolveInitialStep(staleBookmark, '2026-08-01', noWork),
      'import'
    );
  }

  // ===================================================================
  // 5. Step order helpers.
  // ===================================================================
  {
    eq('REVIEW_STEP_ORDER has exactly 5 steps', REVIEW_STEP_ORDER.length, 5);
    eq('nextStep(import) is categorise', nextStep('import'), 'categorise');
    eq('nextStep(done) clamps at done (no overflow)', nextStep('done'), 'done');
    eq('previousStep(categorise) is import', previousStep('categorise'), 'import');
    eq('previousStep(import) clamps at import (no underflow)', previousStep('import'), 'import');
    eq('makeBookmark stamps the current month', makeBookmark('recurring', '2026-08-15'), { month: '2026-08', step: 'recurring' });
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
