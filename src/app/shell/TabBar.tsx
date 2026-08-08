import React from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarCheck2, Receipt, Plus, Target, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { vibrate } from '@/ui/haptics';

interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

// DESIGN-V3.md §4's 5 slots: Today · Spending · ⊕ (quick-add) · Plan · More.
// `end: true` on Today keeps it from matching every other route (every path starts
// with '/'); Spending/Plan deliberately have no `end` so they stay highlighted while
// any of their nested sub-tabs (`/spending/trends`, `/plan/routine`, …) is open.
const TABS: TabDef[] = [
  { to: '/', label: 'Today', icon: CalendarCheck2, end: true },
  { to: '/spending', label: 'Spending', icon: Receipt },
  { to: '/plan', label: 'Plan', icon: Target },
  { to: '/more', label: 'More', icon: MoreHorizontal },
];

/**
 * Bottom tab bar: Today · Spending · centre FAB (quick-add) · Plan · More.
 * Fixed to the viewport bottom, respects env(safe-area-inset-bottom) so gesture-nav
 * devices never clip a tab under the home indicator.
 */
export function TabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <div className="relative mx-auto flex h-16 max-w-lg items-stretch justify-between px-2">
        {TABS.slice(0, 2).map((tab) => (
          <TabLink key={tab.to} tab={tab} />
        ))}

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

        {TABS.slice(2).map((tab) => (
          <TabLink key={tab.to} tab={tab} />
        ))}
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
