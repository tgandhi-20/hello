import React from 'react';

export type StatusPillTone = 'accent' | 'caution' | 'critical' | 'neutral';

export interface StatusPillProps {
  tone?: StatusPillTone;
  children: React.ReactNode;
  /** Leading dot before the label. Default true — the dot is the whole point (see below). */
  dot?: boolean;
  className?: string;
}

const TONE_CLASSES: Record<StatusPillTone, string> = {
  accent: 'bg-accent-tint text-accent',
  caution: 'bg-caution-tint text-caution',
  critical: 'bg-critical-tint text-critical',
  neutral: 'bg-surface-sunk text-ink-2',
};

const DOT_CLASSES: Record<StatusPillTone, string> = {
  accent: 'bg-accent',
  caution: 'bg-caution',
  critical: 'bg-critical',
  neutral: 'bg-ink-3',
};

/**
 * Non-interactive status pill — DESIGN-V3.md §3: "encode state in form, not
 * only in number". A tinted pill (never a border+shadow combo, and never
 * just coloured text on its own) so "on track" / "near cap" / "over" reads
 * at a glance even for a viewer scanning past the actual figure. Renders as
 * a `<span>`, not a `<button>` — this communicates state, it doesn't do
 * anything on tap. For a tappable filter/tag use `Chip` instead.
 */
export function StatusPill({ tone = 'neutral', children, dot = true, className = '' }: StatusPillProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      ].join(' ')}
    >
      {dot ? <span className={['h-1.5 w-1.5 shrink-0 rounded-full', DOT_CLASSES[tone]].join(' ')} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
