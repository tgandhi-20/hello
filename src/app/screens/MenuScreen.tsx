import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt,
  Wallet,
  Repeat,
  CreditCard,
  TrendingUp,
  PiggyBank,
  CalendarCheck,
  Upload,
  ClipboardCheck,
  ShieldCheck,
  HelpCircle,
  Settings as SettingsIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ListGroup, ListRow } from '@/ui';
import { InstallPrompt } from '@/ui/InstallPrompt';
import { AppVersionTag } from '@/ui/version';

interface LinkDef {
  to: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}

// Menu — the third tab (DESIGN-V4.md §2). A plain labelled list of everything that
// isn't Home or quick-add: a phone-book, not a dashboard. Nothing that used to be
// its own tab or sub-tab is gone — it's all one tap away here instead. Section
// headings and row labels are copied verbatim from DESIGN-V4.md §2/§3 — do not
// reword them without updating that spec first.
//
// Every row is an ordinary route push (`useNavigate`), including "Weekly catch-up"
// (`/review`, mounted from `ReviewScreen`) and "Backup & restore" (`/backup`) — both
// used to be full-screen overlays opened from local component state instead of real
// routes. Making them routes means the Android hardware back button (HashRouter)
// closes them the same sensible way it closes every other screen, rather than a
// dead end that only a dedicated close button gets you out of.
const MONEY_LINKS: LinkDef[] = [
  { to: '/transactions', label: 'All transactions', subtitle: 'Every logged and imported spend', icon: Receipt },
  { to: '/budgets', label: 'Budgets', subtitle: 'Monthly caps by category', icon: Wallet },
  { to: '/recurring', label: 'Regular payments', subtitle: 'Rent, subscriptions, bills', icon: Repeat },
  { to: '/statements', label: 'Card balances', subtitle: 'What each card will bill you', icon: CreditCard },
  // DESIGN-V4.md §2's list omitted Trends and Habits on the assumption Home's
  // "Where it went" replaced them. It doesn't: that shows this month's
  // categories, while these hold the month-by-month comparison, the calendar
  // heatmap and the coffee/no-spend streaks — the heatmap in particular was one
  // of the four features originally asked for. Leaving them routed but unlisted
  // made three screens unreachable by navigation, which is exactly the failure
  // the reachability check exists to catch. One row, not three.
  { to: '/trends', label: 'Spending patterns', subtitle: 'Month by month, the calendar, your habits', icon: TrendingUp },
];

const SAVING_LINKS: LinkDef[] = [
  { to: '/goal', label: 'Deposit plan', subtitle: 'Progress toward the apartment deposit', icon: PiggyBank },
  { to: '/routine', label: 'Monthly routine', subtitle: 'Payday, transfer, the end-of-month check', icon: CalendarCheck },
];

const DATA_LINKS: LinkDef[] = [
  { to: '/import', label: 'Import statements', subtitle: 'CBA, Amex or Bankwest CSV', icon: Upload },
  { to: '/review', label: 'Weekly catch-up', subtitle: 'Import, sort, confirm regular payments, pay Amex', icon: ClipboardCheck },
  { to: '/backup', label: 'Backup & restore', subtitle: 'Save a copy, or restore one', icon: ShieldCheck },
];

const APP_LINKS: LinkDef[] = [
  { to: '/help', label: 'How Tally works', subtitle: 'The equation, plain English', icon: HelpCircle },
  { to: '/settings', label: 'Settings', subtitle: 'Income, categories, security', icon: SettingsIcon },
];

function LinkGroup({ links }: { links: LinkDef[] }) {
  const navigate = useNavigate();
  return (
    <ListGroup>
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <ListRow
            key={link.to}
            onClick={() => navigate(link.to)}
            leading={
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunk">
                <Icon size={18} className="text-ink-2" aria-hidden="true" />
              </span>
            }
            title={link.label}
            subtitle={link.subtitle}
            chevron
          />
        );
      })}
    </ListGroup>
  );
}

export function MenuScreen() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <InstallPrompt />

      <section className="flex flex-col gap-2">
        <p className="label px-1">Money</p>
        <LinkGroup links={MONEY_LINKS} />
      </section>

      <section className="flex flex-col gap-2">
        <p className="label px-1">Saving</p>
        <LinkGroup links={SAVING_LINKS} />
      </section>

      <section className="flex flex-col gap-2">
        <p className="label px-1">Data</p>
        <LinkGroup links={DATA_LINKS} />
      </section>

      <section className="flex flex-col gap-2">
        <p className="label px-1">App</p>
        <LinkGroup links={APP_LINKS} />
      </section>

      {/* Unobtrusive build stamp — so a bug report can say which build it's on. */}
      <p className="px-1 text-center">
        <AppVersionTag />
      </p>
    </div>
  );
}
