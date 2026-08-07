/**
 * Seeds the store with the user's real budget (docs/PERSONAL.md §3 category
 * caps, as Budgets for a given month) and real subscriptions (§5, as
 * RecurringSeries). This is what turns a fresh install into *theirs* on first
 * run — see docs/PERSONAL.md §0.
 *
 * NOT wired to any UI here — src/personal/** does not own onboarding or
 * settings screens. Call it from wherever first-run/setup logic lives, e.g.
 * from Settings (Agent 2's src/features/settings/**) or an onboarding flow:
 *
 *   import { applyPersonalPlan } from '@/personal/applyPersonalPlan';
 *   import { useStore } from '@/store/useStore';
 *
 *   const result = await applyPersonalPlan(useStore.getState());
 *   // result: { month: '2026-08', budgetsSet: 15, subscriptionsSeeded: 4 }
 *
 * or scoped to a specific month:
 *
 *   await applyPersonalPlan(useStore.getState(), { month: '2026-09' });
 *
 * Idempotent: re-running it for the same month just re-writes the same
 * budget caps (setBudget is itself idempotent per src/store/useStore.ts), and
 * re-seeding subscriptions reuses any already-seeded (or already-detected)
 * series' id/txnIds/muted state by matching on normalised merchant + cadence,
 * rather than creating duplicates.
 */
import type { Cents, DateStr, MonthStr, RecurringSeries } from '@/types';
import { todayStr, monthOf } from '@/ui/format';
import { normalizeMerchant } from '@/features/transactions/merchant';
import { PERSONAL_CATEGORIES, KNOWN_SUBSCRIPTIONS, CATEGORY_IDS } from './plan';

/**
 * The slice of TallyStore (src/store/useStore.ts, CONTRACTS.md §9) this
 * function needs. Kept as a minimal structural type rather than importing
 * the full store interface, so callers can pass `useStore.getState()`
 * directly without this module taking on a hard dependency on every store
 * method.
 */
export interface ApplyPersonalPlanTarget {
  setBudget(categoryId: string, month: MonthStr, limitCents: Cents): Promise<void>;
  setRecurring(series: RecurringSeries[]): Promise<void>;
  recurring: RecurringSeries[];
}

export interface ApplyPersonalPlanOptions {
  /** Defaults to the current calendar month. */
  month?: MonthStr;
  /** "Today", for computing seeded RecurringSeries.lastSeen/nextDue. Defaults to real today. Exposed for testability. */
  asOf?: DateStr;
  /** Set false to skip seeding budgets. Default true. */
  includeBudgets?: boolean;
  /** Set false to skip seeding subscriptions. Default true. */
  includeSubscriptions?: boolean;
}

export interface ApplyPersonalPlanResult {
  month: MonthStr;
  budgetsSet: number;
  subscriptionsSeeded: number;
}

/** Add `months` whole calendar months to a DateStr, clamping the day to the target month's length. */
function addMonthsToDate(dateStr: DateStr, months: number): DateStr {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  const daysInTargetMonth = new Date(newY, newM, 0).getDate();
  const newD = Math.min(d, daysInTargetMonth);
  return `${newY}-${String(newM).padStart(2, '0')}-${String(newD).padStart(2, '0')}`;
}

/** The next occurrence of `dayOfMonth` on/after `asOf`. */
function nextBillingDate(asOf: DateStr, dayOfMonth: number): DateStr {
  const [y, m] = asOf.split('-').map(Number);
  const daysInThisMonth = new Date(y, m, 0).getDate();
  const clampedDay = Math.min(dayOfMonth, daysInThisMonth);
  const thisMonth = `${y}-${String(m).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
  return thisMonth >= asOf ? thisMonth : addMonthsToDate(thisMonth, 1);
}

function buildKnownSubscriptionSeries(asOf: DateStr, existing: RecurringSeries[]): RecurringSeries[] {
  return KNOWN_SUBSCRIPTIONS.map((sub) => {
    const nextDue = nextBillingDate(asOf, sub.billingDayOfMonth);
    const lastSeen = addMonthsToDate(nextDue, -1);

    // Match on normalised merchant + monthly cadence, not id — so if the
    // recurring radar (src/features/recurring/detect.ts) has already
    // detected this exact subscription from real transactions, re-running
    // applyPersonalPlan reuses its id/txnIds/muted state instead of
    // shadowing it with a second, txn-less entry.
    const prior = existing.find(
      (s) => s.cadence === 'monthly' && normalizeMerchant(s.merchant) === normalizeMerchant(sub.merchant)
    );

    const series: RecurringSeries = {
      id: prior?.id ?? `rec-personal-${sub.id}`,
      merchant: sub.merchant,
      categoryId: CATEGORY_IDS.subscriptions,
      cadence: 'monthly',
      amountCents: sub.amountCents,
      lastSeen: prior?.lastSeen ?? lastSeen,
      nextDue: prior?.nextDue ?? nextDue,
      txnIds: prior?.txnIds ?? [],
      muted: prior?.muted ?? false,
    };
    return series;
  });
}

export async function applyPersonalPlan(
  store: ApplyPersonalPlanTarget,
  options: ApplyPersonalPlanOptions = {}
): Promise<ApplyPersonalPlanResult> {
  const month = options.month ?? monthOf(todayStr());
  const asOf = options.asOf ?? todayStr();
  const includeBudgets = options.includeBudgets ?? true;
  const includeSubscriptions = options.includeSubscriptions ?? true;

  let budgetsSet = 0;
  if (includeBudgets) {
    for (const cat of PERSONAL_CATEGORIES) {
      if (cat.capCents === null) continue;
      await store.setBudget(cat.id, month, cat.capCents);
      budgetsSet++;
    }
  }

  let subscriptionsSeeded = 0;
  if (includeSubscriptions) {
    const seeded = buildKnownSubscriptionSeries(asOf, store.recurring);
    const seededIds = new Set(seeded.map((s) => s.id));
    const untouched = store.recurring.filter((s) => !seededIds.has(s.id));
    await store.setRecurring([...untouched, ...seeded]);
    subscriptionsSeeded = seeded.length;
  }

  return { month, budgetsSet, subscriptionsSeeded };
}
