/**
 * "Needs you" — Today screen's fifth and only OPTIONAL section (DESIGN-V3.md
 * §4.5). Surfaces exactly the things that genuinely need a human decision
 * right now: uncategorised imported transactions, a detected price rise on a
 * recurring series, a card statement cycle Tally still can't predict
 * confidently, and any monthly routine item due today or overdue.
 *
 * "A section with nothing to say must not render" (DESIGN-V3.md §4) — this
 * function is the "nothing to say" test: when none of the above apply it
 * returns an empty array, and `NeedsYouSection` renders nothing at all for
 * an empty list. See `__checks__/run.ts`'s empty-state suppression checks.
 *
 * Pure function, no store/React access — `TodayScreen` reads `useStore` and
 * the routine checklist hook and passes plain state in, same convention as
 * every other pure module in this feature.
 *
 * Imports the recurring/statements/routine features' CONCRETE files, never
 * their `index.ts` barrels — see `comingUp.ts`'s doc comment for why: those
 * barrels also re-export React screen components, which pull in `@/ui` and,
 * transitively, `vite-plugin-pwa`'s `virtual:pwa-register` module — fine in
 * Vite's browser bundle, fatal under plain Node/tsx, which is exactly how
 * this feature's (and every other feature's) `__checks__/run.ts` runs.
 */
import type { Cents, DateStr, RecurringSeries, Settings, Txn } from '@/types';
import { monthOf, todayStr } from '@/ui/format';
import { CATEGORY_IDS } from '@/personal/plan';
import { priceIncreases } from '@/features/recurring/detect';
import { effectiveCycle, type ConfidenceLevel } from '@/features/statements/cycle';
import { ACCOUNT_LABEL, CARD_ACCOUNT_IDS } from '@/features/statements/types';
import { resolveMonthlyItems } from '@/features/routine/items';
import type { RoutineMonthState } from '@/features/routine/types';

export type NeedsYouKind = 'uncategorised' | 'price-rise' | 'unconfirmed-cycle' | 'routine';

export interface NeedsYouItem {
  id: string;
  kind: NeedsYouKind;
  title: string;
  subtitle: string;
  /** Only set for kinds that carry a figure worth showing (a price rise). */
  amountCents?: Cents;
  /** Where tapping this row should take the user. */
  to: string;
}

export interface BuildNeedsYouParams {
  txns: Txn[];
  recurring: RecurringSeries[];
  settings: Settings;
  /** This month's routine checklist tick state (`useRoutineChecklist().state.current`). */
  routineState: RoutineMonthState;
  /** Defaults to today. Exposed for testability. */
  today?: DateStr;
}

/** Confidence levels low enough that Tally genuinely still needs the user's help —
 *  'medium' is left out on purpose: a cycle with 2 consistent observations is already
 *  useful enough not to nag about, it just isn't 'high' yet. */
const NEEDS_CONFIRMATION: ReadonlySet<ConfidenceLevel> = new Set(['low', 'unknown']);

export function buildNeedsYou({
  txns,
  recurring,
  settings,
  routineState,
  today = todayStr(),
}: BuildNeedsYouParams): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];

  // 1. Uncategorised imported transactions — an import the user can't quickly
  //    clean up is an import they stop trusting (DESIGN-V3.md §5).
  const uncategorised = txns.filter(
    (t) => !t.excluded && t.source === 'csv' && t.categoryId === CATEGORY_IDS.other
  );
  if (uncategorised.length > 0) {
    items.push({
      id: 'uncategorised',
      kind: 'uncategorised',
      title: `${uncategorised.length} uncategorised transaction${uncategorised.length === 1 ? '' : 's'}`,
      subtitle: 'From an import — a quick pass keeps categories trustworthy',
      to: '/spending/transactions',
    });
  }

  // 2. Detected price rises on recurring series (already filtered to
  //    non-muted, genuinely-risen series by `priceIncreases`).
  for (const series of priceIncreases(recurring)) {
    items.push({
      id: `price-rise-${series.id}`,
      kind: 'price-rise',
      title: `${series.merchant} went up`,
      subtitle: 'Detected price rise on a recurring charge',
      amountCents: series.priceIncreaseCents,
      to: '/plan/recurring',
    });
  }

  // 3. Card statement cycles Tally can't confidently predict yet — only
  //    surfaced for a card that actually has transaction history (otherwise
  //    this isn't "needs you", it's just "no data yet", which isn't actionable).
  for (const accountId of CARD_ACCOUNT_IDS) {
    const hasData = txns.some((t) => t.account === accountId);
    if (!hasData) continue;
    const cycle = effectiveCycle(txns, accountId, settings.statementCycles, today);
    if (cycle.source === 'user-override') continue;
    if (!NEEDS_CONFIRMATION.has(cycle.dueDayConfidence)) continue;
    items.push({
      id: `unconfirmed-cycle-${accountId}`,
      kind: 'unconfirmed-cycle',
      title: `${ACCOUNT_LABEL[accountId]} statement cycle`,
      subtitle: "Tally is still guessing the dates — confirm them for sharper predictions",
      to: '/plan/statements',
    });
  }

  // 4. Monthly routine items due today or overdue. Deliberately excludes the
  //    always-due daily "log spending" item — same convention as the old
  //    RoutineCard: a fresh "due" every single day means it could never go
  //    quiet, which defeats the point of this section only appearing when it
  //    genuinely has something to say.
  const resolved = resolveMonthlyItems(monthOf(today), settings, routineState, today);
  for (const item of resolved) {
    if (item.done || item.dueDate > today) continue;
    items.push({
      id: `routine-${item.id}`,
      kind: 'routine',
      title: item.label,
      subtitle: item.overdue ? 'Overdue' : 'Due today',
      to: '/plan/routine',
    });
  }

  return items;
}
