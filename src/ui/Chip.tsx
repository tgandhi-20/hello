import React from 'react';

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** `positive`/`warning`/`danger` are retained prop names (API is frozen) but map
   * to v3 tokens. DESIGN-V3.md §1 deliberately has no second "positive" green — a
   * second green would collide with `--accent` — so `positive` paints identically
   * to `accent` (the calm, "on track reads as absence of warning" read); `warning`/
   * `danger` map to `caution`/`critical`. */
  tone?: 'neutral' | 'accent' | 'positive' | 'warning' | 'danger';
}

const TONE_CLASSES: Record<NonNullable<ChipProps['tone']>, string> = {
  neutral: 'border-hairline text-ink-2',
  accent: 'border-accent text-accent',
  positive: 'border-accent text-accent',
  warning: 'border-caution text-caution',
  danger: 'border-critical text-critical',
};

/** Small tag / filter pill. Renders as a `<button>` — pass `type="button"` semantics are default. */
export function Chip({
  selected = false,
  tone = 'neutral',
  className = '',
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={[
        'inline-flex min-h-[48px] items-center rounded-pill border px-4 text-sm font-medium',
        'transition-colors duration-180 ease-standard',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        selected ? 'bg-accent-tint border-accent text-accent' : TONE_CLASSES[tone],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
