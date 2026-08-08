import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  interactive?: boolean;
}

/**
 * Base surface for grouped content. DESIGN-V3.md §1: white cards lift off
 * the neutral `--ground` with a soft shadow — never a border. Never add a
 * border to a card via `className`; if a card needs a boundary, that's the
 * shadow's job, not a drawn line on the same element.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { padded = true, interactive = false, className = '', children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={[
        'bg-surface rounded-card shadow-card',
        padded ? 'p-4' : '',
        interactive ? 'active:bg-surface-sunk transition-colors duration-180 ease-standard' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
});
