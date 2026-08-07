import type { AccountId, Cents, DateStr, Txn } from '@/types';

export interface DayGroup {
  date: DateStr;
  txns: Txn[];
  subtotalCents: Cents;
}

/** Group already-sorted (newest-first) transactions by day, with a per-day subtotal. */
export function groupByDay(txns: Txn[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const t of txns) {
    if (!current || current.date !== t.date) {
      current = { date: t.date, txns: [], subtotalCents: 0 };
      groups.push(current);
    }
    current.txns.push(t);
    if (!t.excluded) current.subtotalCents += t.amountCents;
  }
  return groups;
}

export interface TxnFilter {
  query?: string;
  categoryId?: string | null;
  account?: AccountId | null;
  month?: string | null; // YYYY-MM
}

/** Search + filter transactions. All filter fields are optional / AND-combined. */
export function filterTxns(txns: Txn[], filter: TxnFilter): Txn[] {
  const q = filter.query?.trim().toLowerCase();
  return txns.filter((t) => {
    if (filter.categoryId && t.categoryId !== filter.categoryId) return false;
    if (filter.account && t.account !== filter.account) return false;
    if (filter.month && !t.date.startsWith(filter.month)) return false;
    if (q) {
      const hay = `${t.merchant} ${t.description} ${t.note ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
