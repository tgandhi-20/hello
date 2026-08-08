/**
 * Pure logic for the first-run onboarding flow (DESIGN-V3.md §5 deliverable 1,
 * PERSONAL.md §2/§7). No store access here — `OnboardingFlow.tsx` is the thin
 * React/store wrapper, so this stays checkable from `__checks__/run.ts` without
 * IndexedDB/WebCrypto, same split as `src/features/routine/state.ts`.
 */
import type { Cents, DateStr, Settings } from '@/types';
import { formatMoney } from '@/ui/format';
import { PLAN_DEFAULTS, PERSONAL_CATEGORIES, KNOWN_SUBSCRIPTIONS, INCOME } from '@/personal/plan';

/** How many category budgets `applyPersonalPlan` seeds — every PERSONAL_CATEGORIES entry with a real cap (income/one-offs/other are excluded, per plan.ts). */
export const PLAN_SEED_BUDGET_COUNT = PERSONAL_CATEGORIES.filter((c) => c.capCents !== null).length;

/** How many known subscriptions `applyPersonalPlan` seeds (PERSONAL.md §5). */
export const PLAN_SEED_SUBSCRIPTION_COUNT = KNOWN_SUBSCRIPTIONS.length;

/** Display names for the "start with my plan" step — kept here so the UI never re-derives them. */
export const PLAN_SEED_SUBSCRIPTION_NAMES: readonly string[] = KNOWN_SUBSCRIPTIONS.map((s) => s.merchant);

export interface OnboardingAnswers {
  monthlyIncomeCents: Cents;
  paydayDayOfMonth: number;
  savingsTargetCents: Cents;
  /** `undefined` = explicitly left unset ("not sure yet") — never inferred (PERSONAL.md §7). */
  moveInDate?: DateStr;
  /** Must be a real yes/no by the time the flow finishes — never defaulted (PERSONAL.md §2). */
  hasHecsDebt: boolean;
  startWithPlan: boolean;
}

/** The values a fresh onboarding session starts from — the app's current settings, not hardcoded plan defaults, so re-running from Settings shows what's actually set. */
export function initialOnboardingAnswers(settings: Pick<Settings, 'monthlyIncomeCents' | 'paydayDayOfMonth' | 'savingsTargetCents' | 'moveInDate' | 'hasHecsDebt'>): Omit<OnboardingAnswers, 'startWithPlan'> {
  return {
    monthlyIncomeCents: settings.monthlyIncomeCents > 0 ? settings.monthlyIncomeCents : PLAN_DEFAULTS.monthlyIncomeCents,
    paydayDayOfMonth: settings.paydayDayOfMonth || PLAN_DEFAULTS.paydayDayOfMonth,
    savingsTargetCents: settings.savingsTargetCents > 0 ? settings.savingsTargetCents : PLAN_DEFAULTS.savingsTargetCents,
    moveInDate: settings.moveInDate,
    hasHecsDebt: settings.hasHecsDebt ?? false,
  };
}

/** PERSONAL.md §2/§7: "surface this as a one-time setup question... If one exists, subtract ~$700/month and the plan needs rebuilding." Stated once, plainly, calm not alarmed. */
export function hecsImpactNote(): string {
  const impact = formatMoney(INCOME.hecsApproxMonthlyImpactCents, { hideCents: true });
  return (
    `This plan's figures assume no HECS/HELP debt. With one, take-home drops by about ${impact} a month, ` +
    `so the budget and savings numbers here will need revisiting. Nothing is recalculated automatically — ` +
    `you can change this anytime in Settings.`
  );
}

/** What finishing the flow (with real answers) writes to Settings. Always marks onboarding complete. */
export function buildOnboardingSettingsPatch(answers: OnboardingAnswers, nowMs: number = Date.now()): Partial<Settings> {
  return {
    monthlyIncomeCents: answers.monthlyIncomeCents,
    paydayDayOfMonth: answers.paydayDayOfMonth,
    savingsTargetCents: answers.savingsTargetCents,
    moveInDate: answers.moveInDate,
    hasHecsDebt: answers.hasHecsDebt,
    onboardingCompletedAt: nowMs,
  };
}

/**
 * What skipping writes — ONLY the completion flag. Skipping must never silently
 * assume an income figure, a move-in date, or (especially) a HECS answer; those
 * stay exactly as they were (Settings' own defaults / still-unset), and the
 * flow is re-runnable from Settings later to actually answer them.
 */
export function buildSkipSettingsPatch(nowMs: number = Date.now()): Partial<Settings> {
  return { onboardingCompletedAt: nowMs };
}

/** Basic sanity bounds so a mistyped figure can't corrupt Safe-to-Spend. Integer cents only, per CONTRACTS.md §3. */
export function isValidMoneyCents(cents: number): boolean {
  return Number.isInteger(cents) && cents >= 0 && cents <= 999_999_999;
}

export function isValidPaydayDay(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= 31;
}
