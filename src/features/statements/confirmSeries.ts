/**
 * Confirm / edit / unconfirm a detected recurring series — the user's own ask,
 * "can recurring transactions be saved too". These are pure functions that
 * produce a new `RecurringSeries`; the caller persists it via the store's
 * frozen §9 API (`setRecurring`), never IndexedDB/crypto directly.
 *
 * Once confirmed, `detectRecurring` (src/features/recurring/detect.ts) treats
 * the edited fields as authoritative and stops recomputing them — see that
 * file's doc comment for the mechanics this relies on.
 */
import type { AccountId, Cents, DateStr, RecurringCadence, RecurringSeries } from '@/types';

export interface ConfirmSeriesEdits {
  amountCents?: Cents;
  cadence?: RecurringCadence;
  nextDue?: DateStr;
  categoryId?: string;
  /** Which account/card this series' charges hit — the link that makes per-card statement prediction possible. */
  accountId?: AccountId;
}

/** Mark a series confirmed, applying any edits the user made. Unspecified fields keep their current (detected) value. */
export function confirmSeries(series: RecurringSeries, edits: ConfirmSeriesEdits = {}, now: number = Date.now()): RecurringSeries {
  return {
    ...series,
    amountCents: edits.amountCents ?? series.amountCents,
    cadence: edits.cadence ?? series.cadence,
    nextDue: edits.nextDue ?? series.nextDue,
    categoryId: edits.categoryId ?? series.categoryId,
    accountId: edits.accountId ?? series.accountId,
    confirmed: true,
    confirmedAt: now,
  };
}

/** Edit an already-confirmed series (same as `confirmSeries`, named for clarity at call sites). */
export const editConfirmedSeries = confirmSeries;

/** Revert a series to fully-automatic: the next detection pass is free to recompute it again. */
export function unconfirmSeries(series: RecurringSeries): RecurringSeries {
  return { ...series, confirmed: false };
}

/** Replace one series by id within a list — the usual shape needed before calling `store.setRecurring`. */
export function replaceSeries(all: RecurringSeries[], updated: RecurringSeries): RecurringSeries[] {
  return all.map((s) => (s.id === updated.id ? updated : s));
}
