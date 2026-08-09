import React from 'react';
import { formatMoney } from '@/ui';
import type { MonthMoney } from '@/money';

/** `15` -> `"15th"`, `1` -> `"1st"`, `22` -> `"22nd"`. Small and local — used nowhere else. */
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

interface EqRowProps {
  label: string;
  amountCents: number;
  note?: string;
  /** The two subtotal rows ("= To spend", "= Left") — heavier weight, top hairline. */
  subtotal?: boolean;
  /** "already spent" sits under "= To spend" with no leading sign, slightly indented. */
  indent?: boolean;
}

function EqRow({ label, amountCents, note, subtotal = false, indent = false }: EqRowProps) {
  return (
    <div className={['flex items-baseline justify-between gap-3 py-1.5', subtotal ? 'border-t border-hairline pt-2' : ''].join(' ')}>
      <div className={['min-w-0', indent ? 'pl-4' : ''].join(' ')}>
        <p className={['text-sm', subtotal ? 'font-semibold text-ink-1' : 'text-ink-1'].join(' ')}>{label}</p>
        {note ? <p className="text-xs text-ink-2">{note}</p> : null}
      </div>
      <span className={['money shrink-0 text-sm', subtotal ? 'text-ink-1' : 'text-ink-1'].join(' ')}>
        {formatMoney(amountCents, { hideCents: true })}
      </span>
    </div>
  );
}

export interface EquationProps {
  money: MonthMoney;
  paydayDayOfMonth: number;
}

/**
 * The equation itself, laid out as an actual subtraction (DESIGN-V4.md §1) —
 * never a hero figure with the maths hidden in small print. Every figure comes
 * straight from `computeMonthMoney()`; this component formats, it never computes.
 */
export function Equation({ money, paydayDayOfMonth }: EquationProps) {
  const dayWord = money.daysRemaining === 1 ? 'day' : 'days';
  const perDayLine =
    money.daysRemaining > 0
      ? `÷ ${money.daysRemaining} ${dayWord} left = ${formatMoney(money.leftTodayCents, { hideCents: true })} a day`
      : 'the month is over';

  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <EqRow label="Income" amountCents={money.incomeCents} note={`what lands on the ${ordinal(paydayDayOfMonth)}`} />
      <EqRow label="− Bills" amountCents={money.billsCents} note="rent, utilities, subscriptions — committed" />
      <EqRow label="− Savings" amountCents={money.savingsCents} note="the deposit, paid first not last" />
      <EqRow label="= To spend" amountCents={money.toSpendCents} note="everything else, for the whole month" subtotal />
      <EqRow label="already spent" amountCents={money.spentCents} indent />
      <EqRow label="= Left" amountCents={money.leftCents} note={perDayLine} subtotal />
    </div>
  );
}
