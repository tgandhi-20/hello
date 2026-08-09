/**
 * "Bills due soon" — Home's third section (DESIGN-V4.md §1/§3, renamed from "Coming
 * up" for plain words). Merges every dated near-term event Tally can already compute
 * — detected recurring charges, each card's payment due date, its statement close
 * date, salary, and the savings transfer — into ONE list, soonest first, windowed to
 * the next `horizonDays` (default 14).
 *
 * Deliberately reuses two already-built, already-checked pure engines rather than
 * re-deriving cadence/cycle maths a second time:
 *   - `buildCashflowCalendar` (src/features/statements/upcoming.ts) for recurring
 *     charges, card payment due dates, salary and the savings transfer.
 *   - `closeDatesWithin` (src/features/statements/cycle.ts) for each card's statement
 *     CLOSE date. `buildCashflowCalendar` computes close dates internally (to work out
 *     a due date's amount) but doesn't itself emit them as their own event — added
 *     here as its own row so a close date genuinely shows up in the merged list.
 *
 * This is a CALENDAR, not a money engine — it answers "what's dated, soon", not
 * "am I OK?" — so it sits alongside `src/money` rather than inside it, and isn't one
 * of the four engines DESIGN-V4.md §0 diagnoses as contradictory.
 *
 * Pure function, no store access, no React — same convention as every other pure
 * module in this codebase.
 *
 * Imports the statements feature's CONCRETE files, never its `index.ts` barrel —
 * that barrel also re-exports React screen components, which pull in `@/ui` and,
 * transitively, `vite-plugin-pwa`'s `virtual:pwa-register` module. That import
 * resolves fine inside Vite's browser bundle but crashes outright under plain
 * Node/tsx (this feature's own `__checks__/run.ts`, and every other check suite in
 * this repo, run there).
 */
import type { AccountId, Cents, DateStr, RecurringSeries, Settings, Txn } from '@/types';
import { addDays, todayStr } from '@/ui/format';
import { buildCashflowCalendar } from '@/features/statements/upcoming';
import { closeDatesWithin, effectiveCycle, type CycleInference } from '@/features/statements/cycle';
import { ACCOUNT_LABEL, CARD_ACCOUNT_IDS } from '@/features/statements/types';

/** DESIGN-V4.md §1: "Bills due soon" — next 14 days. */
export const BILLS_DUE_SOON_HORIZON_DAYS = 14;

export type BillDueSoonKind = 'recurring' | 'card-payment' | 'statement-close' | 'income' | 'savings-transfer';

export interface BillDueSoonItem {
  id: string;
  date: DateStr;
  kind: BillDueSoonKind;
  label: string;
  /** Signed like `Txn.amountCents` (positive = cash out). `null` when there's
   *  genuinely nothing to show — a statement close date has no amount of its own,
   *  it's a date, not a transaction. */
  amountCents: Cents | null;
  /** 'scheduled' = a fixed date Tally is confident about; 'predicted' = projected
   *  from a detected/inferred cadence and could still shift a little. */
  certainty: 'scheduled' | 'predicted';
}

export interface BuildBillsDueSoonParams {
  txns: Txn[];
  recurring: RecurringSeries[];
  settings: Settings;
  /** Defaults to today. Exposed for testability. */
  today?: DateStr;
  horizonDays?: number;
}

/** Stable same-day tie-break: cash events read before the close-date marker,
 *  which is background information rather than something due. Keeps a
 *  re-render from ever visibly reshuffling rows sharing a date. */
function kindRank(kind: BillDueSoonKind): number {
  switch (kind) {
    case 'income':
      return 0;
    case 'savings-transfer':
      return 1;
    case 'card-payment':
      return 2;
    case 'recurring':
      return 3;
    case 'statement-close':
      return 4;
  }
}

/** Build the merged, sorted, `[today, today+horizonDays]`-windowed "bills due soon" list. */
export function buildBillsDueSoon({
  txns,
  recurring,
  settings,
  today = todayStr(),
  horizonDays = BILLS_DUE_SOON_HORIZON_DAYS,
}: BuildBillsDueSoonParams): BillDueSoonItem[] {
  const safeHorizonDays = Number.isFinite(horizonDays) ? Math.max(0, horizonDays) : BILLS_DUE_SOON_HORIZON_DAYS;
  const horizonEnd = addDays(today, safeHorizonDays);

  const cycles: Partial<Record<AccountId, CycleInference>> = {};
  for (const accountId of CARD_ACCOUNT_IDS) {
    cycles[accountId] = effectiveCycle(txns, accountId, settings.statementCycles, today);
  }

  const cashflow = buildCashflowCalendar(txns, recurring, settings, cycles, { today, horizonDays: safeHorizonDays });

  const items: BillDueSoonItem[] = cashflow.events.map((e) => ({
    id: e.sourceId,
    date: e.date,
    kind: e.kind,
    label: e.label,
    amountCents: e.amountCents,
    certainty: e.certainty,
  }));

  for (const accountId of CARD_ACCOUNT_IDS) {
    const cycle = cycles[accountId];
    if (!cycle) continue;
    for (const date of closeDatesWithin(cycle, today, horizonEnd)) {
      items.push({
        id: `statement-close-${accountId}-${date}`,
        date,
        kind: 'statement-close',
        label: `${ACCOUNT_LABEL[accountId]} statement closes`,
        amountCents: null,
        certainty: cycle.source === 'user-override' ? 'scheduled' : 'predicted',
      });
    }
  }

  // Defensive re-window: both upstream helpers already bound their own output to
  // [today, horizonEnd], but the merge is asserted here too rather than trusted
  // blindly — a caller passing a shorter horizonDays than either helper assumed
  // must never leak a later event through.
  return items
    .filter((i) => i.date >= today && i.date <= horizonEnd)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const rankDiff = kindRank(a.kind) - kindRank(b.kind);
      if (rankDiff !== 0) return rankDiff;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
