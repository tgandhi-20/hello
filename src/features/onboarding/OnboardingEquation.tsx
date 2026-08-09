import React from 'react';
import { formatMoney } from '@/ui/format';
import type { EquationPreview } from './onboardingSettings';

interface RowProps {
  label: string;
  amountCents: number;
  note?: string;
  subtotal?: boolean;
  indent?: boolean;
  muted?: boolean;
}

function Row({ label, amountCents, note, subtotal = false, indent = false, muted = false }: RowProps) {
  return (
    <div className={['flex items-baseline justify-between gap-3 py-1.5', subtotal ? 'border-t border-hairline pt-2' : ''].join(' ')}>
      <div className={indent ? 'pl-4' : ''}>
        <p className={['text-sm', subtotal ? 'font-semibold text-ink-1' : 'text-ink-1'].join(' ')}>{label}</p>
        {note ? <p className="text-xs text-ink-2">{note}</p> : null}
      </div>
      <span className={['money shrink-0 text-sm', muted ? 'text-ink-3' : 'text-ink-1'].join(' ')}>
        {formatMoney(amountCents, { hideCents: true })}
      </span>
    </div>
  );
}

export interface OnboardingEquationProps {
  preview: EquationPreview;
  /** Set once "What's left" reveals the daily figure — omitted on the earlier "What's committed" step, where dividing across days would imply a number this step never actually shows. */
  daily?: { daysRemaining: number; perDayCents: number };
}

/**
 * The same six-line shape `computeMonthMoney()` (`src/money`) and Help's
 * `Equation.tsx` use, built locally so onboarding never imports `@/money`
 * before there's any real data for it to compute from (see
 * `onboardingSettings.ts`'s `buildEquationPreview` doc comment). Purely a
 * formatter — every number it renders is already in `preview`/`daily`.
 */
export function OnboardingEquation({ preview, daily }: OnboardingEquationProps) {
  const dayWord = daily && daily.daysRemaining === 1 ? 'day' : 'days';
  const perDayNote = daily
    ? daily.daysRemaining > 0
      ? `÷ ${daily.daysRemaining} ${dayWord} left this month = ${formatMoney(daily.perDayCents, { hideCents: true })} a day`
      : undefined
    : undefined;

  return (
    <div className="rounded-card bg-surface-sunk p-4">
      <Row label="Income" amountCents={preview.incomeCents} />
      <Row label="− Bills" amountCents={preview.billsCents} note="nothing logged yet" muted />
      <Row label="− Savings" amountCents={preview.savingsCents} />
      <Row label="= To spend" amountCents={preview.toSpendCents} subtotal />
      {daily ? (
        <>
          <Row label="already spent" amountCents={preview.spentCents} note="nothing logged yet" indent muted />
          <Row label="= Left" amountCents={preview.leftCents} note={perDayNote} subtotal />
        </>
      ) : null}
    </div>
  );
}
