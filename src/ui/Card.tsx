import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  interactive?: boolean;
}

/**
 * Base surface for grouped content. DESIGN.md §5: no border by default —
 * separation from the ground comes from tone (`--surface-1`), not a drawn
 * line. Add a border via `className` only for a card that genuinely earns
 * one (rare); don't reach for it as a default separator.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { padded = true, interactive = false, className = '', children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={[
        'bg-surface-1 rounded-card',
        padded ? 'p-4' : '',
        interactive ? 'active:bg-surface-2 transition-colors duration-180 ease-standard' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
});
