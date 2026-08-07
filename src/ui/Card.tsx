import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  interactive?: boolean;
}

/** Base surface for grouped content — cards sit on `--surface-1` above true black. */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { padded = true, interactive = false, className = '', children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={[
        'bg-surface-1 border border-border rounded-card',
        padded ? 'p-4' : '',
        interactive ? 'active:bg-surface-2 transition-colors duration-200' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
});
