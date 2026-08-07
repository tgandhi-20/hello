import React from 'react';

export interface TopBarProps {
  title: string;
  actions?: React.ReactNode;
}

/** Top app bar: title + optional trailing actions. Respects env(safe-area-inset-top). */
export function TopBar({ title, actions }: TopBarProps) {
  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg px-4"
      style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(56px + env(safe-area-inset-top))' }}
    >
      <h1 className="truncate text-lg font-semibold text-text-1">{title}</h1>
      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </header>
  );
}
