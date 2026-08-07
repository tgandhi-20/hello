import React from 'react';
import { Link } from 'react-router-dom';
import { Upload, PiggyBank, Settings as SettingsIcon, ChevronRight } from 'lucide-react';
import { Card } from '@/ui/Card';
import { InstallPrompt } from '@/ui/InstallPrompt';

// NOTE: "More" has no owner in CONTRACTS.md's module ownership table — it's navigation
// chrome, not a feature vertical, so Agent 1 (Foundation) implements it directly rather
// than leaving a placeholder. It only links out to routes other agents own.
const LINKS = [
  { to: '/import', label: 'Import statement', icon: Upload },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function MoreScreen() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <InstallPrompt />
      <Card padded={false} className="overflow-hidden">
        {LINKS.map((link, i) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.to}
              to={link.to}
              className={[
                'flex min-h-[56px] items-center gap-3 px-4',
                i > 0 ? 'border-t border-border' : '',
              ].join(' ')}
            >
              <Icon size={20} className="text-text-2" aria-hidden="true" />
              <span className="flex-1 text-md text-text-1">{link.label}</span>
              <ChevronRight size={18} className="text-text-3" aria-hidden="true" />
            </Link>
          );
        })}
      </Card>
    </div>
  );
}
