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

export type AccountId = 'cba' | 'bankwest' | 'amex' | 'cash';

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

export type LockState = 'uninitialised' | 'locked' | 'unlocked';
