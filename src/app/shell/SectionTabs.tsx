import React from 'react';
import { NavLink } from 'react-router-dom';

export interface SectionTabDef {
  to: string;
  label: string;
}

export interface SectionTabsProps {
  tabs: SectionTabDef[];
  ariaLabel: string;
}

/**
 * Horizontally-scrollable row of section links, used by the Spending and
 * Plan container screens (DESIGN-V3.md §4) to switch between the existing
 * feature screens they host as tabs. A `SegmentedControl` (equal-width
 * columns) was considered and rejected here: Plan hosts five sections
 * ("Statements" alone), which at a 412px viewport leaves under 80px per
 * column — too narrow to stay legible. A scrollable pill row is the
 * standard mobile pattern for more items than comfortably fit (iOS
 * Settings' own section switchers use the same approach), and every pill
 * still clears the 48px touch-target minimum.
 *
 * Plain `<NavLink>`s, not a JS-driven ARIA tablist: these are real routes
 * (`/spending/transactions`, `/plan/goal`, …), so browser back/forward and
 * the Android hardware back button already do the right thing for free —
 * building a second, parallel "selected tab" state would just be something
 * else to keep in sync with the URL.
 */
export function SectionTabs({ tabs, ariaLabel }: SectionTabsProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="scroll-container flex gap-2 overflow-x-auto px-4 pb-1 pt-3"
      style={{ scrollbarWidth: 'none' }}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            [
              'flex min-h-[48px] shrink-0 items-center rounded-pill px-4 text-sm font-medium',
              'transition-colors duration-180 ease-standard',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              isActive ? 'bg-accent text-ink-on-accent' : 'bg-surface text-ink-2 shadow-card active:bg-surface-sunk',
            ].join(' ')
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
