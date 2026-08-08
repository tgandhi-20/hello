/**
 * First-run onboarding — DESIGN-V3.md §5 deliverable 1.
 *
 * Rendered two ways by two different callers, both outside this feature's own
 * ownership (flagged in the report):
 *   - `'first-run'`: mounted by `LockGate` (src/security/LockScreen.tsx)
 *     immediately after a fresh vault's PIN/passphrase is set, full-screen,
 *     before the rest of the app is reachable.
 *   - `'rerun'`: opened from Settings (src/features/settings/SettingsScreen.tsx)
 *     at any time, as the same full-screen flow with a visible close affordance.
 *
 * Steps: welcome -> income/payday/savings -> move-in date -> HECS yes/no ->
 * start-with-my-plan-or-empty -> done. Skippable at every step; skipping (or
 * finishing) always marks `Settings.onboardingCompletedAt`, so `LockGate` never
 * shows this twice uninvited.
 */
import React, { useState } from 'react';
import {
  Sparkles,
  Wallet,
  CalendarClock,
  PiggyBank,
  Home,
  HelpCircle,
  ClipboardCheck,
  X,
  ChevronLeft,
  Check,
  CircleSlash,
} from 'lucide-react';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
import { useToast } from '@/ui/Toast';
import { useStore } from '@/store/useStore';
import { applyPersonalPlan } from '@/personal/applyPersonalPlan';
import { parseDollarsToCents, centsToPlainDollarsString } from '@/features/settings/money';
import {
  PLAN_SEED_BUDGET_COUNT,
  PLAN_SEED_SUBSCRIPTION_COUNT,
  PLAN_SEED_SUBSCRIPTION_NAMES,
  initialOnboardingAnswers,
  hecsImpactNote,
  buildOnboardingSettingsPatch,
  buildSkipSettingsPatch,
  isValidMoneyCents,
  isValidPaydayDay,
  type OnboardingAnswers,
} from './onboardingSettings';

type Step = 'welcome' | 'income' | 'moveIn' | 'hecs' | 'plan' | 'finishing' | 'done';

const PAYDAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}`,
}));

export interface OnboardingFlowProps {
  variant?: 'first-run' | 'rerun';
  onDone: () => void;
}

/** A money input that only ever produces integer cents — no float parsing (CONTRACTS.md §3). */
function MoneyField({
  label,
  hint,
  valueCents,
  onChange,
}: {
  label: string;
  hint?: string;
  valueCents: number;
  onChange: (cents: number) => void;
}) {
  const [text, setText] = useState(centsToPlainDollarsString(valueCents));
  return (
    <div>
      <Input
        label={label}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const parsed = parseDollarsToCents(text);
          if (parsed !== null && isValidMoneyCents(parsed)) {
            onChange(parsed);
          } else {
            setText(centsToPlainDollarsString(valueCents));
          }
        }}
      />
      {hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

/** A large tappable choice card — used for HECS yes/no and the plan-start choice. Local to onboarding; not a reuse of src/security/ModeOptionCard.tsx (that file belongs to another agent). */
function ChoiceCard({
  selected,
  title,
  body,
  onSelect,
}: {
  selected: boolean;
  title: string;
  body: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'w-full min-h-[48px] rounded-card border p-4 text-left transition-colors duration-180 ease-standard',
        selected ? 'border-accent bg-accent-tint' : 'border-hairline bg-surface active:bg-surface-sunk',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
            selected ? 'border-accent bg-accent text-ink-on-accent' : 'border-hairline',
          ].join(' ')}
        >
          {selected ? <Check size={12} aria-hidden="true" /> : null}
        </span>
        <span className="text-md font-medium text-ink-1">{title}</span>
      </div>
      <p className="mt-1 pl-7 text-sm text-ink-2">{body}</p>
    </button>
  );
}

export function OnboardingFlow({ variant = 'first-run', onDone }: OnboardingFlowProps) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const { show } = useToast();

  const seed = initialOnboardingAnswers(settings);
  const [step, setStep] = useState<Step>('welcome');
  const [monthlyIncomeCents, setMonthlyIncomeCents] = useState(seed.monthlyIncomeCents);
  const [paydayDayOfMonth, setPaydayDayOfMonth] = useState(seed.paydayDayOfMonth);
  const [savingsTargetCents, setSavingsTargetCents] = useState(seed.savingsTargetCents);
  const [moveInDate, setMoveInDate] = useState<string>(seed.moveInDate ?? '');
  const [hasHecsDebt, setHasHecsDebt] = useState<boolean | null>(settings.hasHecsDebt ?? null);
  const [startWithPlan, setStartWithPlan] = useState(true);
  const [seededCounts, setSeededCounts] = useState<{ budgets: number; subscriptions: number } | null>(null);

  async function handleSkip() {
    if (variant === 'first-run') {
      await updateSettings(buildSkipSettingsPatch());
    }
    onDone();
  }

  async function handleFinish() {
    if (hasHecsDebt === null) return; // guarded by the Continue button too — defensive
    const answers: OnboardingAnswers = {
      monthlyIncomeCents,
      paydayDayOfMonth,
      savingsTargetCents,
      moveInDate: moveInDate || undefined,
      hasHecsDebt,
      startWithPlan,
    };
    setStep('finishing');
    try {
      await updateSettings(buildOnboardingSettingsPatch(answers));
      if (startWithPlan) {
        const result = await applyPersonalPlan(useStore.getState());
        setSeededCounts({ budgets: result.budgetsSet, subscriptions: result.subscriptionsSeeded });
      } else {
        setSeededCounts(null);
      }
      setStep('done');
    } catch {
      show("Couldn't save your setup — please try again.", { variant: 'danger' });
      setStep('plan');
    }
  }

  const isFirstRun = variant === 'first-run';

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-ground" role="dialog" aria-modal="true" aria-label="Set up Tally">
      <div
        className="flex items-center justify-between px-4 pt-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        {step !== 'welcome' && step !== 'finishing' && step !== 'done' ? (
          <button
            type="button"
            onClick={() => setStep(prevStepOf(step))}
            aria-label="Back"
            className="flex h-12 w-12 items-center justify-center rounded-full text-ink-2 active:bg-surface-sunk"
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
        ) : (
          <span className="h-12 w-12" aria-hidden="true" />
        )}

        {!isFirstRun || step === 'welcome' ? (
          <button
            type="button"
            onClick={() => void handleSkip()}
            aria-label={isFirstRun ? 'Skip setup' : 'Close'}
            className="flex h-12 w-12 items-center justify-center rounded-full text-ink-2 active:bg-surface-sunk"
          >
            <X size={20} aria-hidden="true" />
          </button>
        ) : (
          <span className="h-12 w-12" aria-hidden="true" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto scroll-container px-6 pb-6">
        {step === 'welcome' ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-hairline bg-surface">
              <Sparkles size={26} className="text-accent" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-ink-1">Let's set up Tally</h1>
              <p className="mt-2 max-w-sm text-sm text-ink-2">
                A few quick questions point this app at your real numbers instead of generic
                defaults. Takes about a minute — skip anytime, and you can run this again from
                Settings.
              </p>
            </div>
          </div>
        ) : null}

        {step === 'income' ? (
          <div className="flex flex-col gap-5 pt-4">
            <StepHeader icon={<Wallet size={22} aria-hidden="true" />} title="Income & savings" />
            <MoneyField
              label="Monthly take-home"
              hint="After tax. Used to work out what's safe to spend today."
              valueCents={monthlyIncomeCents}
              onChange={setMonthlyIncomeCents}
            />
            <div className="flex items-center gap-3">
              <CalendarClock size={20} className="shrink-0 text-ink-2" aria-hidden="true" />
              <Select
                label="Payday"
                options={PAYDAY_OPTIONS}
                value={String(paydayDayOfMonth)}
                onChange={(e) => setPaydayDayOfMonth(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <MoneyField
              label="Savings target"
              hint="Set aside each month before anything else."
              valueCents={savingsTargetCents}
              onChange={setSavingsTargetCents}
            />
          </div>
        ) : null}

        {step === 'moveIn' ? (
          <div className="flex flex-col gap-4 pt-4">
            <StepHeader icon={<Home size={22} aria-hidden="true" />} title="Move-in date" />
            <p className="text-sm text-ink-2">
              Rent, utilities and the sublet income only start counting once you've actually
              moved in — until then they stay out of your budget entirely. If the date isn't
              fixed yet, that's fine: leave it blank and set it later.
            </p>
            <Input
              label="Move-in date (optional)"
              type="date"
              value={moveInDate}
              onChange={(e) => setMoveInDate(e.target.value)}
            />
            {moveInDate ? (
              <button
                type="button"
                onClick={() => setMoveInDate('')}
                className="min-h-[48px] self-start text-sm text-ink-3 underline decoration-dotted underline-offset-4"
              >
                Not sure yet — clear this
              </button>
            ) : null}
          </div>
        ) : null}

        {step === 'hecs' ? (
          <div className="flex flex-col gap-4 pt-4">
            <StepHeader icon={<HelpCircle size={22} aria-hidden="true" />} title="HECS or HELP debt?" />
            <p className="text-sm text-ink-2">
              This changes how much of your salary is actually take-home. Answer once — Tally
              never assumes.
            </p>
            <div className="flex flex-col gap-3">
              <ChoiceCard
                selected={hasHecsDebt === false}
                title="No HECS/HELP debt"
                body="Use the take-home figure as entered."
                onSelect={() => setHasHecsDebt(false)}
              />
              <ChoiceCard
                selected={hasHecsDebt === true}
                title="Yes, I have a HECS/HELP debt"
                body="Flag it — the plan's numbers will need a second look."
                onSelect={() => setHasHecsDebt(true)}
              />
            </div>
            {hasHecsDebt === true ? (
              <div className="rounded-card bg-[color-mix(in_srgb,var(--caution)_12%,transparent)] p-3">
                <p className="text-xs text-caution">{hecsImpactNote()}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 'plan' ? (
          <div className="flex flex-col gap-4 pt-4">
            <StepHeader icon={<ClipboardCheck size={22} aria-hidden="true" />} title="Your budget" />
            <p className="text-sm text-ink-2">
              Tally already knows your real category budgets and subscriptions from your own
              plan. Seed them now, or start from a clean slate and build them up yourself.
            </p>
            <div className="flex flex-col gap-3">
              <ChoiceCard
                selected={startWithPlan}
                title="Start with my plan"
                body={`Sets ${PLAN_SEED_BUDGET_COUNT} category budgets for this month and your ${PLAN_SEED_SUBSCRIPTION_COUNT} known subscriptions (${PLAN_SEED_SUBSCRIPTION_NAMES.join(', ')}). Safe to run again later — it won't create duplicates.`}
                onSelect={() => setStartWithPlan(true)}
              />
              <ChoiceCard
                selected={!startWithPlan}
                title="Start empty"
                body="No budgets or subscriptions are set. Add them yourself from Plan or Settings whenever you're ready."
                onSelect={() => setStartWithPlan(false)}
              />
            </div>
          </div>
        ) : null}

        {step === 'finishing' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-ink-2">Setting things up…</p>
          </div>
        ) : null}

        {step === 'done' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-hairline bg-surface">
              {seededCounts ? (
                <Check size={26} className="text-accent" aria-hidden="true" />
              ) : (
                <CircleSlash size={24} className="text-ink-2" aria-hidden="true" />
              )}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-ink-1">You're set up</h1>
              {seededCounts ? (
                <p className="mt-2 max-w-sm text-sm text-ink-2">
                  {seededCounts.budgets} category budgets and {seededCounts.subscriptions} subscriptions
                  are in place for this month.
                </p>
              ) : (
                <p className="mt-2 max-w-sm text-sm text-ink-2">
                  Nothing was seeded. Set budgets and subscriptions anytime from Plan or Settings.
                </p>
              )}
              {hasHecsDebt === true ? (
                <p className="mt-3 max-w-sm text-xs text-caution">{hecsImpactNote()}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div
        className="border-t border-hairline bg-surface px-6 pb-8 pt-4"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        {step === 'welcome' ? (
          <Button variant="primary" size="lg" fullWidth onClick={() => setStep('income')}>
            Get started
          </Button>
        ) : null}
        {step === 'income' ? (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!isValidMoneyCents(monthlyIncomeCents) || !isValidPaydayDay(paydayDayOfMonth) || !isValidMoneyCents(savingsTargetCents)}
            onClick={() => setStep('moveIn')}
          >
            Continue
          </Button>
        ) : null}
        {step === 'moveIn' ? (
          <Button variant="primary" size="lg" fullWidth onClick={() => setStep('hecs')}>
            Continue
          </Button>
        ) : null}
        {step === 'hecs' ? (
          <Button variant="primary" size="lg" fullWidth disabled={hasHecsDebt === null} onClick={() => setStep('plan')}>
            Continue
          </Button>
        ) : null}
        {step === 'plan' ? (
          <Button variant="primary" size="lg" fullWidth onClick={() => void handleFinish()}>
            Finish setup
          </Button>
        ) : null}
        {step === 'done' ? (
          <Button variant="primary" size="lg" fullWidth onClick={onDone}>
            {isFirstRun ? 'Go to Tally' : 'Done'}
          </Button>
        ) : null}
      </div>
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

function prevStepOf(step: Step): Step {
  const order: Step[] = ['welcome', 'income', 'moveIn', 'hecs', 'plan'];
  const idx = order.indexOf(step);
  return idx > 0 ? order[idx - 1] : 'welcome';
}
