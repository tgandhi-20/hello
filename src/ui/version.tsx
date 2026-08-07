import React from 'react';

/**
 * Build-time version stamp, injected via `define` in `vite.config.ts` from
 * `package.json`'s `version` field (see that file's comment) — so it always
 * reflects the exact build running, useful when something looks wrong and
 * the user needs to tell you which build they're on. `typeof` guard covers
 * any context where the define somehow didn't run (e.g. a stray non-Vite
 * test harness importing this file directly).
 */
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** Quiet, unobtrusive version label — drop anywhere low-emphasis, e.g. the bottom of a settings list. */
export function AppVersionTag({ className = '' }: { className?: string }): React.ReactElement {
  return <span className={['text-2xs text-ink-3 tabular-nums', className].join(' ')}>Tally v{APP_VERSION}</span>;
}
