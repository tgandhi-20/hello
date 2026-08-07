/**
 * Plain, node-runnable checks for pure store-adjacent logic that doesn't need
 * IndexedDB/WebCrypto (see categoryDeletion.ts's doc comment for why this is split
 * out). Run with: `npx tsx src/store/__checks__/run.ts`
 *
 * Never logs a transaction, amount, or merchant — fixtures below are synthetic.
 */
import { planCategoryDeletion, resolveFallbackCategoryId } from '../categoryDeletion';
import { decryptBatch } from '../decryptBatch';
import { withVaultLock } from '../vaultLock';
import { assertValidBackupPayload } from '../../data/backup';
import { MAX_AMOUNT_CENTS, clampAmountCents } from '../../features/log/amountLimits';
import type { Budget, Category, Txn } from '../../types';

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

function mkTxn(id: string, categoryId: string): Txn {
  return {
    id,
    date: '2026-08-01',
    amountCents: 1000,
    description: 'test',
    merchant: 'Test Merchant',
    categoryId,
    account: 'cash',
    source: 'manual',
    hash: `hash-${id}`,
    createdAt: 0,
    updatedAt: 0,
  };
}

function mkCategory(id: string, builtin: boolean): Category {
  return { id, label: id, icon: 'Circle', colorToken: 'cat-1', kind: 'want', builtin, order: 0 };
}

async function main(): Promise<void> {
  console.log('--- Tally store checks ---\n');

  // ===================================================================
  // 1. Deleting a category reassigns its transactions and removes its budgets
  //    (CONTRACTS.md §9 deleteCategory — orphaned data / padded budget totals fix).
  // ===================================================================
  {
    const txns: Txn[] = [
      mkTxn('t1', 'cat-custom'),
      mkTxn('t2', 'cat-custom'),
      mkTxn('t3', 'cat-groceries'),
    ];
    const budgets: Budget[] = [
      { categoryId: 'cat-custom', month: '2026-08', limitCents: 20000 },
      { categoryId: 'cat-custom', month: '2026-07', limitCents: 15000 },
      { categoryId: 'cat-groceries', month: '2026-08', limitCents: 50000 },
    ];

    const plan = planCategoryDeletion(txns, budgets, 'cat-custom', 'cat-other', 999);

    eq('deleteCategory: 2 txns reassigned', plan.changedTxns.length, 2);
    check(
      'deleteCategory: reassigned txns now point at the fallback category',
      plan.changedTxns.every((t) => t.categoryId === 'cat-other')
    );
    check(
      'deleteCategory: unrelated txn (t3) untouched',
      plan.txns.find((t) => t.id === 't3')!.categoryId === 'cat-groceries'
    );
    check(
      'deleteCategory: no txn is left pointing at the deleted category',
      plan.txns.every((t) => t.categoryId !== 'cat-custom')
    );
    eq('deleteCategory: 2 budget rows removed (both months)', plan.removedBudgetKeys.length, 2);
    check(
      'deleteCategory: unrelated budget (groceries) untouched',
      plan.budgets.some((b) => b.categoryId === 'cat-groceries' && b.month === '2026-08')
    );
    check(
      'deleteCategory: no budget row is left for the deleted category',
      plan.budgets.every((b) => b.categoryId !== 'cat-custom')
    );

    console.log(
      `  deleteCategory('cat-custom'): reassigned ${plan.changedTxns.length} txn(s), removed ${plan.removedBudgetKeys.length} budget row(s)`
    );
  }

  // ===================================================================
  // 2. Fallback resolution prefers the built-in "Other" category
  // ===================================================================
  {
    const categories = [mkCategory('cat-other', true), mkCategory('cat-custom', false)];
    eq('resolveFallbackCategoryId: prefers cat-other', resolveFallbackCategoryId(categories, 'cat-custom'), 'cat-other');

    const withoutOther = [mkCategory('cat-rent', true), mkCategory('cat-custom', false)];
    eq(
      'resolveFallbackCategoryId: falls back to any other builtin if cat-other is missing',
      resolveFallbackCategoryId(withoutOther, 'cat-custom'),
      'cat-rent'
    );

    const onlyTheDeletedOne = [mkCategory('cat-custom', false)];
    eq(
      'resolveFallbackCategoryId: null when nothing else to reassign to',
      resolveFallbackCategoryId(onlyTheDeletedOne, 'cat-custom'),
      null
    );
  }

  // ===================================================================
  // 3. Deleting a category with nothing pointing at it is a clean no-op plan
  // ===================================================================
  {
    const txns: Txn[] = [mkTxn('t1', 'cat-groceries')];
    const budgets: Budget[] = [{ categoryId: 'cat-groceries', month: '2026-08', limitCents: 50000 }];
    const plan = planCategoryDeletion(txns, budgets, 'cat-unused', 'cat-other', 1);
    eq('deleteCategory (unused category): 0 txns changed', plan.changedTxns.length, 0);
    eq('deleteCategory (unused category): 0 budgets removed', plan.removedBudgetKeys.length, 0);
    eq('deleteCategory (unused category): txns array unaffected', plan.txns, txns);
    eq('deleteCategory (unused category): budgets array unaffected', plan.budgets, budgets);
  }

  // ===================================================================
  // 4. P0 fix: decryptBatch — one bad record must not fail a whole hydrate.
  //    See src/store/decryptBatch.ts's doc comment for the bug this closes:
  //    a bare `Promise.all` used to reject on the FIRST unreadable record,
  //    bricking the entire unlock. `decryptBatch` must decrypt everything
  //    it can and only COUNT what it can't.
  // ===================================================================
  {
    const records = ['ok-1', 'bad-1', 'ok-2', 'bad-2', 'ok-3'];
    const result = await decryptBatch(records, async (r) => {
      if (r.startsWith('bad')) throw new Error('simulated corrupt ciphertext');
      return r.toUpperCase();
    });
    eq('decryptBatch: keeps every record that decrypts cleanly', result.items.length, 3);
    eq('decryptBatch: counts (never throws on) records that fail to decrypt', result.skipped, 2);
    check(
      'decryptBatch: a failed record never appears in items',
      result.items.every((v) => v.startsWith('OK'))
    );
  }
  {
    // The scenario named explicitly in the incident report: a vault with 1
    // bad record out of 3,000 must still open with 2,999 intact.
    const records = Array.from({ length: 3000 }, (_, i) => i);
    const result = await decryptBatch(records, async (i) => {
      if (i === 1234) throw new Error('simulated corrupt ciphertext');
      return i;
    });
    eq('decryptBatch: 2,999 of 3,000 records hydrate when exactly 1 is corrupt', result.items.length, 2999);
    eq('decryptBatch: the 1 corrupt record is counted, not silently dropped', result.skipped, 1);
  }
  {
    // A store with nothing wrong in it reports zero skipped, unconditionally
    // — the skipped-record toast (LockScreen.tsx's LockGate) must never fire
    // on a clean vault.
    const result = await decryptBatch([1, 2, 3], async (i) => i * 10);
    eq('decryptBatch: a fully clean batch reports 0 skipped', result.skipped, 0);
    eq('decryptBatch: a fully clean batch keeps every record', result.items.length, 3);
  }

  // ===================================================================
  // 5. P0 fix: the vault-wide write lock actually serialises concurrent
  //    writes — see src/store/vaultLock.ts's doc comment. This reproduces
  //    the exact shape of the bug: a slow "rotation" (stand-in for
  //    setUnlockSecret's 600k-iteration PBKDF2 + re-encrypt) that only
  //    flips a shared "key" at the very end, racing a "mutation" (stand-in
  //    for addTxn) fired mid-rotation. Before the fix, the mutation could
  //    write under the OLD key and be orphaned once the key flipped; after
  //    the fix, it must queue and always see the NEW key.
  // ===================================================================
  {
    const log: string[] = [];
    let currentKey = 'old-key';

    const rotation = withVaultLock(async () => {
      log.push('rotation:start');
      await new Promise((r) => setTimeout(r, 30));
      currentKey = 'new-key';
      log.push('rotation:end');
    });

    // Give the rotation a head start, then fire a "concurrent" mutation —
    // through the SAME lock, exactly like addTxn/updateTxn/etc. now do.
    await new Promise((r) => setTimeout(r, 5));
    let keyMutationWroteUnder: string | null = null;
    const mutation = withVaultLock(async () => {
      log.push('mutation:write');
      keyMutationWroteUnder = currentKey;
    });

    await Promise.all([rotation, mutation]);

    eq('vaultLock: a rotation fully completes before a mutation queued mid-rotation runs', log, [
      'rotation:start',
      'rotation:end',
      'mutation:write',
    ]);
    eq(
      'vaultLock: a mutation attempted during a rotation lands under the NEW key — never orphaned under the old one',
      keyMutationWroteUnder,
      'new-key'
    );
  }
  {
    // Several concurrent callers must run strictly one at a time, in the
    // order they called withVaultLock — not interleaved.
    const order: number[] = [];
    const ops = [1, 2, 3, 4, 5].map((n) =>
      withVaultLock(async () => {
        await new Promise((r) => setTimeout(r, (5 - n) * 3));
        order.push(n);
      })
    );
    await Promise.all(ops);
    eq('vaultLock: concurrent callers run strictly one at a time, in request order', order, [1, 2, 3, 4, 5]);
  }
  {
    // A failed operation must reject to its OWN caller but never wedge the
    // queue for whatever was requested after it.
    let ranAfterFailure = false;
    const failing = withVaultLock(async () => {
      throw new Error('simulated failure mid-operation');
    });
    const after = withVaultLock(async () => {
      ranAfterFailure = true;
    });
    let failingThrew = false;
    try {
      await failing;
    } catch {
      failingThrew = true;
    }
    await after;
    check('vaultLock: a failing operation still rejects to its own caller', failingThrew);
    check('vaultLock: a failing operation does not block the next queued operation', ranAfterFailure);
  }

  // ===================================================================
  // 6. P0 fix: backup-restore validation runs, and rejects, before any
  //    destructive step. `importBackup` (useStore.ts) calls this exact
  //    function immediately after decrypting the payload and BEFORE
  //    `clearAllData()` — see its doc comment. These checks pin down that
  //    the gate itself actually rejects every malformed shape it claims to.
  // ===================================================================
  {
    const valid = {
      txns: [{ id: 't1', date: '2026-08-01', amountCents: 500 }],
      categories: [{ id: 'c1', label: 'Coffee' }],
      budgets: [],
      rules: [],
      recurring: [],
      settings: {},
    };
    let threw = false;
    try {
      assertValidBackupPayload(valid);
    } catch {
      threw = true;
    }
    check('assertValidBackupPayload: accepts a well-shaped payload', !threw);
  }
  {
    // Missing `recurring` array entirely.
    const missingArray = { txns: [], categories: [], budgets: [], rules: [], settings: {} };
    let threw = false;
    try {
      assertValidBackupPayload(missingArray);
    } catch {
      threw = true;
    }
    check('assertValidBackupPayload: rejects a payload missing a required array field', threw);
  }
  {
    const badTxnShape = {
      txns: [{ id: 't1', date: '2026-08-01' /* amountCents missing */ }],
      categories: [],
      budgets: [],
      rules: [],
      recurring: [],
      settings: {},
    };
    let threw = false;
    try {
      assertValidBackupPayload(badTxnShape);
    } catch {
      threw = true;
    }
    check('assertValidBackupPayload: rejects a txn record missing amountCents', threw);
  }
  {
    let threw = false;
    try {
      assertValidBackupPayload(null);
    } catch {
      threw = true;
    }
    check('assertValidBackupPayload: rejects a non-object payload outright', threw);
  }
  {
    let threw = false;
    try {
      assertValidBackupPayload({
        txns: [],
        categories: [],
        budgets: [],
        rules: [],
        recurring: [],
        settings: 'not-an-object',
      });
    } catch {
      threw = true;
    }
    check('assertValidBackupPayload: rejects a non-object settings field', threw);
  }

  // ===================================================================
  // 7. P2 fix: budget cap has the same upper bound as the quick-add
  //    keypad — see BudgetRow.tsx and features/log/amountLimits.ts.
  // ===================================================================
  {
    eq('clampAmountCents: MAX_AMOUNT_CENTS matches the quick-add keypad ceiling ($999,999.99)', MAX_AMOUNT_CENTS, 99_999_999);
    eq('clampAmountCents: passes an ordinary amount through unchanged', clampAmountCents(4_444), 4_444);
    eq('clampAmountCents: a value exactly at the ceiling is unchanged', clampAmountCents(MAX_AMOUNT_CENTS), MAX_AMOUNT_CENTS);
    eq(
      'clampAmountCents: 30 nines (the reported repro) clamps down to the ceiling, not a >10^30 figure',
      clampAmountCents(999_999_999_999_999_999_999_999_999_999),
      MAX_AMOUNT_CENTS
    );
    eq('clampAmountCents: a negative amount clamps to 0', clampAmountCents(-500), 0);
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
