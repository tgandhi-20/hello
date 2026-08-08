import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useSheetOpen } from './sheetStack';

export type ToastVariant = 'default' | 'success' | 'danger';

export interface ToastOptions {
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. Default 4000. */
  durationMs?: number;
  /** e.g. "Undo" for a quick-add confirmation toast. */
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastItem extends ToastOptions {
  id: string;
  message: string;
}

export interface ToastContextValue {
  show: (message: string, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// A toast is a floating element (DESIGN-V3.md §1) — elevation comes from shadow,
// never a border on the same element ("Never a border and a shadow on the same
// element" is one of DESIGN-V3.md §1's non-negotiables, not a suggestion). This
// used to carry state via a `border-accent`/`border-critical` ring alongside
// `shadow-elevated`, which was exactly that violation — visible on every single
// quick-add save and import, i.e. the app's single most frequent piece of chrome.
// success/danger still earn to read as state, not decoration, so state is carried
// by a background tint instead (the same tint tokens icon wells and selected rows
// already use), never a drawn line. No second "positive" green in v3 (DESIGN-V3.md
// §1), so `success` uses `--accent-tint` — the app's one green, at low strength.
const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: 'bg-surface',
  success: 'bg-accent-tint',
  danger: 'bg-critical-tint',
};

/**
 * Distance the toast stack sits above the screen bottom (clears the 5-tab bar).
 * Exported so scrollable screens that sit under a toast — quick-add's category grid,
 * the transactions list — can reserve exactly this much bottom padding and never have
 * their last row hidden under a toast for its whole lifetime.
 */
export const TOAST_BOTTOM_OFFSET_PX = 88;
/** Toast pill height + its gap from the offset above, padded a little for comfort. */
const TOAST_HEIGHT_ALLOWANCE_PX = 72;
/** Total bottom padding a scroll container should reserve so a toast never covers its
 * last row. `calc()` so it still respects the safe-area inset on gesture-nav phones. */
export const TOAST_RESERVE_BOTTOM = `calc(${TOAST_BOTTOM_OFFSET_PX + TOAST_HEIGHT_ALLOWANCE_PX}px + env(safe-area-inset-bottom))`;

/**
 * A `<Sheet>` is anchored to the bottom of the screen and can grow tall enough
 * (header + form content + footer actions) to reach well above the toast's usual
 * `TOAST_BOTTOM_OFFSET_PX` resting spot — so a toast shown while a sheet is open
 * would sit on top of (z-index-wise) but visually across the sheet's content and
 * its Save/Delete row, which reads as broken even though nothing is technically
 * hidden. Rather than try to measure an arbitrary sheet's height, dock the toast
 * just under the top bar instead: a sheet's scrim never covers that region, and
 * the toast's higher z-index keeps it legible above the dimmed backdrop.
 */
const TOAST_TOP_OFFSET_WITH_SHEET = 'calc(56px + env(safe-area-inset-top) + 12px)';

let idCounter = 0;

/** Mount once near the root of the app. Screens call `useToast()` to show toasts. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // While any <Sheet> is open, dock toasts near the top instead of the bottom —
  // see TOAST_TOP_OFFSET_WITH_SHEET's comment.
  const sheetOpen = useSheetOpen();

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      const id = `toast-${++idCounter}`;
      const item: ToastItem = { id, message, ...opts };
      setToasts((prev) => [...prev, item]);
      const timer = setTimeout(() => dismiss(id), opts.durationMs ?? 4000);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="fixed left-0 right-0 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none"
        style={
          sheetOpen
            ? { top: TOAST_TOP_OFFSET_WITH_SHEET }
            : { bottom: `calc(${TOAST_BOTTOM_OFFSET_PX}px + env(safe-area-inset-bottom))` }
        }
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={[
              'pointer-events-auto w-full max-w-sm flex items-center justify-between gap-3',
              'rounded-card px-4 py-3 text-ink-1 text-sm shadow-elevated',
              'transition-[transform,opacity] duration-180 ease-standard',
              VARIANT_CLASSES[t.variant ?? 'default'],
            ].join(' ')}
          >
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.actionLabel ? (
              <button
                type="button"
                className="shrink-0 min-h-[48px] px-2 font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Access the toast dispatcher. Must be called under `<ToastProvider>`. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}
