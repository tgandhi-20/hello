import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, ListPlus, Plus, TrendingUp, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { vibrate } from '@/ui/haptics';

interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const TABS: TabDef[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/log', label: 'Log', icon: ListPlus },
  { to: '/trends', label: 'Trends', icon: TrendingUp },
  { to: '/more', label: 'More', icon: MoreHorizontal },
];

/**
 * Bottom tab bar: Home · Log · centre FAB (quick-add) · Trends · More.
 * Fixed to the viewport bottom, respects env(safe-area-inset-bottom) so gesture-nav
 * devices never clip a tab under the home indicator.
 */
export function TabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-[rgba(13,15,19,0.92)] backdrop-blur"
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
            className="flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform duration-200 active:scale-95"
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
          isActive ? 'text-accent' : 'text-text-3',
        ].join(' ')
      }
    >
      <Icon size={22} strokeWidth={2} />
      <span>{tab.label}</span>
    </NavLink>
  );
}
