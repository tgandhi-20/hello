/**
 * Plain, node-runnable checks for src/data/** pure logic (no test framework is
 * installed). Run with: `npx tsx src/data/__checks__/run.ts`
 *
 * Never logs a transaction, amount, or merchant — fixtures below are synthetic.
 */
import { migrateTxnAccounts, isValidAccountId, ACCOUNT_IDS, FALLBACK_ACCOUNT_ID } from '../accountMigration';
import type { Txn } from '../../types';

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

function mkTxn(id: string, account: string): Txn {
  return {
    id,
    date: '2026-08-01',
    amountCents: 1000,
    description: 'test',
    merchant: 'Test Merchant',
    categoryId: 'cat-other',
    account: account as Txn['account'],
    source: 'manual',
    hash: `hash-${id}`,
    createdAt: 0,
    updatedAt: 0,
  };
}

async function main(): Promise<void> {
  console.log('--- Tally data-layer checks ---\n');

  // ===================================================================
  // 1. isValidAccountId — the full post-split set, plus rejection of garbage.
  // ===================================================================
  {
    eq('ACCOUNT_IDS has exactly 5 members post-split', ACCOUNT_IDS.length, 5);
    check("isValidAccountId('cba') is true (everyday account, unchanged)", isValidAccountId('cba'));
    check("isValidAccountId('cba-card') is true (new split-out value)", isValidAccountId('cba-card'));
    check("isValidAccountId('bankwest') is true", isValidAccountId('bankwest'));
    check("isValidAccountId('amex') is true", isValidAccountId('amex'));
    check("isValidAccountId('cash') is true", isValidAccountId('cash'));
    check("isValidAccountId('cba-savings') is false (not a real account id)", !isValidAccountId('cba-savings'));
    check('isValidAccountId(undefined) is false', !isValidAccountId(undefined));
    check('isValidAccountId(null) is false', !isValidAccountId(null));
    check('isValidAccountId(42) is false', !isValidAccountId(42));
    check("isValidAccountId('') is false", !isValidAccountId(''));
  }

  // ===================================================================
  // 2. migrateTxnAccounts: the split itself is a pure no-op on valid data —
  //    every existing 'cba' row survives untouched, by the SAME reference,
  //    proving nothing was mutated or relabelled.
  // ===================================================================
  {
    const txns = [mkTxn('t1', 'cba'), mkTxn('t2', 'bankwest'), mkTxn('t3', 'amex'), mkTxn('t4', 'cash')];
    const result = migrateTxnAccounts(txns);

    eq('migrateTxnAccounts: no transaction is dropped', result.txns.length, txns.length);
    eq('migrateTxnAccounts: valid data needs zero repairs', result.migratedCount, 0);
    eq('migrateTxnAccounts: changedIds is empty for valid data', result.changedIds, []);
    check(
      "migrateTxnAccounts: every 'cba' row keeps its account value ('cba' still means everyday)",
      result.txns.every((t, i) => t.account === txns[i].account)
    );
    check(
      'migrateTxnAccounts: valid rows are returned by the SAME object reference (proves no mutation)',
      result.txns.every((t, i) => t === txns[i])
    );
  }

  // ===================================================================
  // 3. migrateTxnAccounts: a fresh 'cba-card' row is already valid — the
  //    split introduces it without needing any migration step to "allow" it.
  // ===================================================================
  {
    const txns = [mkTxn('t1', 'cba'), mkTxn('t2', 'cba-card')];
    const result = migrateTxnAccounts(txns);
    eq('A cba-card transaction passes through untouched', result.migratedCount, 0);
    eq("t2's account is still 'cba-card'", result.txns[1].account, 'cba-card');
  }

  // ===================================================================
  // 4. migrateTxnAccounts: a corrupt/foreign account value is repaired, never
  //    dropped — the transaction survives with every other field intact.
  // ===================================================================
  {
    const good = mkTxn('t1', 'cba');
    const bad = mkTxn('t2', 'westpac'); // not a real Tally account id
    const result = migrateTxnAccounts([good, bad]);

    eq('migrateTxnAccounts: the corrupt row is NOT dropped', result.txns.length, 2);
    eq('migrateTxnAccounts: exactly 1 row needed repair', result.migratedCount, 1);
    eq('migrateTxnAccounts: changedIds names the repaired transaction', result.changedIds, ['t2']);
    eq('migrateTxnAccounts: the repaired row defaults to the fallback account', result.txns[1].account, FALLBACK_ACCOUNT_ID);
    eq('migrateTxnAccounts: the repaired row keeps its id', result.txns[1].id, 't2');
    eq('migrateTxnAccounts: the repaired row keeps its amount (never mangled)', result.txns[1].amountCents, bad.amountCents);
    eq('migrateTxnAccounts: the repaired row keeps its merchant (never mangled)', result.txns[1].merchant, bad.merchant);
    eq("migrateTxnAccounts: the untouched good row is unaffected", result.txns[0], good);
  }

  // ===================================================================
  // 5. migrateTxnAccounts: an empty batch is a clean no-op.
  // ===================================================================
  {
    const result = migrateTxnAccounts([]);
    eq('migrateTxnAccounts([]): no transactions', result.txns.length, 0);
    eq('migrateTxnAccounts([]): zero migrated', result.migratedCount, 0);
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
