import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface ListGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Groups related `ListRow`s into ONE surface with hairline dividers between them,
 * rather than giving each row its own card (DESIGN.md §4/§5 — this is what removes
 * most of v1's box-soup). Rounded once, at the group's own corners; individual rows
 * never carry their own radius or border.
 */
export const ListGroup = React.forwardRef<HTMLDivElement, ListGroupProps>(function ListGroup(
  { className = '', children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={['divide-y divide-hairline overflow-hidden rounded-card bg-surface-1', className].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
});

export interface ListRowProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  /** Leading element, e.g. a `<CategoryIcon>`. */
  leading?: React.ReactNode;
  /** Primary label — `text-md` ink-1. */
  title: React.ReactNode;
  /** Secondary line under the title — `text-xs` ink-2. */
  subtitle?: React.ReactNode;
  /** Trailing content, e.g. a money figure. Rendered before the chevron, if any. */
  trailing?: React.ReactNode;
  /** Show a trailing chevron (row navigates/opens something). Default false. */
  chevron?: boolean;
  /** Render as a non-interactive `<div>` instead of a `<button>` (e.g. a static summary row). */
  as?: 'button' | 'div';
}

/**
 * A single row inside a `ListGroup`. 56px minimum height (DESIGN.md §5), no border
 * or radius of its own — separation between rows comes from the group's hairline
 * dividers, not from each row being its own card.
 */
export const ListRow = React.forwardRef<HTMLButtonElement, ListRowProps>(function ListRow(
  { leading, title, subtitle, trailing, chevron = false, as = 'button', className = '', ...rest },
  ref
) {
  const content = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-md text-ink-1">{title}</span>
        {subtitle ? <span className="block truncate text-xs text-ink-2">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-md text-ink-1">{trailing}</span> : null}
      {chevron ? <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden="true" /> : null}
    </>
  );

  const rowClassName = [
    'flex min-h-[56px] w-full items-center gap-3 px-4 py-2',
    'transition-colors duration-180 ease-standard',
    className,
  ].join(' ');

  if (as === 'div') {
    // Non-interactive row: drop button-only props that don't apply to a <div>.
    const { onClick: _onClick, type: _type, disabled: _disabled, ...divRest } = rest;
    return (
      <div className={rowClassName} {...(divRest as React.HTMLAttributes<HTMLDivElement>)}>
        {content}
      </div>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      className={[
        rowClassName,
        'active:bg-surface-2 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent',
      ].join(' ')}
      {...rest}
    >
      {content}
    </button>
  );
});
