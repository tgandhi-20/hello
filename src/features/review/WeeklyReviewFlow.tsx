/**
 * Weekly review — DESIGN-V3.md §5 deliverable 2/3, PERSONAL.md §8's first-Saturday
 * ritual: export CSVs from CBA/Amex/Bankwest, review against budget, pay Amex in
 * full. A guided sequence with visible progress, resumable if the user leaves
 * halfway (see state.ts's doc comment for exactly how).
 *
 * Integration with the existing routine checklist (src/features/routine/**,
 * another agent's directory — consumed here only through its exported
 * `useRoutineChecklist` hook, never duplicated): the "pay Amex" step reads and
 * ticks the SAME `routineChecklist.current.done['pay-amex']` flag the Routine
 * screen's `AmexGuardrail` shows, and reaching "done" here also ticks
 * `'first-saturday'` (the routine's own "export & review statements" item) — so
 * completing this flow is, structurally, completing that routine item, not a
 * second parallel tracker.
 *
 * Step 1 (import) links to the existing `/import` route rather than
 * reimplementing it (src/features/import/** is another agent's directory).
 * Navigating there unmounts this flow (it's rendered from within Settings, not
 * a route of its own — see this feature's ownership note in the report); the
 * bookmark this flow persists is what makes returning here resume in the right
 * place rather than losing progress.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Upload,
  Tag,
  Repeat,
  CreditCard,
  PartyPopper,
  X,
  ChevronLeft,
  Check,
  BellOff,
} from 'lucide-react';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { ProgressBar } from '@/ui/ProgressBar';
import { formatMoney, formatTxnAmount, formatDate, todayStr } from '@/ui/format';
import { useStore } from '@/store/useStore';
import { CategoryPickerSheet, ruleMatchFor } from '@/features/transactions';
import { useRoutineChecklist, AMEX_INTEREST_RATE_PCT } from '@/features/routine';
import type { RecurringSeries, Txn } from '@/types';
import { uncategorisedTxns, unconfirmedRecurring } from './selectors';
import { resolveInitialStep, nextStep, previousStep, makeBookmark, REVIEW_STEP_ORDER, REVIEW_STEP_LABELS } from './state';

export interface WeeklyReviewFlowProps {
  onClose: () => void;
}

export function WeeklyReviewFlow({ onClose }: WeeklyReviewFlowProps) {
  const txns = useStore((s) => s.txns);
  const categories = useStore((s) => s.categories);
  const recurring = useStore((s) => s.recurring);
  const settings = useStore((s) => s.settings);
  const updateTxn = useStore((s) => s.updateTxn);
  const addRule = useStore((s) => s.addRule);
  const setRecurring = useStore((s) => s.setRecurring);
  const updateSettings = useStore((s) => s.updateSettings);
  const { state: routineState, toggleItem } = useRoutineChecklist();

  const today = todayStr();
  const queue = useMemo(() => uncategorisedTxns(txns, categories), [txns, categories]);
  const unconfirmed = useMemo(() => unconfirmedRecurring(recurring), [recurring]);
  const amexPaid = Boolean(routineState.current.done['pay-amex']);
  const reviewDone = Boolean(routineState.current.done['first-saturday']);

  const [step, setStep] = useState(() =>
    resolveInitialStep(settings.weeklyReview, today, {
      uncategorisedCount: queue.length,
      unconfirmedRecurringCount: unconfirmed.length,
      amexPaid,
    })
  );
  const [pickerTxn, setPickerTxn] = useState<Txn | null>(null);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [sessionCategorised, setSessionCategorised] = useState(0);
  const [sessionConfirmed, setSessionConfirmed] = useState(0);
  const [sessionDismissed, setSessionDismissed] = useState(0);

  function goStep(next: typeof step) {
    setStep(next);
    void updateSettings({ weeklyReview: makeBookmark(next, today) });
  }

  // Reaching "done" is, structurally, completing the routine's own first-Saturday
  // item — tick it once (never re-tick, never fight the user un-ticking it by hand).
  useEffect(() => {
    if (step === 'done' && !reviewDone) {
      toggleItem('first-saturday');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const current = queue.find((t) => !skippedIds.has(t.id)) ?? null;

  async function handlePick(category: { id: string; label: string }, remember: boolean) {
    if (!pickerTxn) return;
    await updateTxn(pickerTxn.id, { categoryId: category.id });
    if (remember) {
      const match = ruleMatchFor(pickerTxn.merchant);
      if (match) await addRule(match, category.id);
    }
    setSessionCategorised((n) => n + 1);
    setPickerTxn(null);
  }

  async function confirmSeries(series: RecurringSeries) {
    await setRecurring(recurring.map((s) => (s.id === series.id ? { ...s, confirmed: true, confirmedAt: Date.now() } : s)));
    setSessionConfirmed((n) => n + 1);
  }
  async function dismissSeries(series: RecurringSeries) {
    await setRecurring(recurring.map((s) => (s.id === series.id ? { ...s, muted: true } : s)));
    setSessionDismissed((n) => n + 1);
  }

  const stepIndex = REVIEW_STEP_ORDER.indexOf(step);
  const canGoBack = stepIndex > 0 && step !== 'done';

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-ground" role="dialog" aria-modal="true" aria-label="Weekly review">
      <div
        className="flex items-center justify-between px-4 pt-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        {canGoBack ? (
          <button
            type="button"
            onClick={() => goStep(previousStep(step))}
            aria-label="Back"
            className="flex h-12 w-12 items-center justify-center rounded-full text-ink-2 active:bg-surface-sunk"
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
        ) : (
          <span className="h-12 w-12" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-12 w-12 items-center justify-center rounded-full text-ink-2 active:bg-surface-sunk"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      {step !== 'done' ? (
        <div className="px-6 pt-2">
          <ProgressBar value={(stepIndex + 1) / (REVIEW_STEP_ORDER.length - 1)} label="Weekly review progress" />
          <p className="mt-2 text-xs text-ink-3">
            Step {stepIndex + 1} of {REVIEW_STEP_ORDER.length - 1} · {REVIEW_STEP_LABELS[step]}
          </p>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto scroll-container px-6 py-4">
        {step === 'import' ? (
          <div className="flex flex-col gap-4">
            <StepHeader icon={<Upload size={22} aria-hidden="true" />} title="Import statements" />
            <p className="text-sm text-ink-2">
              Export this cycle's CSVs from CBA, Amex and Bankwest, and bring them in here. If
              you've already imported everything for this cycle, just continue.
            </p>
            <Link to="/import" onClick={onClose}>
              <Button variant="primary" fullWidth>
                <Upload size={18} aria-hidden="true" />
                Go to import
              </Button>
            </Link>
          </div>
        ) : null}

        {step === 'categorise' ? (
          <div className="flex flex-col gap-4">
            <StepHeader icon={<Tag size={22} aria-hidden="true" />} title="Categorise" />
            {current ? (
              <>
                <p className="text-sm text-ink-2">
                  {queue.length} transaction{queue.length === 1 ? '' : 's'} left in "Other" — one tap each.
                </p>
                <Card className="flex flex-col gap-3">
                  <div>
                    <p className="text-md font-medium text-ink-1">{current.merchant || current.description}</p>
                    <p className="text-xs text-ink-3">{formatDate(current.date, 'long')}</p>
                  </div>
                  <p className="money text-lg text-ink-1">{formatTxnAmount(current.amountCents)}</p>
                  <div className="flex gap-3">
                    <Button variant="ghost" fullWidth onClick={() => setSkippedIds((s) => new Set(s).add(current.id))}>
                      Skip
                    </Button>
                    <Button fullWidth onClick={() => setPickerTxn(current)}>
                      Choose category
                    </Button>
                  </div>
                </Card>
              </>
            ) : (
              <EmptyStepState icon={<Check size={22} aria-hidden="true" />} text="All caught up — nothing left in Other." />
            )}
          </div>
        ) : null}

        {step === 'recurring' ? (
          <div className="flex flex-col gap-4">
            <StepHeader icon={<Repeat size={22} aria-hidden="true" />} title="Confirm recurring" />
            {unconfirmed.length > 0 ? (
              <>
                <p className="text-sm text-ink-2">
                  Newly detected series — confirm the ones that are real bills, dismiss anything
                  that isn't.
                </p>
                <ListGroup>
                  {unconfirmed.map((s) => {
                    const category = categories.find((c) => c.id === s.categoryId);
                    return (
                      <ListRow
                        key={s.id}
                        as="div"
                        leading={<CategoryIcon icon={category?.icon ?? 'Circle'} colorToken={category?.colorToken ?? 'cat-1'} size="sm" />}
                        title={s.merchant}
                        subtitle={`${formatMoney(s.amountCents)} · ${s.cadence}`}
                        trailing={
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void dismissSeries(s)}
                              aria-label={`Dismiss ${s.merchant}`}
                              className="flex h-12 w-12 items-center justify-center rounded-full text-ink-2 active:bg-surface-sunk"
                            >
                              <BellOff size={18} aria-hidden="true" />
                            </button>
                            <Button size="md" onClick={() => void confirmSeries(s)}>
                              Confirm
                            </Button>
                          </div>
                        }
                      />
                    );
                  })}
                </ListGroup>
              </>
            ) : (
              <EmptyStepState icon={<Check size={22} aria-hidden="true" />} text="Nothing new to confirm." />
            )}
          </div>
        ) : null}

        {step === 'amex' ? (
          <div className="flex flex-col gap-4">
            <StepHeader icon={<CreditCard size={22} aria-hidden="true" />} title="Pay Amex in full" />
            <p className="text-sm text-ink-2">
              Amex charges {AMEX_INTEREST_RATE_PCT}% on a carried balance — enough that any
              interest paid there outweighs everything this plan earns in savings interest.
            </p>
            {amexPaid ? (
              <EmptyStepState icon={<Check size={22} aria-hidden="true" />} text="Marked paid in full for this cycle." />
            ) : (
              <Button fullWidth onClick={() => toggleItem('pay-amex')}>
                Mark paid in full
              </Button>
            )}
          </div>
        ) : null}

        {step === 'done' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-hairline bg-surface">
              <PartyPopper size={26} className="text-accent" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-ink-1">Review done</h1>
              <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-2">
                <li>{sessionCategorised} transaction{sessionCategorised === 1 ? '' : 's'} categorised</li>
                <li>{sessionConfirmed} recurring series confirmed, {sessionDismissed} dismissed</li>
                <li>Amex {amexPaid ? 'marked paid in full' : 'not yet marked paid'}</li>
              </ul>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className="border-t border-hairline bg-surface px-6 pb-8 pt-4"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        {step === 'done' ? (
          <Button variant="primary" size="lg" fullWidth onClick={onClose}>
            Done
          </Button>
        ) : (
          <Button variant="primary" size="lg" fullWidth onClick={() => goStep(nextStep(step))}>
            Continue
          </Button>
        )}
      </div>

      {pickerTxn ? (
        <CategoryPickerSheet
          open={Boolean(pickerTxn)}
          onClose={() => setPickerTxn(null)}
          categories={categories}
          merchant={pickerTxn.merchant}
          onPick={(category, remember) => void handlePick(category, remember)}
        />
      ) : null}
    </div>
  );
}

function StepHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface text-accent">
        {icon}
      </span>
      <h1 className="text-lg font-semibold text-ink-1">{title}</h1>
    </div>
  );
}

function EmptyStepState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-tint text-accent">{icon}</span>
      <p className="text-sm text-ink-2">{text}</p>
    </div>
  );
}
