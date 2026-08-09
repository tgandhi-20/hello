/**
 * Current-cycle balance — "what will this statement be?" The core of the
 * user's ask: tell them their card's building statement without opening the
 * bank app.
 *
 * HONESTY CONTRACT (the single most important rule in this file):
 *   - Every number here is derived from what Tally has been TOLD — logged
 *     manually or imported from a CSV — never from the bank. It can only ever
 *     be as current as the last import.
 *   - `stale` + `daysSinceLastData` surface that plainly ("last imported N
 *     days ago") so a confident-looking total is never mistaken for a live
 *     one. A stale number is still shown (hiding it would be its own kind of
 *     dishonesty — the user asked to see it), but never without the caveat.
 *   - When the statement cycle itself is unknown (no payment history yet, no
 *     override), this returns `status: 'insufficient-history'` with every
 *     total at 0 and every date `null` — never a fabricated close/due date,
 *     never a NaN.
 *
 * Pure function, no store access — the caller reads `useStore` and passes
 * state in, same convention as `dashboard/safeToSpend.ts`.
 */
import type { AccountId, Cents, DateStr, RecurringSeries, Txn } from '@/types';
import { todayStr } from '@/ui/format';
import type { CycleInference, CycleWindow } from './cycle';
import { currentCycleWindow } from './cycle';
import { diffDaysLocal } from './dates';

/**
 * A gap longer than this between the newest transaction Tally has for an
 * account and today is flagged as stale. The user's own routine (docs/
 * PERSONAL.md §8) imports statements on the first Saturday of the month —
 * i.e. roughly monthly by design — so this is set a little above a week:
 * long enough not to nag after an ordinary few quiet days, short enough to
 * catch "I haven't imported in a while" before a projected total gets far
 * from reality.
 */
export const STALE_AFTER_DAYS = 7;

export interface ProjectedCycleItem {
  seriesId: string;
  merchant: string;
  amountCents: Cents;
  dueDate: DateStr;
  /** Whether this projection comes from a user-confirmed series (more trustworthy) or a still-automatic detection. */
  confirmed: boolean;
}

export interface CurrentCycleBalance {
  accountId: AccountId;
  status: 'ok' | 'insufficient-history';
  cycle: CycleInference;
  cycleStartDate: DateStr | null;
  cycleCloseDate: DateStr | null;
  paymentDueDate: DateStr | null;
  /** Sum of charges Tally has recorded since the last close, up to today. */
  closedToDateCents: Cents;
  /** Sum of PROJECTED remaining charges — detected/confirmed recurring series due before this cycle closes. */
  projectedAdditionalCents: Cents;
  /** closedToDateCents + projectedAdditionalCents — "what this statement will likely be". */
  projectedTotalCents: Cents;
  /** What made up `projectedAdditionalCents`, for transparency — never an opaque number. */
  projectedItems: ProjectedCycleItem[];
  /** Most recent transaction date Tally has for this account, or `null` if none. */
  lastDataDate: DateStr | null;
  daysSinceLastData: number | null;
  stale: boolean;
  /** Plain-language summary of confidence + staleness, meant to be shown directly. */
  note: string;
}

/**
 * Sum this account's already-posted charges and its still-to-come projected
 * charges for one specific cycle window. Shared by `computeCurrentCycleBalance`
 * (the current, in-progress cycle) and `upcoming.ts` (future cycles within the
 * 60-day cashflow horizon) so the two never compute this two different ways.
 */
export function cycleChargesWithinWindow(
  txns: Txn[],
  recurring: RecurringSeries[],
  accountId: AccountId,
  window: CycleWindow,
  today: DateStr
): { closedToDateCents: Cents; projectedAdditionalCents: Cents; projectedItems: ProjectedCycleItem[] } {
  const accountTxns = txns.filter((t) => t.account === accountId);

  // Upper-bounded by BOTH `today` (can't count what hasn't happened/been
  // told to Tally yet) AND `window.cycleCloseDate` (a window whose close
  // date has already passed — e.g. computing an earlier, already-closed
  // statement's actual total for a still-pending due date — must not creep
  // into transactions that actually belong to the NEXT cycle).
  const closedUpperBound = window.cycleCloseDate < today ? window.cycleCloseDate : today;
  const closedToDateCents = accountTxns
    .filter((t) => !t.excluded && t.amountCents > 0 && t.date > window.cycleStartDate && t.date <= closedUpperBound)
    .reduce((sum, t) => sum + t.amountCents, 0);

  // Only ever project a charge that hasn't already posted: strictly after
  // `today` (and after the window's own start, for a window that starts in
  // the future). Anything on/before today either already showed up in
  // `closedToDateCents` above or was quietly skipped by the user, and
  // guessing it happened anyway would be exactly the "confident wrong
  // number" this file exists to avoid.
  const lowerBoundExclusive = window.cycleStartDate > today ? window.cycleStartDate : today;
  const projectedItems: ProjectedCycleItem[] = recurring
    .filter(
      (s) =>
        !s.muted &&
        s.accountId === accountId &&
        s.amountCents > 0 &&
        s.nextDue > lowerBoundExclusive &&
        s.nextDue <= window.cycleCloseDate
    )
    .map((s) => ({ seriesId: s.id, merchant: s.merchant, amountCents: s.amountCents, dueDate: s.nextDue, confirmed: Boolean(s.confirmed) }))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  const projectedAdditionalCents = projectedItems.reduce((sum, i) => sum + i.amountCents, 0);

  return { closedToDateCents, projectedAdditionalCents, projectedItems };
}

function mostRecentDate(dates: DateStr[]): DateStr | null {
  return dates.reduce<DateStr | null>((latest, d) => (latest === null || d > latest ? d : latest), null);
}

function buildBalanceNote(cycle: CycleInference, projectedCount: number, stale: boolean, daysSinceLastData: number | null): string {
  const parts: string[] = [];

  if (cycle.source === 'user-override') {
    parts.push('You set these dates.');
  } else if (cycle.closingDayConfidence === 'high' || cycle.dueDayConfidence === 'high') {
    parts.push('We think we know these dates, from what you imported.');
  } else {
    parts.push("We're not sure about these dates yet — worth double-checking.");
  }

  parts.push(
    projectedCount > 0
      ? `Includes ${projectedCount} expected regular payment${projectedCount === 1 ? '' : 's'} that haven't posted yet.`
      : 'No expected regular payments left before this statement closes — this total may still be missing anything one-off.'
  );

  if (daysSinceLastData === null) {
    parts.push('No transactions recorded for this account yet.');
  } else if (stale) {
    parts.push(
      `Last imported ${daysSinceLastData === 1 ? '1 day' : `${daysSinceLastData} days`} ago — this total may be missing recent spending.`
    );
  } else {
    parts.push(`Up to date as of ${daysSinceLastData === 0 ? 'today' : daysSinceLastData === 1 ? 'yesterday' : `${daysSinceLastData} days ago`}.`);
  }

  return parts.join(' ');
}

/** Build the "what will this statement be?" figure for one card account. */
export function computeCurrentCycleBalance(
  txns: Txn[],
  recurring: RecurringSeries[],
  accountId: AccountId,
  cycle: CycleInference,
  today: DateStr = todayStr()
): CurrentCycleBalance {
  const accountTxns = txns.filter((t) => t.account === accountId);
  const lastDataDate = mostRecentDate(accountTxns.map((t) => t.date));
  const daysSinceLastData = lastDataDate ? diffDaysLocal(lastDataDate, today) : null;
  const stale = daysSinceLastData !== null && daysSinceLastData > STALE_AFTER_DAYS;

  const window = currentCycleWindow(cycle, today);

  if (!window) {
    return {
      accountId,
      status: 'insufficient-history',
      cycle,
      cycleStartDate: null,
      cycleCloseDate: null,
      paymentDueDate: null,
      closedToDateCents: 0,
      projectedAdditionalCents: 0,
      projectedTotalCents: 0,
      projectedItems: [],
      lastDataDate,
      daysSinceLastData,
      stale,
      note: "Tally doesn't know this card's bill dates yet — import a few months of history, or set them yourself.",
    };
  }

  const { closedToDateCents, projectedAdditionalCents, projectedItems } = cycleChargesWithinWindow(
    txns,
    recurring,
    accountId,
    window,
    today
  );

  return {
    accountId,
    status: 'ok',
    cycle,
    cycleStartDate: window.cycleStartDate,
    cycleCloseDate: window.cycleCloseDate,
    paymentDueDate: window.paymentDueDate,
    closedToDateCents,
    projectedAdditionalCents,
    projectedTotalCents: closedToDateCents + projectedAdditionalCents,
    projectedItems,
    lastDataDate,
    daysSinceLastData,
    stale,
    note: buildBalanceNote(cycle, projectedItems.length, stale, daysSinceLastData),
  };
}
