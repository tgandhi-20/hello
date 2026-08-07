import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon: LucideIcon;
  headline: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}

/** A brand-new install with zero data must look intentional and inviting, not broken. */
export function EmptyState({ icon: Icon, headline, body, action, className = '' }: EmptyStateProps) {
  return (
    <div className={['flex flex-col items-center gap-3 px-6 py-12 text-center', className].join(' ')}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-1">
        <Icon size={28} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
      </div>
      <h3 className="title">{headline}</h3>
      {body ? <p className="max-w-xs text-sm text-ink-2">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
