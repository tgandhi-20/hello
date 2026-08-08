/**
 * Tally — shared "PIN vs passphrase" selectable option card. Used by both the
 * first-run LockScreen and the Settings unlock-method sheet, so the honest
 * copy (CONTRACTS.md §4) can never drift between the two places it appears.
 */
import React from 'react';
import { Check } from 'lucide-react';

export interface ModeOptionCardProps {
  icon: React.ReactNode;
  title: string;
  badge: string;
  selected: boolean;
  onSelect: () => void;
  /** The honest, factual guarantee/limitation copy for this mode. */
  truth: string;
  children?: React.ReactNode;
}

export function ModeOptionCard({ icon, title, badge, selected, onSelect, truth, children }: ModeOptionCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={selected}
      className={[
        'w-full cursor-pointer rounded-2xl border p-4 text-left transition-colors duration-150',
        selected ? 'border-accent bg-accent-tint' : 'border-hairline bg-surface',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <div
          className={[
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
            selected ? 'border-accent text-accent' : 'border-hairline text-ink-2',
          ].join(' ')}
        >
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-md font-semibold text-ink-1">{title}</span>
            <span className="rounded-pill bg-surface-sunk px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-3">
              {badge}
            </span>
          </div>
        </div>
        <div
          className={[
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
            selected ? 'border-accent bg-accent' : 'border-hairline',
          ].join(' ')}
          aria-hidden="true"
        >
          {selected ? <Check size={14} className="text-ink-on-accent" /> : null}
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-2">{truth}</p>
      {children}
    </div>
  );
}
