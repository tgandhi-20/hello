import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, formatMoney } from '@/ui';
import type { MonthMoney } from '@/money';

export interface EquationSectionProps {
  money: MonthMoney;
}

interface EquationRowProps {
  /** '−' or '=' shown before the label, muted. `undefined` for the plain Income row. */
  operator?: '−' | '=';
  label: string;
  cents: number;
  /** The two lines the equation actually concludes with (`= To spend`, `= Left`) render bigger and bolder. */
  emphasis?: boolean;
}

function EquationRow({ operator, label, cents, emphasis = false }: EquationRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={emphasis ? 'text-sm font-semibold text-ink-1' : 'text-sm text-ink-2'}>
        {operator ? <span className="mr-1.5 text-ink-3" aria-hidden="true">{operator}</span> : null}
        {label}
      </span>
      <span className={['money', emphasis ? 'text-lg text-ink-1' : 'text-sm text-ink-2'].join(' ')}>
        {formatMoney(cents)}
      </span>
    </div>
  );
}

/**
 * Home's heart (DESIGN-V4.md §1) — the actual subtraction, laid out, always
 * adding up. Not a big number with its reasoning hidden in small print: every
 * line of the equation is on screen, in order, so a person reads a subtraction
 * without being taught.
 *
 * Every figure here comes from ONE call to `computeMonthMoney` (`src/money`) —
 * this component does no arithmetic of its own beyond formatting.
 *
 * When income is unset, the Income row becomes a plain-language prompt instead
 * of a fake or blank number (DESIGN-V4.md §1: "never invent a number"). The rest
 * of the equation still renders — Bills and Savings are known independent of
 * income — so the shape of the calculation stays visible even before it's
 * complete.
 *
 * The Left figure stays `--ink-1` even when it has gone negative (DESIGN-V4.md
 * §5: "Hero figures stay ink-1; the supporting line carries state") — colouring
 * the number itself would contradict the calm, factual tone this app commits to
 * everywhere else.
 */
export function EquationSection({ money }: EquationSectionProps) {
  const navigate = useNavigate();
  const over = money.leftCents < 0;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink-2">Income</span>
          {money.incomeUnset ? (
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="min-h-[32px] rounded-pill bg-accent-tint px-3 text-sm font-medium text-accent active:bg-accent-tint"
            >
              Add your income →
            </button>
          ) : (
            <span className="money text-sm text-ink-2">{formatMoney(money.incomeCents)}</span>
          )}
        </div>
        <EquationRow operator="−" label="Bills" cents={money.billsCents} />
        <EquationRow operator="−" label="Savings" cents={money.savingsCents} />
      </div>

      <div className="flex flex-col gap-2.5 border-t border-hairline pt-3">
        <EquationRow operator="=" label="To spend" cents={money.toSpendCents} emphasis />
        <EquationRow label="Already spent" cents={money.spentCents} />
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-md font-semibold text-ink-1">
            <span className="mr-1.5 text-ink-3" aria-hidden="true">=</span>Left
          </span>
          <span className="money-hero text-2xl text-ink-1">{formatMoney(money.leftCents)}</span>
        </div>
        <p className="text-sm text-ink-2">
          <span className="money text-ink-2">{formatMoney(money.leftCents)}</span> left ·{' '}
          <span className="money text-ink-2">{formatMoney(money.leftTodayCents)}</span> a day for {money.daysRemaining}{' '}
          day{money.daysRemaining === 1 ? '' : 's'}.
        </p>
        {over ? (
          <p className="text-sm text-ink-2">
            That's a negative number — bills, savings and what's already gone add up to more than what's left this
            month. Not a scold, just the maths.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
