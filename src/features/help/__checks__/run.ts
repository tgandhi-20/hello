/**
 * Plain, node-runnable checks for the "How Tally works" copy (no test
 * framework is installed). Run with: `npx tsx src/features/help/__checks__/run.ts`
 *
 * Tone/content checks only — this feature has no other pure logic
 * (`HelpScreen`/`Equation`/`WhyLine` just format numbers `computeMonthMoney`
 * already computed; nothing here recomputes money). Never logs financial data
 * (there isn't any at this level to log).
 */
import {
  TITLE,
  LEAD,
  BILLS_DEFINITION,
  SAVINGS_DEFINITION,
  WHAT_IT_SEES,
  WHERE_DATA_LIVES,
  WHY_ENTRIES,
  INCOME_UNSET_MESSAGE,
} from '../copy';

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

const ALL_STRINGS: string[] = [
  TITLE,
  LEAD,
  BILLS_DEFINITION,
  SAVINGS_DEFINITION,
  WHAT_IT_SEES,
  WHERE_DATA_LIVES,
  INCOME_UNSET_MESSAGE,
  ...WHY_ENTRIES.map((e) => e.a),
];

// Jargon a plain-English budgeting page should never say. Deliberately narrow
// (a false positive here is a copy bug worth catching, not noise) — words the
// app used to lean on before v4's rename pass (DESIGN-V4.md §3).
const BANNED_WORDS = [
  'safe to spend',
  'leverage',
  'utilize',
  'utilise',
  'synerg',
  'engine',
  'algorithm',
  'recurring radar',
  'statement cycle',
  'confidence score',
];

// A finance app must never scold (DESIGN-V4.md §5) — no exclamation marks,
// no "overspent"/"over budget" framing anywhere in this copy.
const SCOLDING_WORDS = ['overspent', 'over budget', "you shouldn't", "you can't afford"];

function main(): void {
  console.log('--- Tally help checks ---\n');

  check('TITLE is exactly "How Tally works" (DESIGN-V4.md §4.3)', TITLE === 'How Tally works');

  for (const s of ALL_STRINGS) {
    check(`No exclamation marks: "${s.slice(0, 40)}…"`, !s.includes('!'));
    for (const word of BANNED_WORDS) {
      check(`No banned jargon "${word}" in: "${s.slice(0, 40)}…"`, !s.toLowerCase().includes(word));
    }
    for (const word of SCOLDING_WORDS) {
      check(`No scolding phrase "${word}" in: "${s.slice(0, 40)}…"`, !s.toLowerCase().includes(word));
    }
  }

  // Deliverable 1's five required points — assert each is actually present,
  // not just "some text exists somewhere".
  check('Bills definition names rent/utilities/subscriptions as committed', /rent.*utilit.*subscription/i.test(BILLS_DEFINITION));
  check('Savings definition says "paid first"', /first/i.test(SAVINGS_DEFINITION));
  check(
    'The honesty statement explicitly says Tally cannot see the bank balance',
    /cannot see your bank balance/i.test(WHAT_IT_SEES)
  );
  check('The honesty statement says what Tally DOES see (log/import)', /log.*import|import.*log/i.test(WHAT_IT_SEES));
  check('Data-location copy says "encrypted"', /encrypted/i.test(WHERE_DATA_LIVES));
  check('Data-location copy states the backup trade-off plainly, not softened', /no backup unless/i.test(WHERE_DATA_LIVES));
  check('At least two "why does it say that" answers', WHY_ENTRIES.length >= 2);
  check(
    'One why-entry explains a bill appearing drops Left',
    WHY_ENTRIES.some((e) => /bill/i.test(e.a) && /drop/i.test(e.a))
  );
  check(
    'One why-entry explains an own-account card payment is not spending',
    WHY_ENTRIES.some((e) => /credit card/i.test(e.a) && /not.*spending|isn't counted as spending/i.test(e.a))
  );

  // Brevity: "half a screen" (DESIGN-V4.md §4.3) — a rough, generous word-count
  // ceiling so nobody accidentally turns this back into a feature tour. This
  // excludes the equation's own numbers/labels, which live in Equation.tsx,
  // not copy.ts.
  const totalWords = ALL_STRINGS.join(' ').split(/\s+/).filter(Boolean).length;
  check(`Total prose stays under 320 words (got ${totalWords})`, totalWords < 320);

  console.log(`\n--- ${passed} passed, ${failed} failed ---`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main();
