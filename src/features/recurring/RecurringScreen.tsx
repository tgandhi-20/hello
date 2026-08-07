import React, { useMemo } from 'react';
import { CalendarClock, TrendingUp, Repeat, BellOff, Bell } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Card, CategoryIcon, EmptyState, formatMoney, formatDate, todayStr } from '@/ui';
import type { RecurringSeries } from '@/types';
import { dueWithin, totalMonthlyLoadCents, priceIncreases, categoryLookup } from './detect';

const CADENCE_LABEL: Record<RecurringSeries['cadence'], string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export function RecurringScreen() {
  const recurring = useStore((s) => s.recurring);
  const categories = useStore((s) => s.categories);
  const setRecurring = useStore((s) => s.setRecurring);

  const today = todayStr();
  const active = useMemo(() => recurring.filter((s) => !s.muted), [recurring]);
  const due = useMemo(() => dueWithin(recurring, 14, today), [recurring, today]);
  const dueTotal = useMemo(() => due.reduce((sum, s) => sum + s.amountCents, 0), [due]);
  const monthlyLoad = useMemo(() => totalMonthlyLoadCents(recurring), [recurring]);
  const increases = useMemo(() => priceIncreases(recurring), [recurring]);

  function toggleMute(series: RecurringSeries) {
    void setRecurring(recurring.map((s) => (s.id === series.id ? { ...s, muted: !s.muted } : s)));
  }

  if (recurring.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        headline="Nothing recurring detected yet"
        body="Once the same merchant charges you a few times at a regular interval — rent, a subscription, a utility bill — it'll show up here automatically."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            <CalendarClock size={14} aria-hidden="true" /> Due in 14 days
          </span>
          <span className="text-xl font-semibold tabular-nums text-ink-1">{formatMoney(dueTotal)}</span>
          <span className="text-xs text-ink-3">{due.length} upcoming</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            <Repeat size={14} aria-hidden="true" /> Monthly load
          </span>
          <span className="text-xl font-semibold tabular-nums text-ink-1">{formatMoney(monthlyLoad)}</span>
          <span className="text-xs text-ink-3">{active.length} active series</span>
        </Card>
      </div>

      {increases.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 px-1 text-sm font-semibold text-caution">
            <TrendingUp size={16} aria-hidden="true" /> Got more expensive
          </h2>
          {increases.map((s) => (
            <Card key={s.id} className="flex items-center gap-3">
              <CategoryIcon
                icon={categoryLookup(categories, s.categoryId)?.icon ?? 'Circle'}
                colorToken={categoryLookup(categories, s.categoryId)?.colorToken ?? 'cat-1'}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-md text-ink-1">{s.merchant}</p>
                <p className="text-xs text-ink-2">
                  {formatMoney(s.amountCents - (s.priceIncreaseCents ?? 0))} &rarr; {formatMoney(s.amountCents)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums text-caution">
                +{formatMoney(s.priceIncreaseCents ?? 0)}
              </span>
            </Card>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold text-ink-2">Due soon</h2>
        {due.length === 0 ? (
          <p className="px-1 text-sm text-ink-3">Nothing due in the next 14 days.</p>
        ) : (
          due.map((s) => (
            <Card key={s.id} className="flex items-center gap-3">
              <CategoryIcon
                icon={categoryLookup(categories, s.categoryId)?.icon ?? 'Circle'}
                colorToken={categoryLookup(categories, s.categoryId)?.colorToken ?? 'cat-1'}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-md text-ink-1">{s.merchant}</p>
                <p className="text-xs text-ink-2">
                  {CADENCE_LABEL[s.cadence]} · {formatDate(s.nextDue, 'long')}
                </p>
              </div>
              <span className="shrink-0 text-md font-medium tabular-nums text-ink-1">{formatMoney(s.amountCents)}</span>
            </Card>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold text-ink-2">All detected series</h2>
        {recurring.map((s) => (
          <Card key={s.id} className={['flex items-center gap-3', s.muted ? 'opacity-50' : ''].join(' ')}>
            <CategoryIcon
              icon={categoryLookup(categories, s.categoryId)?.icon ?? 'Circle'}
              colorToken={categoryLookup(categories, s.categoryId)?.colorToken ?? 'cat-1'}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-md text-ink-1">{s.merchant}</p>
              <p className="text-xs text-ink-2">
                {CADENCE_LABEL[s.cadence]} · {formatMoney(s.amountCents)} · last {formatDate(s.lastSeen, 'short')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleMute(s)}
              aria-label={s.muted ? 'Unmute' : 'Mute'}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
            >
              {s.muted ? <BellOff size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}
            </button>
          </Card>
        ))}
      </section>
    </div>
  );
}
