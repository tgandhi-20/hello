/**
 * Tracks how many `<Sheet>`s are currently open, app-wide, so other floating UI —
 * today, just `Toast` — can react without `Sheet` and `Toast` needing to share a
 * common ancestor or prop-drill through every screen between them.
 *
 * Why this exists: `Toast` and `Sheet` both render as `position: fixed` elements
 * pinned near the bottom of the viewport (bug: opening a transaction's edit sheet
 * while a save/undo toast is showing rendered the toast overlapping the sheet's
 * content and action row, even though the toast's z-index already put it visually
 * on top — being on top of the sheet at the *same bottom offset* is still
 * illegible, right across the Save/Delete buttons). `Toast` reads this via
 * `useSheetOpen()` and lifts itself clear of the sheet's top edge whenever one is
 * open, rather than guessing a sheet's height.
 *
 * Deliberately a tiny external store (`useSyncExternalStore`) instead of React
 * context: `Sheet` and `Toast` mount in unrelated places in the tree (`Toast`
 * lives in `ToastProvider` near the app root; `Sheet` instances mount deep inside
 * whichever screen opens one), so a context provider would have to be threaded
 * through `App.tsx` for no benefit over a plain module-level counter — and a
 * counter, not a boolean, is required because sheets can (rarely) stack.
 */
import { useSyncExternalStore } from 'react';

let openCount = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Call when a `<Sheet>` opens. Pair with exactly one `sheetClosed()` call later. */
export function sheetOpened(): void {
  openCount += 1;
  notify();
}

/** Call when that same `<Sheet>` closes (or unmounts while open). */
export function sheetClosed(): void {
  openCount = Math.max(0, openCount - 1);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return openCount > 0;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True while at least one `<Sheet>` is open anywhere in the app. */
export function useSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
