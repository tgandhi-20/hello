/**
 * Upcoming bills / cashflow calendar — a forward view of the next 60 days:
 * every predicted recurring charge, each card's payment due date, salary, and
 * the savings transfer, with a running projected balance so a squeeze is
 * visible before it happens (docs/PERSONAL.md §6's "October 2026 trap" is the
 * proof this kind of look-ahead genuinely matters for this user).
 *
 * WHAT "CASH" MEANS HERE — read before changing the running-balance math:
 * an individual card charge (Netflix on Amex) does not, by itself, leave the
 * user's everyday account — only the LUMP payment on the card's due date
 * does. So:
 *   - A recurring series linked to a CARD account (`isCardAccount` —
 *     currently `cba`/`amex`, see types.ts's honesty flag on that
 *     assumption) is listed as an event (so the user can see what's driving
 *     the card total) but does NOT move the running cash balance itself.
 *   - A recurring series linked to any other account, or with NO account
 *     linked at all, is treated as a direct debit from cash on its own due
 *     date. Defaulting an unlinked series to "hits cash" is the
 *     conservative choice — the safer direction for a tool whose job is to
 *     warn about a squeeze is to assume money leaves earlier, not later.
 *   - Each card's own "payment due" event carries the lump sum instead.
 *
 * ACCURACY CEILING for a card's OWN due-date amount, honestly stated. Each
 * due date within the horizon is due for a SPECIFIC statement (reconstructed
 * via `previousBefore(dueDate, closingDay)` in `dates.ts`), and which basis
 * applies falls out of where that statement's own close date sits relative
 * to today:
 *   - `'actual-closed'` — the statement already closed before today. Every
 *     charge in it is a real, posted transaction; nothing is projected. This
 *     is the MOST trustworthy figure this file produces (it's not even a
 *     prediction).
 *   - `'projected-cycle'` — the statement is still open (this is the SAME
 *     window `balance.ts`'s `computeCurrentCycleBalance` reports). Actual
 *     charges-to-date plus confirmed/detected recurring charges still to
 *     come before it closes.
 *   - `'typical-monthly-estimate'` — the statement hasn't started
 *     accumulating yet (a card's next-NEXT payment, only reachable within a
 *     ~60-day horizon on a ~monthly cycle). There is no posted data to sum
 *     at all, so this falls back to that card's linked recurring series'
 *     monthly-equivalent load — necessarily excluding one-off spending,
 *     which typically UNDER-states the real bill. The deliberately safer
 *     direction, per "prefer under-claiming".
 *   - `'unknown'` — none of the above produced a number. Contributes $0 to
 *     the running balance rather than a fabricated figure.
 *
 * Pure function, no store access.
 */
import type { AccountId, Cents, DateStr, RecurringSeries, Settings, Txn } from '@/types';
import { addDays, todayStr } from '@/ui/format';
import { cadenceNominalDays, monthlyEquivalentCents } from '@/features/recurring/detect';
import { PLAN_DEFAULTS } from '@/personal/plan';
import { cycleChargesWithinWindow } from './balance';
import type { CycleInference } from './cycle';
import { dueDatesWithin } from './cycle';
import { addMonthsClamped, nextOnOrAfter, previousBefore } from './dates';
import { ACCOUNT_LABEL, isCardAccount } from './types';

export type CashflowEventKind = 'recurring' | 'card-payment' | 'income' | 'savings-transfer';
export type CardPaymentAmountBasis = 'actual-closed' | 'projected-cycle' | 'typical-monthly-estimate' | 'unknown';

export interface CashflowEvent {
  date: DateStr;
  kind: CashflowEventKind;
  label: string;
  /** Signed like `Txn.amountCents`: positive = cash out, negative = cash in. */
  amountCents: Cents;
  accountId?: AccountId;
  /** 'scheduled' = a fixed date Tally is confident about (a due date, payday); 'predicted' = projected from an auto-detected or cadence-stepped series and could still shift a little. */
  certainty: 'scheduled' | 'predicted';
  sourceId: string;
  /** Only set on `kind: 'card-payment'` — how the amount shown was derived. */
  amountBasis?: CardPaymentAmountBasis;
  /** Whether this event's amount was actually added into the running balance (see file header — card-linked recurring charges are shown but not double-counted). */
  affectsBalance: boolean;
}

export interface CashflowEventWithBalance extends CashflowEvent {
  runningBalanceCents: Cents;
}

export interface CashflowSummary {
  startDate: DateStr;
  endDate: DateStr;
  startingBalanceCents: Cents;
  events: CashflowEventWithBalance[];
  lowestPointCents: Cents;
  lowestPointDate: DateStr | null;
  /** True if the running balance dips below zero anywhere in the window. */
  squeezeWarning: boolean;
}

export interface BuildCashflowOptions {
  today?: DateStr;
  horizonDays?: number;
  /**
   * Tally has no field for "current everyday-account balance" (only
   * `Settings.goalCurrentBalanceCents`, which is specifically the savings
   * balance) — so this defaults to 0 and the running figure is a NET CHANGE
   * from today, not a claimed real balance. A caller/UI may pass the user's
   * own stated starting figure for a personalised view without Tally
   * pretending to know it on its own.
   */
  startingBalanceCents?: Cents;
}

type CashflowSettingsSlice = Pick<Settings, 'paydayDayOfMonth' | 'monthlyIncomeCents' | 'savingsTargetCents'> &
  Partial<Pick<Settings, 'transferToSavingsDayOfMonth'>>;

function projectSeriesOccurrences(series: RecurringSeries, today: DateStr, horizonEnd: DateStr): DateStr[] {
  if (series.muted) return [];
  const step = cadenceNominalDays(series.cadence);
  if (!Number.isFinite(step) || step <= 0) return [];

  const dates: DateStr[] = [];
  let d = series.nextDue;
  let guard = 0;
  // A stale `nextDue` (detection/import lagging behind today) is rolled
  // forward first so nothing "predicted" ever lands in the past.
  while (d < today && guard < 80) {
    d = addDays(d, step);
    guard++;
  }
  guard = 0;
  while (d <= horizonEnd && guard < 80) {
    dates.push(d);
    d = addDays(d, step);
    guard++;
  }
  return dates;
}

/** That card's typical monthly recurring load — used only as the fallback estimate for a due date too far out to have real posted charges yet. */
function typicalMonthlyCardLoadCents(recurring: RecurringSeries[], accountId: AccountId): Cents {
  return recurring
    .filter((s) => !s.muted && s.accountId === accountId && s.amountCents > 0)
    .reduce((sum, s) => sum + monthlyEquivalentCents(s), 0);
}

/**
 * Build the 60-day (default) cashflow calendar.
 *
 * @param txns        All transactions (needed to total up an already-closed statement for a near-term due date — see `'actual-closed'` above).
 * @param recurring   Detected + confirmed recurring series (store's `recurring`).
 * @param settings    Slice of `Settings` this needs — payday, income, savings target, and (optionally) the routine feature's `transferToSavingsDayOfMonth` override, read structurally rather than imported from that feature.
 * @param cycles      Each card account's inferred/overridden cycle (from `cycle.ts`), so every due date within the horizon can be projected, not just the next one.
 */
export function buildCashflowCalendar(
  txns: Txn[],
  recurring: RecurringSeries[],
  settings: CashflowSettingsSlice,
  cycles: Partial<Record<AccountId, CycleInference>>,
  opts: BuildCashflowOptions = {}
): CashflowSummary {
  const today = opts.today ?? todayStr();
  const horizonDays = opts.horizonDays ?? 60;
  const horizonEnd = addDays(today, horizonDays);
  const startingBalanceCents = opts.startingBalanceCents ?? 0;

  const raw: CashflowEvent[] = [];

  // ---- Recurring charges (every occurrence projected within the horizon) ----
  for (const series of recurring) {
    if (series.muted || series.amountCents === 0) continue;
    const dates = projectSeriesOccurrences(series, today, horizonEnd);
    const cardLinked = isCardAccount(series.accountId);
    for (const date of dates) {
      raw.push({
        date,
        kind: 'recurring',
        label: series.merchant,
        amountCents: series.amountCents,
        accountId: series.accountId,
        certainty: series.confirmed ? 'scheduled' : 'predicted',
        sourceId: `${series.id}::${date}`,
        affectsBalance: !cardLinked,
      });
    }
  }

  // ---- Card payment due dates ----
  for (const accountId of Object.keys(cycles) as AccountId[]) {
    const cycle = cycles[accountId];
    if (!cycle || cycle.closingDay == null || cycle.dueDay == null) continue;
    const dueDates = dueDatesWithin(cycle, today, horizonEnd);

    for (const date of dueDates) {
      // Reconstruct exactly which statement this due date is FOR: the close
      // that precedes it. Where that close date sits relative to today
      // decides which honesty basis applies (see file header).
      const cycleCloseDate = previousBefore(date, cycle.closingDay);
      const cycleStartDate = addMonthsClamped(cycleCloseDate, -1);

      let amountCents: Cents = 0;
      let amountBasis: CardPaymentAmountBasis = 'unknown';

      if (cycleStartDate > today) {
        // The statement this due date is for hasn't even started
        // accumulating yet — nothing posted, and projecting from a single
        // stored `nextDue` per series would badly undercount. Fall back to
        // a clearly-labelled typical-load estimate instead.
        const typical = typicalMonthlyCardLoadCents(recurring, accountId);
        if (typical > 0) {
          amountCents = typical;
          amountBasis = 'typical-monthly-estimate';
        }
      } else {
        const { closedToDateCents, projectedAdditionalCents } = cycleChargesWithinWindow(
          txns,
          recurring,
          accountId,
          { cycleStartDate, cycleCloseDate, paymentDueDate: date },
          today
        );
        amountCents = closedToDateCents + projectedAdditionalCents;
        amountBasis = cycleCloseDate < today ? 'actual-closed' : 'projected-cycle';
      }

      raw.push({
        date,
        kind: 'card-payment',
        label: `${ACCOUNT_LABEL[accountId]} payment due`,
        amountCents,
        accountId,
        certainty: cycle.source === 'user-override' ? 'scheduled' : 'predicted',
        sourceId: `card-payment-${accountId}-${date}`,
        amountBasis,
        affectsBalance: amountBasis !== 'unknown',
      });
    }
  }

  // ---- Salary (docs/PERSONAL.md §8: "15th — salary lands") ----
  if (settings.monthlyIncomeCents > 0) {
    const paydayOfMonth = settings.paydayDayOfMonth || PLAN_DEFAULTS.paydayDayOfMonth;
    let payday = nextOnOrAfter(today, paydayOfMonth);
    let guard = 0;
    while (payday <= horizonEnd && guard < 4) {
      raw.push({
        date: payday,
        kind: 'income',
        label: 'Salary',
        amountCents: -settings.monthlyIncomeCents,
        certainty: 'scheduled',
        sourceId: `salary-${payday}`,
        affectsBalance: true,
      });
      payday = nextOnOrAfter(addDays(payday, 1), paydayOfMonth);
      guard++;
    }
  }

  // ---- Savings transfer (docs/PERSONAL.md §8: "16th — automatic transfer to savings") ----
  if (settings.savingsTargetCents > 0) {
    const transferDayOfMonth = settings.transferToSavingsDayOfMonth ?? PLAN_DEFAULTS.autoTransferDayOfMonth;
    let transfer = nextOnOrAfter(today, transferDayOfMonth);
    let guard = 0;
    while (transfer <= horizonEnd && guard < 4) {
      raw.push({
        date: transfer,
        kind: 'savings-transfer',
        label: 'Transfer to savings',
        amountCents: settings.savingsTargetCents,
        certainty: 'scheduled',
        sourceId: `savings-transfer-${transfer}`,
        affectsBalance: true,
      });
      transfer = nextOnOrAfter(addDays(transfer, 1), transferDayOfMonth);
      guard++;
    }
  }

  raw.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // `amountCents` is signed like `Txn.amountCents` (positive = cash OUT,
  // negative = cash IN), so a running CASH balance moves the OPPOSITE
  // direction of the signed amount: subtract it, don't add it. (A spend of
  // +1450c reduces cash by $14.50; an income of -645700c increases cash by
  // $6,457 — `running -= amountCents` gets both right in one line.)
  let running = startingBalanceCents;
  let lowest = startingBalanceCents;
  let lowestDate: DateStr | null = null;
  const events: CashflowEventWithBalance[] = raw.map((e) => {
    if (e.affectsBalance) running -= e.amountCents;
    if (running < lowest) {
      lowest = running;
      lowestDate = e.date;
    }
    return { ...e, runningBalanceCents: running };
  });

  return {
    startDate: today,
    endDate: horizonEnd,
    startingBalanceCents,
    events,
    lowestPointCents: lowest,
    lowestPointDate: lowestDate,
    squeezeWarning: lowest < 0,
  };
}

