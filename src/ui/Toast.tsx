import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

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

// A toast is a floating element (DESIGN.md §4) — elevation comes from shadow, not a
// border, for the default case. success/danger genuinely earn a thin semantic border:
// it's state information, not decoration.
const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: 'border-transparent',
  success: 'border-positive',
  danger: 'border-negative',
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

let idCounter = 0;

/** Mount once near the root of the app. Screens call `useToast()` to show toasts. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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
        style={{ bottom: `calc(${TOAST_BOTTOM_OFFSET_PX}px + env(safe-area-inset-bottom))` }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={[
              'pointer-events-auto w-full max-w-sm flex items-center justify-between gap-3',
              'rounded-card border bg-surface-3 px-4 py-3 text-ink-1 text-sm shadow-[0_8px_24px_rgba(0,0,0,0.4)]',
              'transition-[transform,opacity] duration-180 ease-standard',
              VARIANT_CLASSES[t.variant ?? 'default'],
            ].join(' ')}
          >
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.actionLabel ? (
              <button
                type="button"
                className="shrink-0 min-h-[48px] px-2 font-semibold text-accent"
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
