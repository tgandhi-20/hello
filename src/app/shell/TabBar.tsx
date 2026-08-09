import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Plus, Menu as MenuIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { vibrate } from '@/ui/haptics';

interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

// DESIGN-V4.md §2's 3 slots: Home · ⊕ (quick-add) · Menu. Down from v3's 5 (Today,
// Spending, ⊕, Plan, More) — Spending and Plan are gone as destinations; everything
// they used to hold is one tap away from Menu instead (see App.tsx).
// `end: true` on Home keeps it from matching every other route (every path starts
// with '/').
const TABS: TabDef[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/menu', label: 'Menu', icon: MenuIcon },
];

/**
 * Bottom tab bar: Home · centre FAB (quick-add) · Menu. Fixed to the viewport
 * bottom, respects env(safe-area-inset-bottom) so gesture-nav devices never clip a
 * tab under the home indicator.
 */
export function TabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <div className="relative mx-auto flex h-16 max-w-lg items-stretch justify-between px-2">
        <TabLink tab={TABS[0]} />

        {/* Centre FAB — quick-add, always routes to /log */}
        <div className="flex w-16 shrink-0 items-center justify-center">
          <NavLink
            to="/log"
            aria-label="Quick add"
            onClick={() => vibrate('tap')}
            className="flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full bg-accent text-ink-on-accent shadow-elevated transition-transform duration-200 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Plus size={28} strokeWidth={2.25} aria-hidden="true" />
          </NavLink>
        </div>

        <TabLink tab={TABS[1]} />
      </div>
    </nav>
  );
}

function TabLink({ tab }: { tab: TabDef }) {
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      onClick={() => vibrate('tap')}
      className={({ isActive }) =>
        [
          'flex min-w-[48px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium',
          'focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent',
          isActive ? 'text-accent' : 'text-ink-3',
        ].join(' ')
      }
    >
      <Icon size={22} strokeWidth={2} />
      <span>{tab.label}</span>
    </NavLink>
  );
}
