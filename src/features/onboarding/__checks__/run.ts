/**
 * Plain, node-runnable checks for the onboarding feature's pure logic (no test
 * framework is installed). Run with: `npx tsx src/features/onboarding/__checks__/run.ts`
 *
 * Never logs a transaction, amount, or merchant.
 */
import {
  PLAN_SEED_BUDGET_COUNT,
  PLAN_SEED_SUBSCRIPTION_COUNT,
  PLAN_SEED_SUBSCRIPTION_NAMES,
  initialOnboardingAnswers,
  hecsImpactNote,
  buildOnboardingSettingsPatch,
  buildSkipSettingsPatch,
  isValidMoneyCents,
  isValidPaydayDay,
  type OnboardingAnswers,
} from '../onboardingSettings';
import { PLAN_DEFAULTS } from '../../../personal/plan';

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

async function main(): Promise<void> {
  console.log('--- Tally onboarding checks ---\n');

  // ===================================================================
  // 1. What "start with my plan" claims to seed matches applyPersonalPlan's
  //    own arithmetic (personal/plan.ts), so the onboarding copy can never
  //    drift from what actually gets written.
  // ===================================================================
  eq('PLAN_SEED_BUDGET_COUNT is exactly 15 (18 categories minus income/one-offs/other, which are uncapped)', PLAN_SEED_BUDGET_COUNT, 15);
  eq('PLAN_SEED_SUBSCRIPTION_COUNT is exactly 4 (PERSONAL.md §5)', PLAN_SEED_SUBSCRIPTION_COUNT, 4);
  eq('PLAN_SEED_SUBSCRIPTION_NAMES lists all four', PLAN_SEED_SUBSCRIPTION_NAMES, ['Netflix', 'Amazon Prime', 'Crunchyroll', 'Google One']);

  // ===================================================================
  // 2. initialOnboardingAnswers falls back to plan defaults only when a
  //    setting is genuinely unset (0 / falsy), and otherwise reflects
  //    whatever's already in Settings (so re-running shows real state, not
  //    always the plan's own numbers).
  // ===================================================================
  {
    const fresh = initialOnboardingAnswers({
      monthlyIncomeCents: 0,
      paydayDayOfMonth: 0,
      savingsTargetCents: 0,
      moveInDate: undefined,
      hasHecsDebt: undefined,
    });
    eq('Unset income falls back to PLAN_DEFAULTS', fresh.monthlyIncomeCents, PLAN_DEFAULTS.monthlyIncomeCents);
    eq('Unset payday falls back to PLAN_DEFAULTS', fresh.paydayDayOfMonth, PLAN_DEFAULTS.paydayDayOfMonth);
    eq('Unset savings target falls back to PLAN_DEFAULTS', fresh.savingsTargetCents, PLAN_DEFAULTS.savingsTargetCents);
    eq('Unanswered HECS defaults to false for the FORM (not a silent app-wide assumption — see buildSkipSettingsPatch below)', fresh.hasHecsDebt, false);
    eq('Unset moveInDate stays undefined, never inferred', fresh.moveInDate, undefined);

    const existing = initialOnboardingAnswers({
      monthlyIncomeCents: 700_000,
      paydayDayOfMonth: 1,
      savingsTargetCents: 400_000,
      moveInDate: '2026-08-20',
      hasHecsDebt: true,
    });
    eq('A real (edited) income is kept, not overridden by plan defaults', existing.monthlyIncomeCents, 700_000);
    eq('A real payday is kept', existing.paydayDayOfMonth, 1);
    eq('A real savings target is kept', existing.savingsTargetCents, 400_000);
    eq('A previously-set moveInDate is kept', existing.moveInDate, '2026-08-20');
    eq('A previously-answered HECS=true is kept, not reset to false', existing.hasHecsDebt, true);
  }

  // ===================================================================
  // 3. hecsImpactNote — stated once, plainly, matches PERSONAL.md §2's ~$700/month.
  // ===================================================================
  {
    const note = hecsImpactNote();
    check('hecsImpactNote mentions the ~$700/month impact', note.includes('$700'));
    check('hecsImpactNote says the plan needs revisiting, not that it auto-adjusts', note.toLowerCase().includes('revisiting'));
    check('hecsImpactNote is calm, not alarmed (no exclamation marks)', !note.includes('!'));
  }

  // ===================================================================
  // 4. buildOnboardingSettingsPatch — a full answer set writes every field,
  //    including an explicit HECS answer, plus the completion timestamp.
  // ===================================================================
  {
    const answers: OnboardingAnswers = {
      monthlyIncomeCents: 645_700,
      paydayDayOfMonth: 15,
      savingsTargetCents: 350_000,
      moveInDate: '2026-08-22',
      hasHecsDebt: true,
      startWithPlan: true,
    };
    const patch = buildOnboardingSettingsPatch(answers, 1_700_000_000_000);
    eq('Patch carries the entered income', patch.monthlyIncomeCents, 645_700);
    eq('Patch carries the entered payday', patch.paydayDayOfMonth, 15);
    eq('Patch carries the entered savings target', patch.savingsTargetCents, 350_000);
    eq('Patch carries the entered move-in date', patch.moveInDate, '2026-08-22');
    eq('Patch carries the explicit HECS answer (true)', patch.hasHecsDebt, true);
    eq('Patch marks onboarding complete with the given timestamp', patch.onboardingCompletedAt, 1_700_000_000_000);

    const noMoveIn: OnboardingAnswers = { ...answers, moveInDate: undefined, hasHecsDebt: false };
    const patch2 = buildOnboardingSettingsPatch(noMoveIn, 1);
    eq('An explicit "not moved yet" answer stores undefined, not a guessed date', patch2.moveInDate, undefined);
    eq('An explicit HECS=false answer is stored as false, not omitted', patch2.hasHecsDebt, false);
  }

  // ===================================================================
  // 5. buildSkipSettingsPatch — ONLY the completion flag. Skipping must never
  //    silently write an income/payday/savings/moveIn/HECS value the user
  //    never confirmed.
  // ===================================================================
  {
    const patch = buildSkipSettingsPatch(999);
    eq('Skip patch is exactly {onboardingCompletedAt}', Object.keys(patch), ['onboardingCompletedAt']);
    eq('Skip patch marks completion with the given timestamp', patch.onboardingCompletedAt, 999);
    check(
      "Skip patch does NOT touch hasHecsDebt (deliverable 1: HECS must be an explicit answer, never silently assumed)",
      !('hasHecsDebt' in patch)
    );
    check('Skip patch does NOT touch moveInDate', !('moveInDate' in patch));
    check('Skip patch does NOT touch monthlyIncomeCents', !('monthlyIncomeCents' in patch));
  }

  // ===================================================================
  // 6. Input validation guards — integer cents only, sane payday range.
  // ===================================================================
  {
    check('isValidMoneyCents accepts 0', isValidMoneyCents(0));
    check('isValidMoneyCents accepts a normal figure', isValidMoneyCents(645_700));
    check('isValidMoneyCents rejects a negative figure', !isValidMoneyCents(-100));
    check('isValidMoneyCents rejects a non-integer (float cents are never valid)', !isValidMoneyCents(100.5));
    check('isValidMoneyCents rejects NaN', !isValidMoneyCents(NaN));
    check('isValidMoneyCents rejects an absurdly large figure', !isValidMoneyCents(10_000_000_000));

    check('isValidPaydayDay accepts 1', isValidPaydayDay(1));
    check('isValidPaydayDay accepts 31', isValidPaydayDay(31));
    check('isValidPaydayDay rejects 0', !isValidPaydayDay(0));
    check('isValidPaydayDay rejects 32', !isValidPaydayDay(32));
    check('isValidPaydayDay rejects a non-integer', !isValidPaydayDay(15.5));
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
