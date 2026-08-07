/**
 * Explicit lucide-react icon registry.
 *
 * `Category.icon` (see src/types.ts) stores an icon as a *name string* (e.g.
 * 'Coffee') rather than a component reference, so it can be persisted to the
 * IndexedDB vault and to CSV/JSON backups. CategoryIcon resolves that string
 * back to a component at render time.
 *
 * IMPORTANT: import icons here BY NAME, one at a time. Do NOT switch this to
 * `import * as Icons from 'lucide-react'` — that pulls the entire ~1000-icon
 * package into the bundle (it's what caused the 1.1 MB single-chunk bundle
 * this file exists to fix). Every entry below must be imported explicitly so
 * Rollup can tree-shake everything else out.
 *
 * When adding a new default/demo category (src/data/defaultCategories.ts) or
 * a new fallback icon literal, add its import + map entry here too. Unknown
 * names fall back to `Circle` in CategoryIcon — they never crash.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Bus,
  Circle,
  Clapperboard,
  Coffee,
  Dumbbell,
  Fuel,
  HeartPulse,
  Home,
  Key,
  MoreHorizontal,
  PiggyBank,
  Plane,
  Repeat,
  Sandwich,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Users,
  UtensilsCrossed,
  Wallet,
  Zap,
} from 'lucide-react';

/** Icon names actually used by categories (defaults + fallbacks in the UI). */
export const ICONS: Record<string, LucideIcon> = {
  Bus,
  Circle,
  Clapperboard,
  Coffee,
  Dumbbell,
  Fuel,
  HeartPulse,
  Home,
  Key,
  MoreHorizontal,
  PiggyBank,
  Plane,
  Repeat,
  Sandwich,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Users,
  UtensilsCrossed,
  Wallet,
  Zap,
};

/** Icon shown for any name not present in `ICONS` (e.g. corrupt/unknown data). */
export const FALLBACK_ICON: LucideIcon = Circle;
