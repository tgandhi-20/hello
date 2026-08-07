/**
 * Tally — first-run PIN setup + unlock screen (CONTRACTS.md §5, deliverable 6).
 *
 * A full-screen gate: rendered whenever `lockState !== 'unlocked'`. No OS
 * keyboard is ever used for the PIN — entry is a custom keypad only, so
 * there is nothing to autocomplete or spellcheck. The keypad sits in the
 * bottom third of the screen for one-handed thumb reach (CONTRACTS.md §4).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Fingerprint, Lock, AlertTriangle } from 'lucide-react';
import { useStore, hasBiometricConfigured, isBiometricAvailable } from '@/store/useStore';
import { Keypad, PinDots, PIN_LENGTH, isWeakPin } from './PinPad';

// Wrong-PIN backoff: first 2 attempts free, then increasing delay, capped at 30s.
const BACKOFF_SCHEDULE_MS = [0, 0, 3000, 8000, 15000, 30000];
function backoffForAttempt(attemptCount: number): number {
  return BACKOFF_SCHEDULE_MS[Math.min(attemptCount, BACKOFF_SCHEDULE_MS.length - 1)];
}

type Mode = 'setup-enter' | 'setup-confirm' | 'unlock';

export function LockScreen() {
  const lockState = useStore((s) => s.lockState);
  const setupPin = useStore((s) => s.setupPin);
  const unlock = useStore((s) => s.unlock);
  const unlockBiometric = useStore((s) => s.unlockBiometric);

  const [mode, setMode] = useState<Mode>(lockState === 'uninitialised' ? 'setup-enter' : 'unlock');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [weakWarning, setWeakWarning] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [backoffUntil, setBackoffUntil] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [biometricReady, setBiometricReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const triedBiometricRef = useRef(false);

  useEffect(() => {
    setMode(lockState === 'uninitialised' ? 'setup-enter' : 'unlock');
  }, [lockState]);

  // Feature-detect biometric once we're on the unlock screen.
  useEffect(() => {
    if (mode !== 'unlock') return;
    let cancelled = false;
    void (async () => {
      const [configured, available] = await Promise.all([
        hasBiometricConfigured(),
        isBiometricAvailable(),
      ]);
      if (!cancelled) setBiometricReady(configured && available);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Countdown tick while backed off.
  useEffect(() => {
    if (!backoffUntil) return;
    const id = setInterval(() => {
      const left = backoffUntil - Date.now();
      if (left <= 0) {
        setRemainingMs(0);
        setBackoffUntil(null);
        clearInterval(id);
      } else {
        setRemainingMs(left);
      }
    }, 250);
    return () => clearInterval(id);
  }, [backoffUntil]);

  const attemptBiometric = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await unlockBiometric();
      if (!ok) {
        // Silent fallback to PIN — this is expected, not an error state.
        setError(null);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, unlockBiometric]);

  // Try biometric automatically once, as soon as it's known to be available.
  useEffect(() => {
    if (mode === 'unlock' && biometricReady && !triedBiometricRef.current) {
      triedBiometricRef.current = true;
      void attemptBiometric();
    }
  }, [mode, biometricReady, attemptBiometric]);

  const isBackedOff = backoffUntil !== null && remainingMs > 0;

  async function handleComplete(fullPin: string) {
    if (mode === 'setup-enter') {
      setFirstPin(fullPin);
      setWeakWarning(isWeakPin(fullPin));
      setPin('');
      setMode('setup-confirm');
      return;
    }
    if (mode === 'setup-confirm') {
      if (fullPin !== firstPin) {
        setError("PINs didn't match — let's try again.");
        setPin('');
        setFirstPin('');
        setMode('setup-enter');
        return;
      }
      setBusy(true);
      try {
        await setupPin(fullPin);
      } finally {
        setBusy(false);
        setPin('');
      }
      return;
    }
    // mode === 'unlock'
    setBusy(true);
    setError(null);
    try {
      const ok = await unlock(fullPin);
      if (!ok) {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        setError('Incorrect PIN.');
        const delay = backoffForAttempt(nextAttempts);
        if (delay > 0) {
          setBackoffUntil(Date.now() + delay);
          setRemainingMs(delay);
        }
      } else {
        setAttempts(0);
      }
    } finally {
      setBusy(false);
      setPin('');
    }
  }

  function onDigit(d: string) {
    if (busy || isBackedOff) return;
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      void handleComplete(next);
    }
  }

  function onBackspace() {
    if (busy || isBackedOff) return;
    setPin((p) => p.slice(0, -1));
  }

  const title =
    mode === 'setup-enter' ? 'Set a PIN' : mode === 'setup-confirm' ? 'Confirm your PIN' : 'Enter PIN';
  const subtitle =
    mode === 'setup-enter'
      ? 'Choose a 6-digit PIN to encrypt your data on this device.'
      : mode === 'setup-confirm'
        ? 'Enter it again to confirm.'
        : 'Unlock Tally to continue.';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label={title}>
      {/* Top: identity + status. Deliberately not the bottom third — that's reserved for the keypad. */}
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface-1">
          <Lock size={26} className="text-accent" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-1">{title}</h1>
          <p className="mt-1 text-sm text-text-2">{subtitle}</p>
        </div>

        <PinDots length={PIN_LENGTH} filled={pin.length} />

        {weakWarning && mode === 'setup-confirm' ? (
          <div className="flex items-center gap-2 rounded-2xl border border-warning/40 bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-4 py-2 text-xs text-warning">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{weakWarning} You can still use it, but a less predictable PIN is safer.</span>
          </div>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {isBackedOff ? (
          <p className="text-sm text-text-3">Try again in {Math.ceil(remainingMs / 1000)}s</p>
        ) : null}

        {mode === 'unlock' && biometricReady ? (
          <button
            type="button"
            onClick={() => void attemptBiometric()}
            disabled={busy}
            className="mt-2 flex min-h-[48px] items-center gap-2 rounded-pill border border-border px-5 text-sm font-medium text-text-1 active:bg-surface-2 disabled:opacity-40"
          >
            <Fingerprint size={20} className="text-accent" aria-hidden="true" />
            Use fingerprint
          </button>
        ) : null}
      </div>

      {/* Bottom third: the keypad. This is the whole one-handed-use point. */}
      <div
        className="border-t border-border bg-surface-1/40 px-6 pb-8 pt-6"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <Keypad onDigit={onDigit} onBackspace={onBackspace} disabled={busy || isBackedOff} />
      </div>
    </div>
  );
}

/** Gate: renders `children` once unlocked, otherwise the lock/setup screen. */
export function LockGate({ children }: { children: React.ReactNode }) {
  const lockState = useStore((s) => s.lockState);
  if (lockState === 'unlocked') return <>{children}</>;
  return <LockScreen />;
}

// Re-exported so Settings can show "PIN is set, biometric available" state
// without duplicating the availability checks.
export { hasBiometricConfigured, isBiometricAvailable };
