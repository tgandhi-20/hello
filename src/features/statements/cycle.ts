/**
 * Statement cycle inference — learn each card's billing cycle from imported
 * transaction history rather than asking the user to configure it.
 *
 * TWO signals, both structural (never text-matched against a description —
 * CONTRACTS.md §6 is explicit that bank export text/layout is not reliable):
 *
 *  1. DUE DAY — a "payment received" style transaction repeats monthly. This
 *     is detected purely by shape: money IN (negative `amountCents`, this
 *     codebase's income sign) that is large relative to the account's
 *     typical charge (>= 3x the median charge) — the same "look at shape,
 *     not the label" principle the CSV importer already uses for sign
 *     detection. The day-of-month those payments land on, taken as a median
 *     across however many are observed, is the due day.
 *
 *  2. CLOSING DAY — genuinely NOT observable from a CSV: nothing in a bank
 *     export marks "this is where the statement cut off". It is estimated as
 *     a fixed number of days before the due day, using a documented typical
 *     cycle length for the issuer (Amex AU: ~25 days — this is exactly what
 *     the user's own plan implies: "Amex due the 11th" per docs/PERSONAL.md
 *     §6/§8). Because this is always a derived assumption, not a direct
 *     observation, closing-day confidence can never be reported as 'high' —
 *     only 'medium' at best, capped by how well-observed the due day itself
 *     is. See CONFIDENCE LEVELS below.
 *
 * CONFIDENCE LEVELS — never present an inferred date as certain when it was
 * guessed:
 *   'high'    — due day only, and only with >= 3 payment occurrences whose
 *               day-of-month agrees within a few days of each other.
 *   'medium'  — 2 consistent occurrences (due day), or a due day inferred
 *               well enough to trust the closing-day estimate loosely.
 *   'low'     — 1 occurrence, or payments that don't land on a consistent day.
 *   'unknown' — no payment-like transactions at all. Falls back to `null`
 *               dates, NEVER a fabricated one, and the UI must say so.
 *
 * A user override (`Settings.statementCycles[accountId]`, persisted via the
 * frozen §9 store API) always wins over inference — see `Settings.statementCycles`
 * in `types.ts`. Overrides are reported at 'high' confidence: not because
 * they're independently verified, but because they're the user's own stated
 * fact, which Tally has no basis to second-guess.
 *
 * Pure functions, no store access — easy to check in isolation.
 */
import type { AccountId, DateStr, Txn } from '@/types';
import { todayStr } from '@/ui/format';
import type { StatementCycleOverride } from './types';
import { ACCOUNT_LABEL } from './types';
import { addMonthsClamped, dayOfMonthOf, nextAfter, nextOnOrAfter } from './dates';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';
export type CycleSource = 'user-override' | 'inferred' | 'default';

export interface CycleInference {
  accountId: AccountId;
  /** Day-of-month the statement closes, or `null` when genuinely unknown. */
  closingDay: number | null;
  /** Day-of-month payment is due, or `null` when genuinely unknown. */
  dueDay: number | null;
  closingDayConfidence: ConfidenceLevel;
  dueDayConfidence: ConfidenceLevel;
  source: CycleSource;
  /** How many payment-like transactions were used to derive this (0 if none / overridden). */
  paymentOccurrences: number;
  /** Plain-language explanation of how this was derived — shown directly in the UI, never hidden behind a badge alone. */
  note: string;
}

export interface CycleWindow {
  /** Exclusive lower bound of the currently-open statement (the previous close). */
  cycleStartDate: DateStr;
  /** Inclusive upper bound of the currently-open statement (the upcoming close). */
  cycleCloseDate: DateStr;
  /** When payment for `cycleCloseDate`'s statement is due. */
  paymentDueDate: DateStr;
}

/**
 * Typical AU issuer statement length (close → due) in days, used ONLY as a
 * documented assumption when the closing day can't be independently derived
 * from anything in a CSV. Amex AU: ~25 days — chosen so that a due day of the
 * 11th backs out to a closing day consistent with docs/PERSONAL.md's own
 * numbers. Not a guarantee for any specific statement; always disclosed via
 * `closingDayConfidence` (capped below 'high') and `note`.
 */
const TYPICAL_CYCLE_LENGTH_DAYS: Partial<Record<AccountId, number>> = {
  amex: 25,
};
/** Fallback for any card account without a documented typical length. */
const DEFAULT_CYCLE_LENGTH_DAYS = 25;

const MIN_PAYMENTS_FOR_HIGH_CONFIDENCE = 3;
const MIN_PAYMENTS_FOR_MEDIUM_CONFIDENCE = 2;
/** A candidate "payment" must be at least this many times the account's median charge — big enough that an ordinary refund is unlikely to be mistaken for a monthly card payoff. */
const PAYMENT_SIZE_MULTIPLE = 3;
/** Day-of-month tolerance when checking that observed payments recur on a stable day (weekends/processing shift a due date by a few days in real life). */
const DAY_OF_MONTH_TOLERANCE = 3;

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Wrap into 1..28 — always a valid day-of-month, in every month including February. */
function normaliseDayOfMonth(n: number): number {
  let d = Math.round(n) % 28;
  if (d <= 0) d += 28;
  return d;
}

/**
 * Structural detection of "payment received" style transactions: money IN
 * that dwarfs the account's typical charge. Deliberately does NOT match on
 * description text ("PAYMENT THANK YOU", "PAYMENT RECEIVED", ...) — bank
 * export wording is not reliable (CONTRACTS.md §6), and shape survives a
 * format nobody has tested against.
 */
function findPaymentTxns(accountTxns: Txn[]): Txn[] {
  const charges = accountTxns.filter((t) => t.amountCents > 0 && !t.excluded);
  const incoming = accountTxns.filter((t) => t.amountCents < 0 && !t.excluded);
  if (charges.length === 0 || incoming.length === 0) return [];
  const medianCharge = median(charges.map((t) => t.amountCents));
  if (medianCharge <= 0) return [];
  return incoming.filter((t) => Math.abs(t.amountCents) >= medianCharge * PAYMENT_SIZE_MULTIPLE);
}

function buildInferredNote(
  accountId: AccountId,
  occurrences: number,
  consistent: number,
  cycleLengthDays: number,
  dueDayConfidence: ConfidenceLevel
): string {
  const label = ACCOUNT_LABEL[accountId] ?? accountId;
  const dueBit = `Learned the due day from ${occurrences} payment-like transaction${occurrences === 1 ? '' : 's'} on ${label} (${consistent} landed within a few days of each other)${dueDayConfidence === 'low' ? " — not a consistent enough rhythm to trust much yet" : ''}.`;
  const closeBit = `The closing day isn't in any CSV — it's estimated as ${cycleLengthDays} days before the payment date, a typical length for this kind of card, not something Tally has verified against your actual statement.`;
  return `${dueBit} ${closeBit}`;
}

export interface InferCycleOptions {
  today?: DateStr;
  override?: StatementCycleOverride;
}

/** Infer (or apply an override for) one account's statement cycle from its transaction history. */
export function inferCycle(txns: Txn[], accountId: AccountId, opts: InferCycleOptions = {}): CycleInference {
  if (opts.override) {
    return {
      accountId,
      closingDay: normaliseDayOfMonth(opts.override.closingDay),
      dueDay: normaliseDayOfMonth(opts.override.dueDay),
      closingDayConfidence: 'high',
      dueDayConfidence: 'high',
      source: 'user-override',
      paymentOccurrences: 0,
      note: 'You set these dates yourself — Tally uses them as-is rather than estimating.',
    };
  }

  const accountTxns = txns.filter((t) => t.account === accountId);
  const payments = findPaymentTxns(accountTxns).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (payments.length === 0) {
    return {
      accountId,
      closingDay: null,
      dueDay: null,
      closingDayConfidence: 'unknown',
      dueDayConfidence: 'unknown',
      source: 'default',
      paymentOccurrences: 0,
      note:
        "No payment-like transactions found yet for this account — Tally needs at least a couple of " +
        'imported statement cycles before it can learn the billing rhythm. Set the closing and due days ' +
        'yourself in the meantime, or import more history.',
    };
  }

  const paymentDays = payments.map((t) => dayOfMonthOf(t.date));
  const dueDay = normaliseDayOfMonth(median(paymentDays));
  const consistentPayments = paymentDays.filter((d) => Math.abs(d - dueDay) <= DAY_OF_MONTH_TOLERANCE).length;

  const dueDayConfidence: ConfidenceLevel =
    consistentPayments >= MIN_PAYMENTS_FOR_HIGH_CONFIDENCE
      ? 'high'
      : consistentPayments >= MIN_PAYMENTS_FOR_MEDIUM_CONFIDENCE
        ? 'medium'
        : 'low';

  const cycleLengthDays = TYPICAL_CYCLE_LENGTH_DAYS[accountId] ?? DEFAULT_CYCLE_LENGTH_DAYS;
  const closingDay = normaliseDayOfMonth(dueDay - cycleLengthDays);
  // Closing day is always a derived assumption (see file header) — never
  // reported more confidently than 'medium', and only that high when the due
  // day itself is trustworthy.
  const closingDayConfidence: ConfidenceLevel = dueDayConfidence === 'low' ? 'low' : 'medium';

  return {
    accountId,
    closingDay,
    dueDay,
    closingDayConfidence,
    dueDayConfidence,
    source: 'inferred',
    paymentOccurrences: payments.length,
    note: buildInferredNote(accountId, payments.length, consistentPayments, cycleLengthDays, dueDayConfidence),
  };
}

/** `inferCycle`, but reading the override straight out of `Settings.statementCycles`. */
export function effectiveCycle(
  txns: Txn[],
  accountId: AccountId,
  statementCycles: Partial<Record<AccountId, StatementCycleOverride>> | undefined,
  today: DateStr = todayStr()
): CycleInference {
  return inferCycle(txns, accountId, { today, override: statementCycles?.[accountId] });
}

/**
 * The currently-open statement window as of `today`, given a cycle's closing
 * and due days. Pure integer-month arithmetic throughout (see `dates.ts`) —
 * a December→January crossing falls out of `addMonthsClamped`/`nextAfter`
 * automatically, no special-casing needed. Returns `null` when the cycle is
 * unknown (insufficient history, no override) — callers must treat that as
 * "can't compute this yet", never substitute a guess.
 */
export function currentCycleWindow(cycle: Pick<CycleInference, 'closingDay' | 'dueDay'>, today: DateStr): CycleWindow | null {
  if (cycle.closingDay == null || cycle.dueDay == null) return null;
  const cycleCloseDate = nextOnOrAfter(today, cycle.closingDay);
  const cycleStartDate = addMonthsClamped(cycleCloseDate, -1);
  const paymentDueDate = nextAfter(cycleCloseDate, cycle.dueDay);
  return { cycleStartDate, cycleCloseDate, paymentDueDate };
}

/** All statement-close dates for this cycle falling within `[today, horizonEnd]`, in order. */
export function closeDatesWithin(cycle: Pick<CycleInference, 'closingDay'>, today: DateStr, horizonEnd: DateStr): DateStr[] {
  if (cycle.closingDay == null) return [];
  const dates: DateStr[] = [];
  let candidate = nextOnOrAfter(today, cycle.closingDay);
  let guard = 0;
  while (candidate <= horizonEnd && guard < 24) {
    dates.push(candidate);
    candidate = addMonthsClamped(candidate, 1);
    guard++;
  }
  return dates;
}

/** All payment-due dates for this cycle falling within `[today, horizonEnd]`, in order. */
export function dueDatesWithin(cycle: Pick<CycleInference, 'dueDay'>, today: DateStr, horizonEnd: DateStr): DateStr[] {
  if (cycle.dueDay == null) return [];
  const dates: DateStr[] = [];
  let candidate = nextOnOrAfter(today, cycle.dueDay);
  let guard = 0;
  while (candidate <= horizonEnd && guard < 24) {
    dates.push(candidate);
    candidate = addMonthsClamped(candidate, 1);
    guard++;
  }
  return dates;
}
