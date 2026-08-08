/**
 * Tally — shared type contracts.
 *
 * ORCHESTRATOR-OWNED. Read-only to build agents. If you need a change here,
 * escalate — do not edit. Five agents compile against this file.
 *
 * MONEY IS INTEGER CENTS. Never a float. `2450` is $24.50.
 */

/** `YYYY-MM-DD`, local time. */
export type DateStr = string;
/** `YYYY-MM`. */
export type MonthStr = string;
/** Integer cents. Positive = money out (spend). Negative = money in (income/refund). */
export type Cents = number;

/**
 * `'cba'` is the CBA everyday/transaction account. `'cba-card'` is a CBA credit
 * card (DESIGN-V3.md §5 / deliverable 4) — split out because a single `'cba'`
 * bucket covering both an everyday account and a card pollutes statement-cycle
 * prediction (a card has a due date and a closing cycle; an everyday account
 * doesn't). Purely additive: every transaction already stored with
 * `account: 'cba'` keeps exactly that value and exactly that meaning (the
 * everyday account) — nothing about existing data changes. `'cba-card'` only
 * ever appears on a transaction the user explicitly tags that way (import
 * account picker, manual edit) from this point on. See
 * `src/data/accountMigration.ts` for the defensive (not corrective — nothing
 * needs correcting) validation this split is paired with.
 */
export type AccountId = 'cba' | 'cba-card' | 'bankwest' | 'amex' | 'cash';

export type CategoryKind = 'need' | 'want' | 'save';

export interface Category {
  id: string;
  label: string;
  /** lucide-react icon name, e.g. 'Coffee'. */
  icon: string;
  /** Token name from the 12-swatch category ramp, e.g. 'cat-1'. Never a raw hex. */
  colorToken: string;
  kind: CategoryKind;
  /** User-defined categories can be deleted; built-ins cannot. */
  builtin: boolean;
  /** Sort weight; lower shows first in the quick-add grid. */
  order: number;
}

export interface Txn {
  id: string;
  date: DateStr;
  /** Positive = spend, negative = income. Integer cents. */
  amountCents: Cents;
  /** Raw text as it appeared, or what the user typed. */
  description: string;
  /** Cleaned merchant name used for matching and display. */
  merchant: string;
  categoryId: string;
  account: AccountId;
  source: 'manual' | 'csv';
  /** sha256(date|amountCents|normalisedDescription|account) — import dedupe key. */
  hash: string;
  note?: string;
  /** Excluded from budgets/insights (e.g. a reimbursed expense, an internal transfer). */
  excluded?: boolean;
  /** Set when this txn was matched into a detected recurring series. */
  recurringId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Budget {
  categoryId: string;
  month: MonthStr;
  limitCents: Cents;
}

/** A user-taught categorization rule. Created when the user corrects a category. */
export interface Rule {
  id: string;
  /** Lowercased substring matched against the normalised merchant. */
  match: string;
  categoryId: string;
  createdAt: number;
}

export type RecurringCadence = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringSeries {
  id: string;
  merchant: string;
  categoryId: string;
  cadence: RecurringCadence;
  /** Typical amount, integer cents. */
  amountCents: Cents;
  /** Most recent occurrence. */
  lastSeen: DateStr;
  /** Projected next occurrence. */
  nextDue: DateStr;
  /** Transaction ids belonging to this series. */
  txnIds: string[];
  /** Positive cents if the charge has crept up vs. its earlier baseline. */
  priceIncreaseCents?: Cents;
  /** User dismissed this from the radar. */
  muted?: boolean;
}

export interface Settings {
  currency: 'AUD';
  locale: 'en-AU';
  /** Day of month income lands; drives Safe-to-Spend. */
  paydayDayOfMonth: number;
  /** Expected monthly take-home, integer cents. 0 = unknown. */
  monthlyIncomeCents: Cents;
  /** Monthly savings target, integer cents. */
  savingsTargetCents: Cents;
  /** Auto-lock delay in ms when backgrounded. Default 120000. */
  lockTimeoutMs: number;
  biometricEnabled: boolean;
  /** Categories to feature first in the quick-add grid. */
  pinnedCategoryIds: string[];
  /**
   * Date the user moves into the new place (personal plan §7). `undefined` =
   * not yet moved — rent, utilities, and sublet income are inactive until
   * this date. Must be an explicit user-set value, never inferred.
   */
  moveInDate?: DateStr;
  /**
   * Explicit answer to "does the user have a HECS/HELP debt?" (personal plan
   * §2/§7 — if true, the whole plan shifts by ~$700/month). `undefined` =
   * not yet answered; must be asked as a one-time setup question, never
   * silently assumed false.
   */
  hasHecsDebt?: boolean;
  /**
   * The user's actual savings balance, as they last told us. Integer cents.
   *
   * The app sees transactions, never bank balances, so this is the one figure it
   * cannot observe and must be given. `undefined` = never entered, in which case
   * the goal card shows the plan's projected figure and says so, rather than
   * implying it knows something it doesn't.
   *
   * It lives on `Settings` specifically so it is encrypted at rest along with
   * everything else. It is a real financial fact about the user and has no
   * business sitting in plaintext storage.
   */
  goalCurrentBalanceCents?: Cents;
  /**
   * Epoch ms the first-run onboarding flow (`src/features/onboarding/`) was
   * completed OR explicitly skipped — either way counts as "asked". Gates
   * whether `LockGate` shows onboarding after unlock. `undefined` = never
   * run. Re-running from Settings overwrites this with a fresh timestamp.
   */
  onboardingCompletedAt?: number;
  /**
   * Bookmark for the weekly-review guided flow (`src/features/review/`,
   * personal plan §8's first-Saturday ritual). Scoped to a calendar month so
   * a new month always starts fresh, same rollover shape as
   * `RoutineChecklistState` (`src/features/routine/types.ts`). The flow
   * itself re-derives what's actually left to do (uncategorised
   * transactions, unconfirmed recurring series, unpaid Amex) from live data
   * on every open — this is a resume-position convenience, not a source of
   * truth. `undefined` = never started this month.
   */
  weeklyReview?: WeeklyReviewBookmark;
}

/** The five steps of the weekly-review guided flow, in order. */
export type ReviewStepId = 'import' | 'categorise' | 'recurring' | 'amex' | 'done';

export interface WeeklyReviewBookmark {
  /** `YYYY-MM` — the month this bookmark applies to. */
  month: MonthStr;
  step: ReviewStepId;
}

export interface HabitStats {
  /** Consecutive days with zero spend, ending today. */
  noSpendStreak: number;
  bestNoSpendStreak: number;
  coffeesThisMonth: number;
  coffeesLastMonth: number;
  coffeeSpendCents: Cents;
  lunchSpendPerWeekCents: Cents;
  diningOutThisMonthCents: Cents;
}

export interface DayCell {
  date: DateStr;
  totalCents: Cents;
  txnCount: number;
  /** 0–1, normalised against the month's busiest day. Drives heatmap shade. */
  intensity: number;
}

/** Result of parsing one CSV file, shown on the preview-and-confirm screen. */
export interface ImportPreview {
  detectedFormat: 'cba' | 'bankwest' | 'amex' | 'generic';
  account: AccountId;
  rows: Txn[];
  duplicateCount: number;
  /** Parse problems worth surfacing before the user commits. */
  warnings: string[];
  /** True when positive values in the file mean "spend" (Amex convention). */
  signInverted: boolean;
}

/**
 * `'unsupported'` (P1 fix): this browser cannot provide the IndexedDB storage
 * Tally needs (private/locked-down mode, or a browser that throws on open).
 * Without this state, store init left `lockState` at its initial `'locked'`
 * default when storage failed, so the app rendered a normal PIN screen for a
 * vault that structurally cannot exist — any PIN a user typed would fail
 * forever with no explanation. See src/store/useStore.ts's init IIFE and
 * src/security/LockScreen.tsx's dedicated screen for this state.
 */
export type LockState = 'uninitialised' | 'locked' | 'unlocked' | 'unsupported';
