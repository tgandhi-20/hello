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

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: 'border-border',
  success: 'border-positive',
  danger: 'border-danger',
};

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
        style={{ bottom: 'calc(88px + env(safe-area-inset-bottom))' }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={[
              'pointer-events-auto w-full max-w-sm flex items-center justify-between gap-3',
              'rounded-2xl border bg-surface-2 px-4 py-3 text-text-1 text-sm shadow-lg',
              'transition-[transform,opacity] duration-200 ease-out',
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
