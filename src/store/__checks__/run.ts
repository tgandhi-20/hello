/**
 * Plain, node-runnable checks for pure store-adjacent logic that doesn't need
 * IndexedDB/WebCrypto (see categoryDeletion.ts's doc comment for why this is split
 * out). Run with: `npx tsx src/store/__checks__/run.ts`
 *
 * Never logs a transaction, amount, or merchant — fixtures below are synthetic.
 */
import { planCategoryDeletion, resolveFallbackCategoryId } from '../categoryDeletion';
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
