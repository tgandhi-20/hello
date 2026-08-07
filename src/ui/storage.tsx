import React from 'react';
import { HardDrive } from 'lucide-react';

/**
 * Tally — storage resilience (persistence request, quota estimate, and
 * `QuotaExceededError` recognition). This app's entire value is the local
 * encrypted database; Android is free to evict it under storage pressure
 * unless the origin holds "persistent" storage. See:
 * - `useRequestPersistentStorage` — call once, app-wide, after first unlock.
 * - `useStoragePersistStatus` / `StorageStatus` — read-only display, safe to
 *   mount anywhere (e.g. Settings).
 * - `useStorageEstimate` — quota usage, for the same display.
 * - `isQuotaExceededError` / `STORAGE_FULL_MESSAGE` — for write-path catch
 *   blocks anywhere in the app to surface a calm, honest failure instead of
 *   a silent lost write.
 */

/** True when `error` is the browser's storage-full signal, across the two ways it shows up. */
export function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException) {
    // `code` is deprecated but still the most reliable cross-browser check
    // (Firefox's legacy NS_ERROR_DOM_QUOTA_REACHED reports 1014, everyone
    // else reports the standard 22); `name` alone covers modern engines.
    return error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014;
  }
  return error instanceof Error && error.name === 'QuotaExceededError';
}

/**
 * Honest, calm copy for a storage-full failure (CONTRACTS.md's "never
 * scold" tone rule applies here too — this is a device constraint, not
 * something the user did wrong).
 */
export const STORAGE_FULL_MESSAGE =
  "Storage is full — Tally couldn't save that. Free up space on this device, or export a backup and remove old data.";

export interface StorageEstimateInfo {
  usageBytes: number;
  quotaBytes: number;
  /** 0–1. */
  usagePercent: number;
}

async function readEstimate(): Promise<StorageEstimateInfo | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usageBytes: usage, quotaBytes: quota, usagePercent: quota > 0 ? usage / quota : 0 };
  } catch {
    return null;
  }
}

/**
 * Storage-quota estimate (`navigator.storage.estimate()`), fetched on mount.
 * `refresh()` re-queries on demand — e.g. after a large CSV import.
 * Returns `null` on unsupported browsers or if the call fails; callers
 * should treat `null` as "unknown", not "zero".
 */
export function useStorageEstimate(): { estimate: StorageEstimateInfo | null; refresh: () => void } {
  const [estimate, setEstimate] = React.useState<StorageEstimateInfo | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    void readEstimate().then((value) => {
      if (!cancelled) setEstimate(value);
    });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { estimate, refresh: () => setTick((t) => t + 1) };
}

export type PersistState = 'unsupported' | 'checking' | 'granted' | 'denied';

/**
 * Requests `navigator.storage.persist()` exactly once, the first time
 * `enabled` is true. Intended to be called with `enabled` tied to "just
 * unlocked" (see `AppShell`, which only mounts once `LockGate` has let the
 * user in) — deliberately NOT on first paint. A persistence prompt/heuristic
 * is judged by the browser partly on engagement signals, and asking before
 * the user has done anything just trains them (and the browser) to say no.
 *
 * Safe to mount more than once / re-render: an internal ref guarantees the
 * actual `persist()` call fires at most once per page load, and already
 * having persistent storage short-circuits without re-prompting.
 */
export function useRequestPersistentStorage(enabled: boolean): PersistState {
  const [state, setState] = React.useState<PersistState>('checking');
  const requested = React.useRef(false);

  React.useEffect(() => {
    if (!enabled || requested.current) return;
    requested.current = true;
    let cancelled = false;
    void (async () => {
      if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
        if (!cancelled) setState('unsupported');
        return;
      }
      try {
        const already = (await navigator.storage.persisted?.()) ?? false;
        if (already) {
          if (!cancelled) setState('granted');
          return;
        }
        const granted = await navigator.storage.persist();
        if (!cancelled) setState(granted ? 'granted' : 'denied');
      } catch {
        if (!cancelled) setState('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}

/**
 * Read-only check of the current persisted-storage grant, for display
 * purposes. Does NOT itself request persistence — that happens exactly once,
 * from `useRequestPersistentStorage` (wired up in `AppShell`). Safe to mount
 * anywhere, any number of times, e.g. in Settings.
 */
export function useStoragePersistStatus(): PersistState {
  const [state, setState] = React.useState<PersistState>('checking');
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
        if (!cancelled) setState('unsupported');
        return;
      }
      try {
        const persisted = await navigator.storage.persisted();
        if (!cancelled) setState(persisted ? 'granted' : 'denied');
      } catch {
        if (!cancelled) setState('unsupported');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

const PERSIST_COPY: Record<PersistState, string> = {
  checking: 'Checking…',
  granted: 'Protected — Android is far less likely to clear this app’s data under storage pressure.',
  denied: 'Not protected — Android may clear this app’s data if storage runs low.',
  unsupported: 'Persistent storage isn’t supported by this browser.',
};

/**
 * Drop-in storage status line for a Settings screen: persisted-storage grant
 * (stated honestly either way, per CONTRACTS.md's tone rule) plus a quota
 * estimate. Fetches its own state — mount with no props anywhere, e.g.:
 *
 * ```tsx
 * import { StorageStatus } from '@/ui/storage';
 * // ...
 * <StorageStatus />
 * ```
 */
export function StorageStatus({ className = '' }: { className?: string }): React.ReactElement {
  const persistState = useStoragePersistStatus();
  const { estimate } = useStorageEstimate();

  return (
    <div className={['flex items-start gap-3 rounded-card bg-surface-1 p-4', className].join(' ')}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
        <HardDrive size={16} className="text-ink-2" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-1">Storage</p>
        <p className="mt-0.5 text-xs text-ink-2">{PERSIST_COPY[persistState]}</p>
        {estimate ? (
          <p className="mt-1 text-xs text-ink-3 tabular-nums">
            {formatBytes(estimate.usageBytes)} used of {formatBytes(estimate.quotaBytes)} available
          </p>
        ) : null}
      </div>
    </div>
  );
}
