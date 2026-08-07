/**
 * The user's current savings balance — the one number the app cannot observe.
 *
 * Tally holds transactions, not bank balances, so it can never *know* what is
 * actually sitting in the Bankwest account. The goal card therefore falls back
 * to the plan's projected figure and badges it honestly until the user tells us
 * the real one. It must never present a projection as an observation.
 *
 * PERSISTENCE: this goes through the store's encrypted `Settings`, like every
 * other user-editable figure. An earlier implementation kept it in plaintext
 * `localStorage` because `Settings` had no field for it. That was a real
 * regression, however small the datum: the whole premise of this app is that a
 * raw dump of device storage reveals nothing about the user's finances, and a
 * savings balance in the clear breaks exactly that promise. `Settings` now
 * carries `goalCurrentBalanceCents` and this reads and writes it there.
 */
import { useCallback } from 'react';
import type { Cents } from '@/types';
import { useStore } from '@/store/useStore';

export interface CurrentBalanceState {
  balanceCents: Cents;
  /**
   * False = this is `fallbackCents`, the plan's own projected figure — the app has
   * never actually been told the real balance. UI must badge these two cases
   * differently (CONTRACTS.md §4 — never imply an observed number the app can't see).
   */
  isUserEntered: boolean;
}

/**
 * `fallbackCents` should be the plan's projected balance for today (see
 * `balanceAtDate` in projection.ts) — used only until/unless the user enters a real
 * figure, and again automatically if they clear it.
 */
export function useCurrentSavingsBalance(
  fallbackCents: Cents
): [CurrentBalanceState, (cents: Cents) => void, () => void] {
  const stored = useStore((s) => s.settings.goalCurrentBalanceCents);
  const updateSettings = useStore((s) => s.updateSettings);

  const setBalance = useCallback(
    (cents: Cents) => {
      const safeCents = Number.isFinite(cents) ? Math.round(cents) : 0;
      void updateSettings({ goalCurrentBalanceCents: safeCents });
    },
    [updateSettings]
  );

  const resetBalance = useCallback(() => {
    // Back to the projected figure, honestly badged as such.
    void updateSettings({ goalCurrentBalanceCents: undefined });
  }, [updateSettings]);

  const state: CurrentBalanceState =
    stored !== undefined && stored !== null
      ? { balanceCents: stored, isUserEntered: true }
      : { balanceCents: fallbackCents, isUserEntered: false };

  return [state, setBalance, resetBalance];
}
