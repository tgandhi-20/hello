import React from 'react';

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  tone?: 'neutral' | 'accent' | 'positive' | 'warning' | 'danger';
}

const TONE_CLASSES: Record<NonNullable<ChipProps['tone']>, string> = {
  neutral: 'border-border text-text-2',
  accent: 'border-accent text-accent',
  positive: 'border-positive text-positive',
  warning: 'border-warning text-warning',
  danger: 'border-danger text-danger',
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
        'transition-colors duration-200',
        selected ? 'bg-[var(--accent-tint-12)] border-accent text-accent' : TONE_CLASSES[tone],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
