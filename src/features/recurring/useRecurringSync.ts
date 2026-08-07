import { useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { detectRecurring } from './detect';
import { todayStr } from '@/ui';

/**
 * Runs the detection engine whenever transactions change and persists the result via
 * `setRecurring()`. Muted flags and ids are preserved across re-runs (see
 * `detectRecurring`'s `existing` param) so a user's mute/confirm choices stick.
 *
 * Only writes back when the detected set actually differs, to avoid a redundant
 * encrypted write on every keystroke-adjacent re-render.
 */
export function useRecurringSync(): void {
  const txns = useStore((s) => s.txns);
  const recurring = useStore((s) => s.recurring);
  const setRecurring = useStore((s) => s.setRecurring);
  const lastSignature = useRef<string>('');

  useEffect(() => {
    const detected = detectRecurring(txns, recurring, { today: todayStr() });
    const signature = JSON.stringify(
      detected.map((s) => [s.id, s.merchant, s.cadence, s.amountCents, s.lastSeen, s.nextDue, s.muted, s.priceIncreaseCents])
    );
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    void setRecurring(detected);
    // Only re-run when the transaction set changes — `recurring` itself changing (e.g.
    // a mute toggle) is folded into `detected` via `existing` without needing a re-scan
    // trigger from that same state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns]);
}
