import React from 'react';

export interface WhyLineProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * DESIGN-V4.md §4.2: "Every derived figure gets one plain line beneath it —
 * '$800 left, spread over the 24 days to the end of August.'" This is that
 * line: one plain-English sentence, `--ink-2`, no jargon, always singular
 * (one `<p>`, not a list) — the whole point is that it reads in one glance
 * and never needs a second read.
 *
 * Deliberately dumb: it takes children (the finished sentence), not raw
 * numbers to format — so this component can never become a second place
 * that computes anything. The caller (Home, Budgets, wherever) always
 * derives its sentence from the SAME `computeMonthMoney()` result already
 * driving the number above it; this just renders the words underneath.
 *
 * Exported from `src/features/help` (not `src/ui`) because it's this
 * feature's teaching device, not a generic UI primitive — but it's a plain,
 * dependency-free component, safe for any other screen to import.
 */
export function WhyLine({ children, className = '' }: WhyLineProps) {
  return <p className={['text-xs text-ink-2', className].join(' ')}>{children}</p>;
}
