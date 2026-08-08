import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Settings as SettingsIcon } from 'lucide-react';
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

// "More" has no owner in CONTRACTS.md's module ownership table — it's navigation
// chrome, not a feature vertical, so the app shell owns it directly rather than
// leaving a placeholder. It only links out to routes other features own.
//
// DESIGN-V3.md §4 lists More as "import, weekly review, settings". Everything else
// that used to live here (Transactions, Budgets, Statements, Recurring, Goal,
// Routine, Habits) now has a home as a Spending or Plan tab, reachable from the
// bottom bar directly — repeating those links here would just be the same
// destination behind a second door. There is no weekly-review flow built yet
// (DESIGN-V3.md §5 lists it as a functional gap, not something this IA pass
// built) — nothing links to it rather than pointing at a screen that doesn't exist.
const LINKS: LinkDef[] = [
  { to: '/import', label: 'Import statement', subtitle: 'CBA, Amex or Bankwest CSV', icon: Upload },
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

export function MoreScreen() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <InstallPrompt />

      <section className="flex flex-col gap-2">
        <p className="label px-1">Data</p>
        <LinkGroup links={LINKS} />
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
