/**
 * Tally — default Australian category set (CONTRACTS.md deliverable 5).
 *
 * Seeded once, on first-run (`setupPin`) and by `loadDemoData`. Coffee and
 * Lunch are kept distinct from Dining Out per the user's explicit ask — they
 * track those three separately.
 */
import type { Category } from '@/types';

export interface DefaultCategoryDef {
  id: string;
  label: string;
  icon: string;
  colorToken: string;
  kind: Category['kind'];
}

// Stable ids (not random) so demo data / rules can reference them predictably,
// and so re-seeding is idempotent.
export const DEFAULT_CATEGORIES: DefaultCategoryDef[] = [
  { id: 'cat-rent', label: 'Rent', icon: 'Home', colorToken: 'cat-1', kind: 'need' },
  { id: 'cat-utilities', label: 'Utilities', icon: 'Zap', colorToken: 'cat-2', kind: 'need' },
  { id: 'cat-groceries', label: 'Groceries', icon: 'ShoppingCart', colorToken: 'cat-3', kind: 'need' },
  { id: 'cat-coffee', label: 'Coffee', icon: 'Coffee', colorToken: 'cat-4', kind: 'want' },
  { id: 'cat-lunch', label: 'Lunch', icon: 'Sandwich', colorToken: 'cat-5', kind: 'want' },
  { id: 'cat-dining-out', label: 'Dining Out', icon: 'UtensilsCrossed', colorToken: 'cat-6', kind: 'want' },
  { id: 'cat-transport', label: 'Transport', icon: 'Bus', colorToken: 'cat-7', kind: 'need' },
  { id: 'cat-fuel', label: 'Fuel', icon: 'Fuel', colorToken: 'cat-8', kind: 'need' },
  { id: 'cat-health', label: 'Health', icon: 'HeartPulse', colorToken: 'cat-9', kind: 'need' },
  { id: 'cat-fitness', label: 'Fitness', icon: 'Dumbbell', colorToken: 'cat-10', kind: 'want' },
  { id: 'cat-subscriptions', label: 'Subscriptions', icon: 'Repeat', colorToken: 'cat-11', kind: 'want' },
  { id: 'cat-shopping', label: 'Shopping', icon: 'ShoppingBag', colorToken: 'cat-12', kind: 'want' },
  { id: 'cat-entertainment', label: 'Entertainment', icon: 'Clapperboard', colorToken: 'cat-1', kind: 'want' },
  { id: 'cat-savings', label: 'Savings', icon: 'PiggyBank', colorToken: 'cat-2', kind: 'save' },
  { id: 'cat-income', label: 'Income', icon: 'Wallet', colorToken: 'cat-3', kind: 'save' },
  { id: 'cat-other', label: 'Other', icon: 'MoreHorizontal', colorToken: 'cat-4', kind: 'want' },
];

/** The categories that float to the front of quick-add on a fresh install. */
export const DEFAULT_PINNED_CATEGORY_IDS = [
  'cat-coffee',
  'cat-lunch',
  'cat-dining-out',
  'cat-groceries',
  'cat-transport',
];

export function buildDefaultCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((c, i) => ({
    id: c.id,
    label: c.label,
    icon: c.icon,
    colorToken: c.colorToken,
    kind: c.kind,
    builtin: true,
    order: i,
  }));
}
