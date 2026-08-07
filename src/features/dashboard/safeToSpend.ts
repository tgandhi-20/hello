/**
 * Safe-to-Spend — the dashboard's hero number.
 *
 * income − committed (rent, bills, detected recurring) − savings target − what's
 * already been spent on non-committed things this month, divided across the days
 * left in the month (CONTRACTS.md §7 + §0's dashboard brief).
 *
 * The contract's one-line formula ("income minus committed minus savings, divided
 * across days remaining") would hold the daily allowance constant all month even as
 * money gets spent, which isn't actually "safe to spend from today" — so this also
 * subtracts discretionary spend already logged this month. Committed recurring bills
 * must be excluded from that subtraction so a rent payment already posted isn't
 * counted twice (once as "committed", once as "already spent").
 *
 * `Txn.recurringId` exists in the type but nothing in this codebase ever writes it
 * (see the fix note below) — so exclusion is derived directly from the *active*
 * (non-muted) `RecurringSeries[].txnIds`, which is the single source of truth for
 * "which transactions belong to a committed series" already. This avoids a
 * denormalised field that has to be kept in sync on every detection pass, edit,
 * mute, or delete. A *muted* series contributes nothing to `committedCents`
 * (filtered out below) — its transactions must then fall through into ordinary
 * `spentSoFarCents`, or that money would never be counted at all. Only txn ids
 * belonging to a currently-active series are excluded, so every dollar is counted
 * exactly once: either as "committed" or as "already spent", never both, never
 * neither.
 *
 * Pure function, no store access — the caller reads `useStore` and passes state in.
 */
import type { Cents, MonthStr, RecurringSeries, Settings, Txn } from '@/types';
import { safeDiv } from '@/charts';
import { currentMonth, daysRemainingInMonth } from '../insights/monthMath';

export interface SafeToSpendResult {
  month: MonthStr;
  /** True when `settings.monthlyIncomeCents` is 0/unset — caller must show a prompt, never a number. */
  incomeUnset: boolean;
  incomeCents: Cents;
  /** Monthly-equivalent cost of active (non-muted) recurring series. */
  committedCents: Cents;
  savingsTargetCents: Cents;
  /** Discretionary (non-recurring) spend already logged this month. */
  spentSoFarCents: Cents;
  /** income − committed − savings − spent so far. Can be negative. */
  poolCents: Cents;
  /** Always >= 1 for the current month. */
  daysRemaining: number;
  /** poolCents ÷ daysRemaining, rounded to the nearest cent. Can be negative. */
  perDayCents: Cents;
}

/** Approximate weeks/month and fortnights/month — good enough for a monthly-equivalent estimate. */
const WEEKS_PER_MONTH = 52 / 12;
const FORTNIGHTS_PER_MONTH = 26 / 12;

export function monthlyEquivalentCents(series: Pick<RecurringSeries, 'amountCents' | 'cadence'>): Cents {
  const amt = Math.max(0, series.amountCents);
  switch (series.cadence) {
    case 'weekly':
      return Math.round(amt * WEEKS_PER_MONTH);
    case 'fortnightly':
      return Math.round(amt * FORTNIGHTS_PER_MONTH);
    case 'monthly':
      return amt;
    case 'quarterly':
      return Math.round(amt / 3);
    case 'yearly':
      return Math.round(amt / 12);
    default:
      return amt;
  }
}

export interface ComputeSafeToSpendParams {
  txns: Txn[];
  recurring: RecurringSeries[];
  settings: Settings;
  /** Defaults to the current calendar month — Safe-to-Spend is always "from today". */
  month?: MonthStr;
  /** Defaults to today. Exposed for testability. */
  today?: string;
}

export function computeSafeToSpend({
  txns,
  recurring,
  settings,
  month = currentMonth(),
}: ComputeSafeToSpendParams): SafeToSpendResult {
  const incomeCents = settings.monthlyIncomeCents;
  const incomeUnset = !incomeCents || incomeCents <= 0;

  const activeSeries = recurring.filter((r) => !r.muted);
  const committedCents = activeSeries.reduce((sum, r) => sum + monthlyEquivalentCents(r), 0);

  // Every txn id that belongs to a currently-active (non-muted) series is already
  // represented in `committedCents` above — exclude it here so it isn't double
  // counted as ordinary spend too. A muted series' txn ids are deliberately NOT in
  // this set, so their posted transactions count as normal spend once muted.
  const committedTxnIds = new Set<string>();
  for (const series of activeSeries) {
    for (const txnId of series.txnIds) committedTxnIds.add(txnId);
  }

  const spentSoFarCents = txns
    .filter((t) => t.date.startsWith(month) && !t.excluded && t.amountCents > 0 && !committedTxnIds.has(t.id))
    .reduce((sum, t) => sum + t.amountCents, 0);

  const savingsTargetCents = Math.max(0, settings.savingsTargetCents);

  const poolCents = incomeCents - committedCents - savingsTargetCents - spentSoFarCents;
  const daysRemaining = daysRemainingInMonth(month);
  const perDayCents = Math.round(safeDiv(poolCents, daysRemaining, 0));

  return {
    month,
    incomeUnset,
    incomeCents,
    committedCents,
    savingsTargetCents,
    spentSoFarCents,
    poolCents,
    daysRemaining,
    perDayCents,
  };
}
