import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Tally — service-worker update UX.
 *
 * `vite.config.ts` deliberately sets `registerType: 'prompt'` (not the
 * `'autoUpdate'` CONTRACTS.md originally specified) and `injectRegister:
 * false` — see that file's comment for the full reasoning. Summary: in
 * `'autoUpdate'` mode, vite-plugin-pwa's auto-injected registration script
 * activates a new service worker and reloads the page the moment one is
 * found, with no user involvement. For an installed PWA holding someone's
 * only copy of their financial data, an unannounced reload mid-entry (e.g.
 * half-way through logging a transaction) can lose that entry. `'prompt'`
 * mode leaves the new worker waiting until this code explicitly tells it to
 * activate, which only happens in response to the user tapping "Reload"
 * below.
 */
export interface UseServiceWorkerUpdateResult {
  /** A new build is installed and waiting — safe to show an update affordance. */
  updateAvailable: boolean;
  /** Briefly true right after the app first becomes available offline. */
  offlineReady: boolean;
  /** Activates the waiting worker and reloads. Call ONLY from a user action. */
  applyUpdate: () => void;
}

/**
 * Registers the app's service worker (manual registration, see the module
 * doc above) and exposes whether a new version is waiting. Safe to call
 * from more than one component — `useRegisterSW` is idempotent per the
 * underlying `virtual:pwa-register/react` module.
 */
export function useServiceWorkerUpdate(): UseServiceWorkerUpdateResult {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    // Deliberately no console output on registration failure — SW support
    // varies by browser and a failed registration here isn't financial data,
    // but it also isn't actionable by the user; the app should just carry on
    // working online/offline via a normal page load either way.
    onRegisterError: () => {},
  });

  const applyUpdate = React.useCallback(() => {
    setNeedRefresh(false);
    void updateServiceWorker(true);
  }, [setNeedRefresh, updateServiceWorker]);

  // The "offline ready" flag is a one-time confirmation, not an ongoing
  // status — clear it after a few seconds so it can't linger as stale chrome.
  React.useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => setOfflineReady(false), 4000);
    return () => clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  return { updateAvailable: needRefresh, offlineReady, applyUpdate };
}

/**
 * Registers the service worker immediately, independent of PIN/passphrase
 * lock state. Mount this once at the very root of the app (see `App.tsx`) —
 * NOT only inside the post-unlock shell.
 *
 * This matters for CONTRACTS.md's "works fully offline, forever": the app's
 * routed screens (and `UpdateBanner`'s own visible affordance) only mount
 * after `LockGate` lets the user past the PIN screen, which is exactly why a
 * device that's never been unlocked yet — or was reinstalled, or cleared its
 * cache — needs the *lock screen itself* to have been precached before it's
 * ever needed offline. Waiting for unlock to register the worker would leave
 * a real gap: go offline before the first unlock ever completes, and there's
 * nothing cached to serve. Registering here, unconditionally, closes that
 * gap. Calling `useRegisterSW` again later from `UpdateBanner` is safe and
 * cheap — the underlying registration is keyed by service-worker URL and is
 * idempotent, so the second call just attaches to the same registration
 * rather than creating a duplicate.
 */
export function ServiceWorkerRegistrar(): null {
  useServiceWorkerUpdate();
  return null;
}

/**
 * Unobtrusive "Update available · Reload" banner. Renders nothing until a
 * new build is actually waiting. Mount once in the app shell, above the
 * routed content — it sits between the top bar and the screen body so it
 * never competes with the bottom tab bar, the quick-add FAB, or the toast
 * stack, all of which live in the bottom third by design.
 */
export function UpdateBanner(): React.ReactElement | null {
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex items-center justify-between gap-3 border-b border-hairline bg-accent-tint px-4 py-2"
    >
      <span className="flex min-w-0 items-center gap-2 text-sm text-ink-1">
        <RefreshCw size={16} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate">Update available</span>
      </span>
      <button
        type="button"
        onClick={applyUpdate}
        className="flex min-h-[48px] shrink-0 items-center justify-center rounded-pill bg-accent px-4 text-sm font-semibold text-ink-on-accent transition-[transform,background-color] duration-180 ease-standard active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Reload
      </button>
    </div>
  );
}
