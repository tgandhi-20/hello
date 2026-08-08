import React from 'react';

export interface TopBarProps {
  title: string;
  actions?: React.ReactNode;
}

/**
 * Top app bar: title + optional trailing actions. Respects env(safe-area-inset-top).
 *
 * The `<h1>` forwards its ref and carries `tabIndex={-1}` so `AppShell` can move
 * keyboard/screen-reader focus to it on every route change (a skip-to-content
 * affordance is overkill for a 5-tab mobile app, but a screen-reader user still
 * needs *some* signal that navigation happened — CONTRACTS.md's a11y pass).
 */
export const TopBar = React.forwardRef<HTMLHeadingElement, TopBarProps>(function TopBar(
  { title, actions },
  ref
) {
  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-ground px-4"
      style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(56px + env(safe-area-inset-top))' }}
    >
      <h1 ref={ref} tabIndex={-1} className="truncate text-lg font-semibold text-ink-1 outline-none">
        {title}
      </h1>
      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </header>
  );
});
