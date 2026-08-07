import React from 'react';
import { useToast } from '@/ui/Toast';
import { isQuotaExceededError, STORAGE_FULL_MESSAGE } from '@/ui/storage';

/**
 * App-wide safety net for storage-full failures that happen outside a
 * screen's own try/catch — e.g. a write triggered from an event handler
 * deep in feature code this agent doesn't own. React error boundaries can't
 * see these: they're async rejections or event-handler throws, not
 * render-phase errors, so this listens at the `window` level instead.
 *
 * Deliberately narrow: it recognises exactly one thing —
 * `QuotaExceededError` — and says nothing about any other error. That keeps
 * it from ever surfacing/leaking an arbitrary error message that might quote
 * a transaction, merchant, or amount (CONTRACTS.md §5).
 *
 * Mount once, near the root, inside `<ToastProvider>`.
 */
export function GlobalRuntimeGuard(): null {
  const { show } = useToast();

  React.useEffect(() => {
    function onRejection(event: PromiseRejectionEvent): void {
      if (isQuotaExceededError(event.reason)) {
        event.preventDefault();
        show(STORAGE_FULL_MESSAGE, { variant: 'danger', durationMs: 8000 });
      }
    }
    function onError(event: ErrorEvent): void {
      if (isQuotaExceededError(event.error)) {
        event.preventDefault();
        show(STORAGE_FULL_MESSAGE, { variant: 'danger', durationMs: 8000 });
      }
    }
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, [show]);

  return null;
}
