import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt,
  PiggyBank,
  Repeat,
  Upload,
  Target,
  CalendarCheck2,
  Flame,
  Settings as SettingsIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ListGroup, ListRow } from '@/ui';
import { InstallPrompt } from '@/ui/InstallPrompt';

interface LinkDef {
  to: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}

// "More" has no owner in CONTRACTS.md's module ownership table — it's navigation
// chrome, not a feature vertical, so the app shell owns it directly rather than
// leaving a placeholder. It only links out to routes other features own.
const MONEY_LINKS: LinkDef[] = [
  { to: '/transactions', label: 'Transactions', subtitle: 'Every logged and imported entry', icon: Receipt },
  { to: '/budgets', label: 'Budgets', subtitle: 'Category caps vs actual spend', icon: PiggyBank },
  { to: '/recurring', label: 'Recurring', subtitle: 'Detected bills and subscriptions', icon: Repeat },
  { to: '/import', label: 'Import statement', subtitle: 'CBA, Amex or Bankwest CSV', icon: Upload },
];

const PLAN_LINKS: LinkDef[] = [
  { to: '/goal', label: 'Deposit goal', subtitle: 'Projection to 30 October 2027', icon: Target },
  { to: '/routine', label: 'Routine', subtitle: 'Monthly checklist, Amex, subscriptions', icon: CalendarCheck2 },
  { to: '/habits', label: 'Habits', subtitle: 'Coffee, lunch and eating-out patterns', icon: Flame },
];

const APP_LINKS: LinkDef[] = [{ to: '/settings', label: 'Settings', subtitle: 'Income, categories, security', icon: SettingsIcon }];

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
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2">
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

export function MoreScreen() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <InstallPrompt />

      <section className="flex flex-col gap-2">
        <p className="label px-1">Money</p>
        <LinkGroup links={MONEY_LINKS} />
      </section>

      <section className="flex flex-col gap-2">
        <p className="label px-1">The plan</p>
        <LinkGroup links={PLAN_LINKS} />
      </section>

      <section className="flex flex-col gap-2">
        <p className="label px-1">App</p>
        <LinkGroup links={APP_LINKS} />
      </section>
    </div>
  );
}
