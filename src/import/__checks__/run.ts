/**
 * Plain, node-runnable checks for the import pipeline (no test framework is installed).
 * Run with: `npx tsx src/import/__checks__/run.ts`
 *
 * Never logs a transaction, amount, or merchant beyond the small, synthetic sample
 * fixtures under docs/samples/*.example.csv — those are fabricated data, not real
 * financial records.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Category } from '../../types';
import { parseMoneyToCents } from '../money';
import { tryParseDate } from '../dates';
import { parseAuDate } from '../../ui/format';
import { analyzeCsv, buildImportPreview, buildManualLayout } from '../parse';
import { parseRawCsv } from '../csv';
import { existingHashSet } from '../dedupe';
import { computeTxnHash } from '../hash';
import { categorizeDescription } from '../../categorize';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(__dirname, '../../../docs/samples');

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

function readSample(name: string): string {
  return readFileSync(join(SAMPLES_DIR, name), 'utf8');
}

// A stub category list standing in for whatever Agent 2's store seeds at runtime —
// categorize.ts resolves dictionary labels against this shape, never a hardcoded id.
function stubCategories(): Category[] {
  const labels = [
    'Coffee', 'Lunch', 'Dining Out', 'Groceries', 'Shopping', 'Health', 'Alcohol',
    'Transport', 'Fuel', 'Bills', 'Utilities', 'Subscriptions', 'Rent', 'Housing',
    'Fitness', 'Insurance', 'Income', 'Other',
  ];
  return labels.map((label, i) => ({
    id: `cat-${label.toLowerCase().replace(/\s+/g, '-')}`,
    label,
    icon: 'Circle',
    colorToken: `cat-${(i % 12) + 1}`,
    kind: 'want' as const,
    builtin: true,
    order: i,
  }));
}

async function main(): Promise<void> {
  console.log('--- Tally import checks ---\n');

  // ===================================================================
  // 1. Exact integer-cents money parsing
  // ===================================================================
  eq('parseMoneyToCents("$1,234.56")', parseMoneyToCents('$1,234.56'), 123456);
  eq('parseMoneyToCents("(45.00)")', parseMoneyToCents('(45.00)'), -4500);
  eq('parseMoneyToCents("-$5")', parseMoneyToCents('-$5'), -500);
  eq('parseMoneyToCents("45.00-")', parseMoneyToCents('45.00-'), -4500);
  eq('parseMoneyToCents("1234")', parseMoneyToCents('1234'), 123400);
  eq('parseMoneyToCents(".56")', parseMoneyToCents('.56'), 56);
  eq('parseMoneyToCents("AUD 45.00")', parseMoneyToCents('AUD 45.00'), 4500);
  eq('parseMoneyToCents("$-5.00")', parseMoneyToCents('$-5.00'), -500);
  eq('parseMoneyToCents(reference code) rejected', parseMoneyToCents('REF00981239'), null);
  eq('parseMoneyToCents(merchant text) rejected', parseMoneyToCents('WOOLWORTHS 2456'), null);

  // ===================================================================
  // 2. DD/MM vs MM/DD is never confused (Australian day-first order)
  // ===================================================================
  eq('tryParseDate("05/08/2026") -> 5 Aug, not 8 May', tryParseDate('05/08/2026'), '2026-08-05');
  eq('tryParseDate("13/02/2026") -> unambiguous day>12', tryParseDate('13/02/2026'), '2026-02-13');
  eq('tryParseDate("01/12/2026") -> 1 Dec, not 12 Jan', tryParseDate('01/12/2026'), '2026-12-01');
  eq('parseAuDate("03/08/26") two-digit year pivot', parseAuDate('03/08/26'), '2026-08-03');

  // ===================================================================
  // 3. CBA headerless, single signed Amount column, balance present
  // ===================================================================
  {
    const text = readSample('cba-headerless-signed.example.csv');
    const analysis = analyzeCsv(text);
    eq('CBA headerless: hasHeader', analysis.layout.hasHeader, false);
    eq('CBA headerless: dateCol', analysis.layout.dateCol, 0);
    eq('CBA headerless: amountCol', analysis.layout.amountCol, 1);
    eq('CBA headerless: descriptionCol', analysis.layout.descriptionCol, 2);
    eq('CBA headerless: balanceCol', analysis.layout.balanceCol, 3);
    eq('CBA headerless: detected format', analysis.formatDetection.format, 'cba');
    eq('CBA headerless: sign method', analysis.signAnalysis.method, 'balance-verified');
    eq('CBA headerless: signInverted', analysis.signAnalysis.signInverted, false);
    check('CBA headerless: sign confidence high', analysis.signAnalysis.confidence >= 0.9, `got ${analysis.signAnalysis.confidence}`);

    const preview = await buildImportPreview(analysis.layout, {
      account: 'cba',
      detectedFormat: analysis.formatDetection.format,
      signInverted: analysis.signAnalysis.signInverted,
      rules: [],
      categories: stubCategories(),
      existingHashes: new Set(),
    });
    eq('CBA headerless: 10 rows parsed', preview.rows.length, 10);
    eq('CBA headerless: 0 duplicates on first import', preview.duplicateCount, 0);

    const gloriaJeans = preview.rows.find((r) => r.merchant === "Gloria Jean's");
    check('CBA headerless: Gloria Jean\'s found', !!gloriaJeans);
    eq('CBA headerless: coffee $4.50 spend -> +450c', gloriaJeans?.amountCents, 450);

    const salary = preview.rows.find((r) => r.description.includes('SALARY'));
    check('CBA headerless: salary row found', !!salary);
    eq('CBA headerless: salary $1500 income -> -150000c', salary?.amountCents, -150000);

    const bunnings = preview.rows.find((r) => r.merchant === 'Bunnings');
    eq('CBA headerless: Bunnings categorised as Shopping', bunnings?.categoryId, 'cat-shopping');

    const woolies = preview.rows.filter((r) => r.merchant === 'Woolworths');
    eq('CBA headerless: 2 Woolworths rows categorised as Groceries', woolies.filter((r) => r.categoryId === 'cat-groceries').length, 2);

    // ---- dedupe: re-importing the same statement must not double-count ----
    const existing = existingHashSet(preview.rows);
    const secondPass = await buildImportPreview(analysis.layout, {
      account: 'cba',
      detectedFormat: analysis.formatDetection.format,
      signInverted: analysis.signAnalysis.signInverted,
      rules: [],
      categories: stubCategories(),
      existingHashes: existing,
    });
    eq('CBA headerless: re-import yields 0 new rows', secondPass.rows.length, 0);
    eq('CBA headerless: re-import reports all 10 as duplicates', secondPass.duplicateCount, 10);
  }

  // ===================================================================
  // 4. CBA headered Debit/Credit variant, parens-negative and $ thousands
  // ===================================================================
  {
    const text = readSample('cba-headered-debit-credit.example.csv');
    const analysis = analyzeCsv(text);
    eq('CBA debit/credit: hasHeader', analysis.layout.hasHeader, true);
    check('CBA debit/credit: debit+credit cols found', analysis.layout.debitCol !== null && analysis.layout.creditCol !== null);
    check('CBA debit/credit: balance col found', analysis.layout.balanceCol !== null);
    eq('CBA debit/credit: sign method', analysis.signAnalysis.method, 'balance-verified');
    eq('CBA debit/credit: signInverted', analysis.signAnalysis.signInverted, false);

    const preview = await buildImportPreview(analysis.layout, {
      account: 'cba',
      detectedFormat: analysis.formatDetection.format,
      signInverted: analysis.signAnalysis.signInverted,
      rules: [],
      categories: stubCategories(),
      existingHashes: new Set(),
    });
    eq('CBA debit/credit: 8 rows parsed', preview.rows.length, 8);

    const bunnings = preview.rows.find((r) => r.description.startsWith('BUNNINGS'));
    eq('CBA debit/credit: parens "(230.00)" debit -> +23000c spend', bunnings?.amountCents, 23000);

    const jbhifi = preview.rows.find((r) => r.merchant === 'JB Hi-Fi');
    eq('CBA debit/credit: "$1,234.56" debit -> +123456c spend', jbhifi?.amountCents, 123456);

    const salary = preview.rows.find((r) => r.description.startsWith('SALARY'));
    eq('CBA debit/credit: $2500.00 credit -> -250000c income', salary?.amountCents, -250000);
  }

  // ===================================================================
  // 5. Bankwest debit/credit, BSB header hint
  // ===================================================================
  {
    const text = readSample('bankwest-debit-credit.example.csv');
    const analysis = analyzeCsv(text);
    eq('Bankwest: detected format', analysis.formatDetection.format, 'bankwest');
    eq('Bankwest: sign method', analysis.signAnalysis.method, 'balance-verified');
    eq('Bankwest: signInverted', analysis.signAnalysis.signInverted, false);

    const preview = await buildImportPreview(analysis.layout, {
      account: 'bankwest',
      detectedFormat: analysis.formatDetection.format,
      signInverted: analysis.signAnalysis.signInverted,
      rules: [],
      categories: stubCategories(),
      existingHashes: new Set(),
    });
    eq('Bankwest: 8 rows parsed', preview.rows.length, 8);

    const rent = preview.rows.find((r) => r.description.includes('RENT'));
    eq('Bankwest: rent $650 debit -> +65000c spend', rent?.amountCents, 65000);
    eq('Bankwest: rent categorised', rent?.categoryId, 'cat-rent');

    const wage = preview.rows.find((r) => r.description.includes('WAGE'));
    eq('Bankwest: wage $1800 credit -> -180000c income', wage?.amountCents, -180000);
  }

  // ===================================================================
  // 6. Amex — sign is INVERTED vs the banks (positive = spend)
  // ===================================================================
  {
    const text = readSample('amex-inverted.example.csv');
    const analysis = analyzeCsv(text);
    eq('Amex: detected format', analysis.formatDetection.format, 'amex');
    check('Amex: no balance column', analysis.layout.balanceCol === null);
    eq('Amex: sign method (heuristic, no balance col)', analysis.signAnalysis.method, 'heuristic-majority');
    eq('Amex: signInverted detected true', analysis.signAnalysis.signInverted, true);

    const preview = await buildImportPreview(analysis.layout, {
      account: 'amex',
      detectedFormat: analysis.formatDetection.format,
      signInverted: analysis.signAnalysis.signInverted,
      rules: [],
      categories: stubCategories(),
      existingHashes: new Set(),
    });
    eq('Amex: 8 rows parsed', preview.rows.length, 8);

    const danMurphys = preview.rows.find((r) => r.merchant === "Dan Murphy's");
    eq('Amex: charge +35.60 (file positive) -> +3560c spend', danMurphys?.amountCents, 3560);

    const payment = preview.rows.find((r) => r.description.startsWith('PAYMENT RECEIVED'));
    eq('Amex: payment -500.00 (file negative) -> -50000c income (not spend)', payment?.amountCents, -50000);

    const refund = preview.rows.find((r) => r.description.startsWith('REFUND'));
    eq('Amex: refund -120.00 (file negative) -> -12000c income', refund?.amountCents, -12000);
  }

  // ===================================================================
  // 7. Messy generic file — semicolons, unhelpful headers, reference codes
  // ===================================================================
  {
    const text = readSample('generic-messy.example.csv');
    const analysis = analyzeCsv(text);
    eq('Generic messy: delimiter sniffed as ;', analysis.rawCsv.delimiter, ';');
    eq('Generic messy: format falls through to generic', analysis.formatDetection.format, 'generic');
    check('Generic messy: date column still found despite odd header', analysis.layout.dateCol !== null);
    check('Generic messy: description column found', analysis.layout.descriptionCol !== null);
    check('Generic messy: Ref column NOT mistaken for balance/amount', analysis.layout.balanceCol !== 4 && analysis.layout.amountCol !== 4);

    const preview = await buildImportPreview(analysis.layout, {
      account: analysis.formatDetection.accountGuess,
      detectedFormat: analysis.formatDetection.format,
      signInverted: analysis.signAnalysis.signInverted,
      rules: [],
      categories: stubCategories(),
      existingHashes: new Set(),
    });
    eq('Generic messy: 6 rows parsed', preview.rows.length, 6);

    const salary = preview.rows.find((r) => r.description.includes('Salary'));
    eq('Generic messy: salary 2100.00 -> -210000c income', salary?.amountCents, -210000);

    const netflix = preview.rows.find((r) => r.description.includes('Netflix'));
    eq('Generic messy: Netflix -16.99 -> +1699c spend', netflix?.amountCents, 1699);
  }

  // ===================================================================
  // 8. Rules take priority over the dictionary
  // ===================================================================
  {
    const categories = stubCategories();
    // No keyword match at all (no "cafe"/"coffee"/etc.) -> truly unguessable, falls to Other.
    const withoutRule = categorizeDescription('XYZ CORNER STORE 99281', [], categories);
    eq('No rule: unguessable merchant falls back to Other', withoutRule.categoryId, 'cat-other');

    const withRule = categorizeDescription(
      'XYZ CORNER STORE 99281',
      [{ id: 'r1', match: 'xyz corner store', categoryId: 'cat-coffee', createdAt: Date.now() }],
      categories
    );
    eq('User rule overrides dictionary/fallback', withRule.categoryId, 'cat-coffee');
    eq('Rule match source reported', withRule.matchedBy, 'rule');

    // A local café with no dictionary entry still defaults sensibly via the generic
    // "cafe" pattern, rather than dumping into Other (CONTRACTS.md §5/§6).
    const localCafe = categorizeDescription('THE CORNER CAFE 4471', [], categories);
    eq('Unlisted local cafe defaults sensibly to Coffee', localCafe.categoryId, 'cat-coffee');
  }

  // ===================================================================
  // 9. Dedupe occurrence-index — genuinely distinct same-day identical rows must
  //    survive, while overlapping re-imports of the same statement still dedupe
  //    correctly (regression coverage for the "second identical coffee vanishes"
  //    bug — CONTRACTS.md §6).
  // ===================================================================
  {
    const layoutFor = (text: string) =>
      buildManualLayout(parseRawCsv(text), { hasHeader: false, dateCol: 0, amountCol: 1, descriptionCol: 2 });

    const previewOpts = (existingHashes: ReadonlySet<string>) => ({
      account: 'cba' as const,
      detectedFormat: 'cba' as const,
      signInverted: false,
      rules: [],
      categories: stubCategories(),
      existingHashes,
    });

    // (a) Two identical $5.50 coffees, same date/description/account, one file.
    const twoCoffees = '01/08/2026,-5.50,CAFE COFFEE SHOP\n01/08/2026,-5.50,CAFE COFFEE SHOP\n';
    const firstImport = await buildImportPreview(layoutFor(twoCoffees), previewOpts(new Set()));
    eq('Dedupe (a): 2 identical same-day coffees -> 2 new', firstImport.rows.length, 2);
    eq('Dedupe (a): 2 identical same-day coffees -> 0 duplicates', firstImport.duplicateCount, 0);
    check(
      'Dedupe (a): the two identical rows hash differently from each other',
      firstImport.rows.length === 2 && firstImport.rows[0].hash !== firstImport.rows[1].hash
    );
    check(
      'Dedupe (a): both rows still carry the correct $5.50 spend',
      firstImport.rows.every((r) => r.amountCents === 550)
    );

    // (b) Re-importing the exact same file must dedupe both rows, not just one.
    const afterFirstImport = existingHashSet(firstImport.rows);
    const reImportSameFile = await buildImportPreview(layoutFor(twoCoffees), previewOpts(afterFirstImport));
    eq('Dedupe (b): re-importing the same 2-coffee file -> 0 new', reImportSameFile.rows.length, 0);
    eq('Dedupe (b): re-importing the same 2-coffee file -> 2 duplicates', reImportSameFile.duplicateCount, 2);

    // (c) A later, overlapping statement contains a genuine THIRD identical coffee
    // alongside the two already imported — exactly one of the three should be new.
    const threeCoffees =
      '01/08/2026,-5.50,CAFE COFFEE SHOP\n01/08/2026,-5.50,CAFE COFFEE SHOP\n01/08/2026,-5.50,CAFE COFFEE SHOP\n';
    const overlappingImport = await buildImportPreview(layoutFor(threeCoffees), previewOpts(afterFirstImport));
    eq('Dedupe (c): 3-row file over 2 already-imported -> 1 new', overlappingImport.rows.length, 1);
    eq('Dedupe (c): 3-row file over 2 already-imported -> 2 duplicates', overlappingImport.duplicateCount, 2);

    // (c continued) Row order within the file must not matter — reversing the row
    // order still yields the same "1 new, 2 duplicates" outcome, because occurrence
    // assignment only depends on how many identical rows exist, not which physical
    // row is seen first.
    const threeCoffeesReordered =
      '01/08/2026,-5.50,CAFE COFFEE SHOP\n01/08/2026,-5.50,CAFE COFFEE SHOP\n01/08/2026,-5.50,CAFE COFFEE SHOP\n';
    const overlappingReordered = await buildImportPreview(
      layoutFor(threeCoffeesReordered),
      previewOpts(afterFirstImport)
    );
    eq('Dedupe (c): row order within the file does not change the outcome (new)', overlappingReordered.rows.length, 1);
    eq(
      'Dedupe (c): row order within the file does not change the outcome (duplicates)',
      overlappingReordered.duplicateCount,
      2
    );

    // (d) Manual quick-add must NEVER silently swallow an identical entry — this is
    // the store's `addTxn` (singular) code path, which — unlike `addTxns` — never
    // checks incoming hashes against existing ones at all, by design. We can't spin
    // up the full encrypted IndexedDB-backed store here (no browser IndexedDB in
    // Node, and we're not allowed to add a fake-indexeddb dependency just for this
    // check), so this reproduces `addTxn`'s exact control flow — compute a hash,
    // then unconditionally construct and keep the record — to prove that flow has no
    // branch capable of dropping the second entry, even though both entries hash
    // identically (manual entry always uses occurrence 0, the default).
    const manualTxns: { hash: string }[] = [];
    for (let i = 0; i < 2; i++) {
      // Mirrors useStore.ts's `addTxn`: compute the hash, then push — no lookup,
      // no skip, no condition. This is what makes quick-add safe for two identical
      // entries in a row (two coffees logged back-to-back).
      const hash = await computeTxnHash('2026-08-01', 550, 'Coffee', 'cash');
      manualTxns.push({ hash });
    }
    eq('Dedupe (d): two identical quick-add entries -> both saved', manualTxns.length, 2);
    check(
      'Dedupe (d): both entries hash identically (occurrence 0 default) yet neither was dropped',
      manualTxns[0].hash === manualTxns[1].hash
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
