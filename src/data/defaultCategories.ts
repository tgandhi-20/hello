/**
 * Tally — default category set (CONTRACTS.md deliverable 5), personalised.
 *
 * Ids, labels, and kinds come from src/personal/plan.ts's PERSONAL_CATEGORIES
 * (docs/PERSONAL.md §3, FROZEN) — this file adds only the UI-specific bits
 * that plan.ts intentionally doesn't own: icon name and colour-ramp token.
 *
 * Seeded once, on first-run (`setupPin`) and by `loadDemoData`. Coffee,
 * Lunch, and Eating Out are kept as three distinct categories (not merged)
 * per the user's own plan (§4) — the food tracker needs their separate caps
 * to show the groceries-vs-eating-out split that's the whole point.
 */
import type { Category } from '@/types';
import { PERSONAL_CATEGORIES } from '@/personal/plan';

export interface DefaultCategoryDef {
  id: string;
  label: string;
  icon: string;
  colorToken: string;
  kind: Category['kind'];
}

/**
 * Icon per category id. Restricted to lucide-react names already present in
 * src/ui/icons.ts's registry EXCEPT the five marked below, which are not yet
 * in that registry — src/ui/icons.ts is owned by Agent 1, so this module
 * cannot add them itself. Until they're added, CategoryIcon's fallback
 * (Circle) renders instead of a broken icon — never a crash — but flagging
 * these for the orchestrator to add is called out in the report:
 *   Key (cat-sublet), Users (cat-family), Smartphone (cat-phone),
 *   Sparkles (cat-skincare), Plane (cat-oneoff).
 */
const ICON_BY_ID: Record<string, string> = {
  'cat-rent': 'Home',
  'cat-sublet': 'Key', // NEW — not yet in src/ui/icons.ts, see note above
  'cat-utilities': 'Zap',
  'cat-family': 'Users', // NEW — not yet in src/ui/icons.ts, see note above
  'cat-groceries': 'ShoppingCart',
  'cat-transport': 'Bus',
  'cat-eating-out': 'UtensilsCrossed',
  'cat-lunch': 'Sandwich',
  'cat-coffee': 'Coffee',
  'cat-health': 'HeartPulse',
  'cat-phone': 'Smartphone', // NEW — not yet in src/ui/icons.ts, see note above
  'cat-shopping': 'ShoppingBag',
  'cat-subscriptions': 'Repeat',
  'cat-skincare': 'Sparkles', // NEW — not yet in src/ui/icons.ts, see note above
  'cat-savings': 'PiggyBank',
  'cat-income': 'Wallet',
  'cat-oneoff': 'Plane', // NEW — not yet in src/ui/icons.ts, see note above
  'cat-other': 'MoreHorizontal',
};

// Stable ids (frozen, from PERSONAL_CATEGORIES — not random) so demo data /
// rules / budgets can reference them predictably, and so re-seeding is
// idempotent. Colour tokens cycle through the fixed 12-swatch ramp
// (src/styles/tokens.css) since there are 18 categories.
export const DEFAULT_CATEGORIES: DefaultCategoryDef[] = PERSONAL_CATEGORIES.map((c, i) => ({
  id: c.id,
  label: c.label,
  icon: ICON_BY_ID[c.id] ?? 'Circle',
  colorToken: `cat-${(i % 12) + 1}`,
  kind: c.kind,
}));

/** The categories that float to the front of quick-add on a fresh install — the ones logged most often, in the moment (§0, §4). */
export const DEFAULT_PINNED_CATEGORY_IDS = [
  'cat-coffee',
  'cat-lunch',
  'cat-eating-out',
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
