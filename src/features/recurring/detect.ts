/**
 * Recurring / subscription detection engine.
 *
 * Approach: cluster spend transactions by normalised merchant, then within each
 * merchant sub-cluster by amount (a tolerance band, not exact equality — utilities are
 * never identical), then check whether the dated occurrences fall at a regular cadence
 * within a tolerant window (a monthly bill due the 3rd may land the 2nd or 5th; weekends
 * shift things). Pure functions, no store dependency — easy to unit-test in isolation.
 */
import type { Category, Cents, DateStr, RecurringCadence, RecurringSeries, Txn } from '@/types';
import { normalizeMerchant } from '@/features/transactions/merchant';
import { todayStr } from '@/ui/format';

export interface DetectionOptions {
  /** Minimum occurrences in a cluster before it's confident enough to surface. */
  minOccurrences: number;
  /** Relative amount tolerance for clustering, e.g. 0.15 = within 15% of the cluster anchor. */
  amountTolerancePct: number;
  /** Absolute floor for the amount tolerance band, so tiny amounts don't over-split. */
  amountToleranceFlatCents: Cents;
  /** Fraction of intervals that must land within a cadence's tolerance window. */
  minCadenceConfidence: number;
  /** "Today", injectable for deterministic tests. */
  today: DateStr;
}

export const DEFAULT_OPTIONS: DetectionOptions = {
  // 3 is a deliberate floor, not a preference: a monthly bill (rent, a subscription)
  // only produces 3 occurrences in a fresh 90-day history, and that's exactly the
  // window a brand-new install starts with. Requiring 4+ would mean rent — the anchor
  // case this whole feature is judged on — doesn't show up for a user's first month on
  // the app. The trade-off is real: with only 2 intervals, a coincidental repeat (the
  // same cheap lunch spot visited three times, roughly a week apart, purely by chance)
  // can occasionally pass the cadence check below. See detectRecurring's doc comment
  // and the report for how that's mitigated (amount tolerance, confidence bar, and the
  // user-facing mute/confirm control) rather than eliminated outright.
  minOccurrences: 3,
  // Wider than it looks at first glance, and deliberately so: this band gates cluster
  // *membership* (chain-linked, see clusterByAmount), not what counts as "a price
  // increase worth flagging" (that's the separate, tighter 5%/$1 check below, near
  // `priceIncreaseThreshold`). A band tight enough to keep unrelated same-merchant
  // purchases apart (a $12 lunch vs. a $95 catering order at the same place) but loose
  // enough that a genuinely large hike — the case this feature exists for — doesn't get
  // excluded from its own series and silently vanish instead of being flagged.
  amountTolerancePct: 0.3,
  amountToleranceFlatCents: 500,
  minCadenceConfidence: 0.7,
  // Local-calendar-day default (CONTRACTS.md §3 dates are local, not UTC). In
  // Australia (UTC+10/+11), `new Date().toISOString().slice(0,10)` reads as
  // *yesterday* for the first ~10-11 hours of every local day — dormant today
  // because every real call site passes an explicit local `today`, but a trap
  // for the next one that doesn't.
  today: todayStr(),
};

interface CadenceDef {
  cadence: RecurringCadence;
  nominalDays: number;
  toleranceDays: number;
}

// Weekend/date-shift tolerance grows with the nominal interval — a yearly bill has more
// room to drift a few days than a weekly one.
const CADENCES: CadenceDef[] = [
  { cadence: 'weekly', nominalDays: 7, toleranceDays: 2 },
  { cadence: 'fortnightly', nominalDays: 14, toleranceDays: 3 },
  { cadence: 'monthly', nominalDays: 30.44, toleranceDays: 4 },
  { cadence: 'quarterly', nominalDays: 91.3, toleranceDays: 7 },
  { cadence: 'yearly', nominalDays: 365.25, toleranceDays: 10 },
];

function parseYMD(d: DateStr): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((parseYMD(b) - parseYMD(a)) / 86_400_000);
}

function addDaysUTC(d: DateStr, days: number): DateStr {
  const ms = parseYMD(d) + Math.round(days) * 86_400_000;
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mode<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Group a merchant's transactions into amount clusters via a tolerance band, not exact
 * equality — utilities are never identical. Chain-linked in date order: each txn is
 * compared against the *previous* member of the cluster, not the cluster's centroid.
 * That distinction matters for price-increase detection — a centroid/running-average
 * anchor gets dragged down by a cluster's earlier, cheaper occurrences, so a genuine
 * (and genuinely interesting) price hike can end up just outside the band and get
 * split into its own too-small cluster, silently disappearing from the radar instead
 * of being flagged. Chain linkage tracks gradual (or one-off) drift the way a real bill
 * does: this quarter's amount is judged against last quarter's, not against a year ago.
 */
function clusterByAmount(txns: Txn[], opts: DetectionOptions): Txn[][] {
  const sorted = [...txns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const clusters: Txn[][] = [];
  let current: Txn[] = [];
  let anchor = 0;

  for (const t of sorted) {
    if (current.length === 0) {
      current = [t];
      anchor = t.amountCents;
      continue;
    }
    const band = Math.max(anchor * opts.amountTolerancePct, opts.amountToleranceFlatCents);
    if (Math.abs(t.amountCents - anchor) <= band) {
      current.push(t);
      anchor = t.amountCents; // chain-link: next comparison is against *this* occurrence
    } else {
      clusters.push(current);
      current = [t];
      anchor = t.amountCents;
    }
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

interface CadenceResult {
  cadence: RecurringCadence;
  confidence: number;
  medianIntervalDays: number;
}

/** Classify a sorted (ascending) list of dates into a cadence, or null if none fits. */
function classifyCadence(dates: DateStr[], opts: DetectionOptions): CadenceResult | null {
  if (dates.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) intervals.push(diffDays(dates[i - 1], dates[i]));
  const med = median(intervals);

  let best: CadenceResult | null = null;
  for (const def of CADENCES) {
    const withinTolerance = intervals.filter((iv) => Math.abs(iv - def.nominalDays) <= def.toleranceDays).length;
    const confidence = withinTolerance / intervals.length;
    // Prefer the cadence whose nominal length is closest to the observed median,
    // among those that clear the confidence bar.
    if (confidence >= opts.minCadenceConfidence) {
      if (!best || Math.abs(def.nominalDays - med) < Math.abs(nominalOf(best.cadence) - med)) {
        best = { cadence: def.cadence, confidence, medianIntervalDays: med };
      }
    }
  }
  return best;
}

function nominalOf(cadence: RecurringCadence): number {
  return CADENCES.find((c) => c.cadence === cadence)!.nominalDays;
}

function nextDueFrom(lastSeen: DateStr, cadence: RecurringCadence, medianIntervalDays: number, today: DateStr): DateStr {
  // Blend the cadence's nominal length with the observed median interval so a series
  // that's consistently landing a couple of days early/late projects accordingly.
  const nominal = nominalOf(cadence);
  const projected = (nominal + medianIntervalDays) / 2;
  let next = addDaysUTC(lastSeen, projected);
  // If the projected date has already passed (e.g. the last statement import lags),
  // roll forward whole cycles so "next due" always looks ahead, never behind.
  let guard = 0;
  while (next < today && guard < 24) {
    next = addDaysUTC(next, nominal);
    guard++;
  }
  return next;
}

/** Stable-ish id derived from merchant+cadence so re-detection preserves user edits. */
function seriesKey(normalizedMerchant: string, cadence: RecurringCadence): string {
  return `${normalizedMerchant}::${cadence}`;
}

/**
 * Detect recurring series from transaction history. `existing` lets a previous
 * detection's `id`/`muted` survive re-detection (so muting a series sticks, and the
 * radar doesn't reshuffle ids every time new transactions land).
 */
export function detectRecurring(
  txns: Txn[],
  existing: RecurringSeries[] = [],
  options: Partial<DetectionOptions> = {}
): RecurringSeries[] {
  const opts: DetectionOptions = { ...DEFAULT_OPTIONS, ...options };
  const existingByKey = new Map(existing.map((s) => [seriesKey(normalizeMerchant(s.merchant), s.cadence), s]));

  const spend = txns.filter((t) => t.amountCents > 0 && !t.excluded);
  const byMerchant = new Map<string, Txn[]>();
  for (const t of spend) {
    const key = normalizeMerchant(t.merchant || t.description);
    if (!key) continue;
    const list = byMerchant.get(key) ?? [];
    list.push(t);
    byMerchant.set(key, list);
  }

  const out: RecurringSeries[] = [];

  for (const [normalizedMerchant, group] of byMerchant) {
    if (group.length < opts.minOccurrences) continue;

    for (const cluster of clusterByAmount(group, opts)) {
      if (cluster.length < opts.minOccurrences) continue;

      const sorted = [...cluster].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const dates = sorted.map((t) => t.date);
      const cadenceResult = classifyCadence(dates, opts);
      if (!cadenceResult) continue;

      const lastTxn = sorted[sorted.length - 1];
      const priorTxns = sorted.slice(0, -1);
      const baselineAvg = priorTxns.length
        ? Math.round(priorTxns.reduce((s, t) => s + t.amountCents, 0) / priorTxns.length)
        : lastTxn.amountCents;

      const priceIncreaseThreshold = Math.max(Math.round(baselineAvg * 0.05), 100);
      const priceIncreaseCents =
        priorTxns.length >= 2 && lastTxn.amountCents - baselineAvg >= priceIncreaseThreshold
          ? lastTxn.amountCents - baselineAvg
          : undefined;

      const key = seriesKey(normalizedMerchant, cadenceResult.cadence);
      const prior = existingByKey.get(key);

      const displayMerchant = mode(sorted.map((t) => t.merchant || t.description));
      const categoryId = mode(sorted.map((t) => t.categoryId));

      const series: RecurringSeries = {
        id: prior?.id ?? `rec-${key}-${sorted[0].id}`,
        merchant: displayMerchant,
        categoryId,
        cadence: cadenceResult.cadence,
        amountCents: lastTxn.amountCents,
        lastSeen: lastTxn.date,
        nextDue: nextDueFrom(lastTxn.date, cadenceResult.cadence, cadenceResult.medianIntervalDays, opts.today),
        txnIds: sorted.map((t) => t.id),
        priceIncreaseCents,
        muted: prior?.muted ?? false,
      };
      out.push(series);
    }
  }

  return out.sort((a, b) => (a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : 0));
}

/** Monthly-equivalent cost of a cadence, for "total monthly subscription load". */
export function monthlyEquivalentCents(series: RecurringSeries): Cents {
  switch (series.cadence) {
    case 'weekly':
      return Math.round(series.amountCents * 4.348);
    case 'fortnightly':
      return Math.round(series.amountCents * 2.174);
    case 'monthly':
      return series.amountCents;
    case 'quarterly':
      return Math.round(series.amountCents / 3);
    case 'yearly':
      return Math.round(series.amountCents / 12);
  }
}

/** Series due within the next N days (default 14), not muted, soonest first. */
export function dueWithin(series: RecurringSeries[], days: number, today: DateStr): RecurringSeries[] {
  const cutoff = addDaysUTC(today, days);
  return series
    .filter((s) => !s.muted && s.nextDue >= today && s.nextDue <= cutoff)
    .sort((a, b) => (a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : 0));
}

export function totalMonthlyLoadCents(series: RecurringSeries[]): Cents {
  return series.filter((s) => !s.muted).reduce((sum, s) => sum + monthlyEquivalentCents(s), 0);
}

export function priceIncreases(series: RecurringSeries[]): RecurringSeries[] {
  return series.filter((s) => !s.muted && (s.priceIncreaseCents ?? 0) > 0);
}

export function categoryLookup(categories: Category[], id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}
