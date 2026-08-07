import React, { useEffect, useState } from 'react';

export interface ChartEnterProps {
  children: React.ReactNode;
  className?: string;
  /** Delay the entrance slightly, e.g. to stagger a list of bars. Milliseconds. */
  delayMs?: number;
}

/**
 * Entrance-animation wrapper shared by every chart in the kit.
 *
 * Design law (CONTRACTS.md §4): animations are <=200ms and touch only `transform`/
 * `opacity` — never width, stroke-dasharray, or other layout-triggering properties.
 * Charts therefore render their final geometry immediately and only fade/scale the
 * whole shape in, rather than animating the data itself. `prefers-reduced-motion` is
 * handled globally in tokens.css (all transition/animation durations collapse to
 * ~0), so this component needs no extra media-query handling of its own.
 */
export function ChartEnter({ children, className = '', delayMs = 0 }: ChartEnterProps) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const t = setTimeout(() => setEntered(true), delayMs);
      return () => clearTimeout(t);
    });
    return () => cancelAnimationFrame(raf);
  }, [delayMs]);

  return (
    <div
      className={className}
      style={{
        opacity: entered ? 1 : 0,
        transform: entered ? 'scale(1)' : 'scale(0.96)',
        transformOrigin: 'center',
        transition: 'opacity 200ms var(--ease-standard), transform 200ms var(--ease-standard)',
      }}
    >
      {children}
    </div>
  );
}
