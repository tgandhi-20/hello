/**
 * Pure step-resolution logic for the weekly-review guided flow. No store access —
 * `WeeklyReviewFlow.tsx` is the thin React/store wrapper. Kept pure so
 * `__checks__/run.ts` can exercise "resumes at the right step" directly, the
 * same split as `src/features/routine/state.ts`.
 */
import type { ReviewStepId, WeeklyReviewBookmark } from '@/types';
import { monthOf } from '@/ui/format';

/** The five steps, in the order the guided flow moves through them. */
export const REVIEW_STEP_ORDER: readonly ReviewStepId[] = ['import', 'categorise', 'recurring', 'amex', 'done'];

export interface ReviewStepInputs {
  uncategorisedCount: number;
  unconfirmedRecurringCount: number;
  amexPaid: boolean;
}

/**
 * Whether a step is currently satisfied (nothing left to do there), given
 * live data. `'import'` is deliberately NEVER auto-satisfied — it's always a
 * conscious first action, never something to silently skip past just because
 * nothing else is outstanding.
 */
function stepSatisfied(step: ReviewStepId, inputs: ReviewStepInputs): boolean {
  switch (step) {
    case 'import':
      return false;
    case 'categorise':
      return inputs.uncategorisedCount === 0;
    case 'recurring':
      return inputs.unconfirmedRecurringCount === 0;
    case 'amex':
      return inputs.amexPaid;
    case 'done':
      return true;
  }
}

/**
 * Resolve which step the flow should open on. Starts from the bookmark if it's
 * for the current month (a new month always starts fresh at `'import'`, same
 * rollover shape as `RoutineChecklistState`), then walks forward past any step
 * that's already satisfied by live data — so leaving the app mid-review and
 * finishing a step some other way (e.g. re-categorising from the Spending tab)
 * is reflected the next time the flow opens, without a stale bookmark stalling
 * on a step that's already done.
 */
export function resolveInitialStep(
  bookmark: WeeklyReviewBookmark | undefined,
  today: string,
  inputs: ReviewStepInputs
): ReviewStepId {
  const month = monthOf(today);
  let idx = 0;
  if (bookmark && bookmark.month === month) {
    const bookmarkIdx = REVIEW_STEP_ORDER.indexOf(bookmark.step);
    if (bookmarkIdx >= 0) idx = bookmarkIdx;
  }
  while (idx < REVIEW_STEP_ORDER.length - 1 && stepSatisfied(REVIEW_STEP_ORDER[idx], inputs)) {
    idx++;
  }
  return REVIEW_STEP_ORDER[idx];
}

export function nextStep(step: ReviewStepId): ReviewStepId {
  const idx = REVIEW_STEP_ORDER.indexOf(step);
  return REVIEW_STEP_ORDER[Math.min(idx + 1, REVIEW_STEP_ORDER.length - 1)];
}

export function previousStep(step: ReviewStepId): ReviewStepId {
  const idx = REVIEW_STEP_ORDER.indexOf(step);
  return REVIEW_STEP_ORDER[Math.max(idx - 1, 0)];
}

export function makeBookmark(step: ReviewStepId, today: string): WeeklyReviewBookmark {
  return { month: monthOf(today), step };
}

export const REVIEW_STEP_LABELS: Record<ReviewStepId, string> = {
  import: 'Import statements',
  categorise: 'Categorise',
  recurring: 'Confirm recurring',
  amex: 'Pay Amex',
  done: 'Done',
};
