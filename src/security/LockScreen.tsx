/**
 * Tally — first-run PIN/passphrase setup + unlock screen (CONTRACTS.md §5,
 * security audit follow-up: optional passphrase mode).
 *
 * A full-screen gate: rendered whenever `lockState !== 'unlocked'`. On first
 * run the user chooses between a PIN (fast, default, custom keypad, nothing
 * to autocomplete/spellcheck) and a passphrase (masked text field, higher
 * entropy). On every later launch this screen reads the vault's stored
 * `UnlockConfig` (not secret — see unlockMode.ts) to know which input widget
 * to draw, *before* anything is decrypted.
 *
 * Primary actions stay in the bottom third of the screen for one-handed use
 * (CONTRACTS.md §4) in every mode — the keypad, the passphrase field's
 * Unlock/Continue button, and the mode-choice Continue button all live there.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Fingerprint, Lock, AlertTriangle, KeyRound, Type, Check } from 'lucide-react';
import {
  useStore,
  hasBiometricConfigured,
  isBiometricAvailable,
  getUnlockConfig,
  setupPassphrase,
} from '@/store/useStore';
import { Button } from '@/ui/Button';
import { Keypad, PinDots, PinLengthStepper, PIN_LENGTH, isWeakPin } from './PinPad';
import { PassphraseField } from './PassphraseField';
import { ModeOptionCard } from './ModeOptionCard';
import {
  type UnlockMode,
  type UnlockConfig,
  DEFAULT_UNLOCK_CONFIG,
  MIN_PASSPHRASE_LENGTH,
  PIN_TRUTH,
  PASSPHRASE_TRUTH,
  isWeakPassphrase,
} from './unlockMode';

// Wrong-attempt backoff: first 2 attempts free, then increasing delay, capped at 30s.
// Applies identically to PIN and passphrase unlock — the keyspace difference is the
// point of passphrase mode, not something the in-app backoff needs to know about.
const BACKOFF_SCHEDULE_MS = [0, 0, 3000, 8000, 15000, 30000];
function backoffForAttempt(attemptCount: number): number {
  return BACKOFF_SCHEDULE_MS[Math.min(attemptCount, BACKOFF_SCHEDULE_MS.length - 1)];
}

type Screen = 'choose-mode' | 'setup-enter' | 'setup-confirm' | 'unlock';

export function LockScreen() {
  const lockState = useStore((s) => s.lockState);
  const setupPin = useStore((s) => s.setupPin);
  const unlock = useStore((s) => s.unlock);
  const unlockBiometric = useStore((s) => s.unlockBiometric);

  const [screen, setScreen] = useState<Screen>(lockState === 'uninitialised' ? 'choose-mode' : 'unlock');

  // Setup flow state.
  const [setupMode, setSetupMode] = useState<UnlockMode>('pin');
  const [setupPinLength, setSetupPinLength] = useState<number>(PIN_LENGTH);
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [firstPassphrase, setFirstPassphrase] = useState('');

  // Unlock flow state — mode read from the vault's (non-secret) meta config.
  const [unlockConfig, setUnlockConfigState] = useState<UnlockConfig>(DEFAULT_UNLOCK_CONFIG);
  const [unlockSecret, setUnlockSecret] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [weakWarning, setWeakWarning] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [backoffUntil, setBackoffUntil] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [biometricReady, setBiometricReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const triedBiometricRef = useRef(false);

  useEffect(() => {
    setScreen(lockState === 'uninitialised' ? 'choose-mode' : 'unlock');
  }, [lockState]);

  // Once we know this is an existing vault, find out (without decrypting
  // anything) which input widget to draw.
  useEffect(() => {
    if (screen !== 'unlock') return;
    let cancelled = false;
    void getUnlockConfig().then((c) => {
      if (!cancelled) setUnlockConfigState(c);
    });
    return () => {
      cancelled = true;
    };
  }, [screen]);

  // Feature-detect biometric once we're on the unlock screen.
  useEffect(() => {
    if (screen !== 'unlock') return;
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
  }, [screen]);

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
        // Silent fallback to PIN/passphrase — this is expected, not an error state.
        setError(null);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, unlockBiometric]);

  // Try biometric automatically once, as soon as it's known to be available.
  useEffect(() => {
    if (screen === 'unlock' && biometricReady && !triedBiometricRef.current) {
      triedBiometricRef.current = true;
      void attemptBiometric();
    }
  }, [screen, biometricReady, attemptBiometric]);

  const isBackedOff = backoffUntil !== null && remainingMs > 0;

  function resetSetupEntry() {
    setPin('');
    setFirstPin('');
    setPassphrase('');
    setFirstPassphrase('');
    setError(null);
  }

  function beginSetupEntry() {
    resetSetupEntry();
    setWeakWarning(null);
    setScreen('setup-enter');
  }

  async function finishSetup(config: UnlockConfig, secret: string) {
    setBusy(true);
    try {
      if (config.mode === 'pin') {
        await setupPin(secret);
      } else {
        await setupPassphrase(secret);
      }
    } finally {
      setBusy(false);
      resetSetupEntry();
    }
  }

  async function handlePinDigitComplete(fullPin: string) {
    if (screen === 'setup-enter') {
      setFirstPin(fullPin);
      setWeakWarning(isWeakPin(fullPin));
      setPin('');
      setScreen('setup-confirm');
      return;
    }
    // screen === 'setup-confirm'
    if (fullPin !== firstPin) {
      setError("PINs didn't match — let's try again.");
      setPin('');
      setFirstPin('');
      setScreen('setup-enter');
      return;
    }
    await finishSetup({ mode: 'pin', pinLength: setupPinLength }, fullPin);
  }

  function handlePassphraseContinue() {
    if (screen === 'setup-enter') {
      if (isWeakPassphrase(passphrase)) return;
      setFirstPassphrase(passphrase);
      setPassphrase('');
      setError(null);
      setScreen('setup-confirm');
      return;
    }
    // screen === 'setup-confirm'
    if (passphrase !== firstPassphrase) {
      setError("Passphrases didn't match — let's try again.");
      setPassphrase('');
      setFirstPassphrase('');
      setScreen('setup-enter');
      return;
    }
    void finishSetup({ mode: 'passphrase', pinLength: setupPinLength }, passphrase);
  }

  function onSetupDigit(d: string) {
    if (busy || isBackedOff) return;
    if (pin.length >= setupPinLength) return;
    const next = pin + d;
    setPin(next);
    if (next.length === setupPinLength) {
      void handlePinDigitComplete(next);
    }
  }
  function onSetupBackspace() {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
  }

  async function handleUnlockComplete(secret: string) {
    setBusy(true);
    setError(null);
    try {
      const ok = await unlock(secret);
      if (!ok) {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        setError(unlockConfig.mode === 'pin' ? 'Incorrect PIN.' : 'Incorrect passphrase.');
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
      setUnlockSecret('');
      setPin('');
    }
  }

  function onUnlockDigit(d: string) {
    if (busy || isBackedOff) return;
    if (pin.length >= unlockConfig.pinLength) return;
    const next = pin + d;
    setPin(next);
    if (next.length === unlockConfig.pinLength) {
      void handleUnlockComplete(next);
    }
  }
  function onUnlockBackspace() {
    if (busy || isBackedOff) return;
    setPin((p) => p.slice(0, -1));
  }

  // -------------------------------------------------------------------
  // Screen: choose PIN vs passphrase (first run only)
  // -------------------------------------------------------------------
  if (screen === 'choose-mode') {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Choose how to unlock Tally">
        <div
          className="flex flex-1 flex-col items-center gap-5 overflow-y-auto px-6 pb-4 pt-8 text-center scroll-container"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)' }}
        >
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-1">
            <Lock size={26} className="text-accent" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink-1">How should Tally unlock?</h1>
            <p className="mt-1 text-sm text-ink-2">
              Both encrypt your data the same way — this only changes how you prove it's you.
            </p>
          </div>

          <div className="flex w-full max-w-sm flex-col gap-3">
            <ModeOptionCard
              icon={<KeyRound size={20} aria-hidden="true" />}
              title="PIN"
              badge="Default"
              selected={setupMode === 'pin'}
              onSelect={() => setSetupMode('pin')}
              truth={PIN_TRUTH}
            >
              {setupMode === 'pin' ? (
                <div className="mt-3 border-t border-hairline pt-3">
                  <PinLengthStepper value={setupPinLength} onChange={setSetupPinLength} disabled={busy} />
                </div>
              ) : null}
            </ModeOptionCard>

            <ModeOptionCard
              icon={<Type size={20} aria-hidden="true" />}
              title="Passphrase"
              badge="More secure"
              selected={setupMode === 'passphrase'}
              onSelect={() => setSetupMode('passphrase')}
              truth={PASSPHRASE_TRUTH}
            />
          </div>
        </div>

        <div
          className="border-t border-hairline bg-surface-1 px-6 pb-8 pt-6"
          style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
        >
          <Button variant="primary" size="lg" fullWidth onClick={beginSetupEntry}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Screens: setup-enter / setup-confirm / unlock — shared chrome
  // -------------------------------------------------------------------
  const isSetup = screen === 'setup-enter' || screen === 'setup-confirm';
  const activeMode: UnlockMode = isSetup ? setupMode : unlockConfig.mode;

  const title = isSetup
    ? screen === 'setup-enter'
      ? activeMode === 'pin'
        ? 'Set a PIN'
        : 'Set a passphrase'
      : activeMode === 'pin'
        ? 'Confirm your PIN'
        : 'Confirm your passphrase'
    : activeMode === 'pin'
      ? 'Enter PIN'
      : 'Enter passphrase';

  const subtitle = isSetup
    ? screen === 'setup-enter'
      ? activeMode === 'pin'
        ? `Choose a ${setupPinLength}-digit PIN to encrypt your data on this device.`
        : `Choose a passphrase (at least ${MIN_PASSPHRASE_LENGTH} characters) to encrypt your data on this device.`
      : 'Enter it again to confirm.'
    : 'Unlock Tally to continue.';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label={title}>
      {/* Top: identity + status. Deliberately not the bottom third — that's reserved for entry controls. */}
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-hairline bg-surface-1">
          <Lock size={26} className="text-accent" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-ink-1">{title}</h1>
          <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
        </div>

        {activeMode === 'pin' ? (
          <PinDots length={isSetup ? setupPinLength : unlockConfig.pinLength} filled={pin.length} />
        ) : null}

        {weakWarning && screen === 'setup-confirm' ? (
          <div className="flex items-center gap-2 rounded-card bg-[color-mix(in_srgb,var(--caution)_12%,transparent)] px-4 py-2 text-xs text-caution">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{weakWarning} You can still use it, but a less predictable PIN is safer.</span>
          </div>
        ) : null}

        {error ? <p className="text-sm text-negative">{error}</p> : null}

        {isBackedOff ? (
          <p className="text-sm text-ink-3">Try again in {Math.ceil(remainingMs / 1000)}s</p>
        ) : null}

        {screen === 'unlock' && biometricReady ? (
          <button
            type="button"
            onClick={() => void attemptBiometric()}
            disabled={busy}
            className="mt-2 flex min-h-[48px] items-center gap-2 rounded-pill border border-hairline px-5 text-sm font-medium text-ink-1 active:bg-surface-2 disabled:opacity-40"
          >
            <Fingerprint size={20} className="text-accent" aria-hidden="true" />
            Use fingerprint
          </button>
        ) : null}

        {/* Passphrase entry lives here (not the keypad zone) so its strength meter and
            reveal toggle stay visible while the user types, per PassphraseField's design. */}
        {activeMode === 'passphrase' ? (
          <div className="w-full max-w-sm">
            <PassphraseField
              value={isSetup ? passphrase : unlockSecret}
              onChange={isSetup ? setPassphrase : setUnlockSecret}
              onSubmit={() => {
                if (isSetup) handlePassphraseContinue();
                else if (unlockSecret.length > 0) void handleUnlockComplete(unlockSecret);
              }}
              placeholder={activeMode === 'passphrase' ? 'Passphrase' : undefined}
              autoFocus
              disabled={busy || isBackedOff}
              showStrength={isSetup}
            />
          </div>
        ) : null}
      </div>

      {/* Bottom third: entry controls. This is the whole one-handed-use point (CONTRACTS.md §4). */}
      <div
        className="border-t border-hairline bg-surface-1 px-6 pb-8 pt-6"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        {activeMode === 'pin' ? (
          <Keypad
            onDigit={isSetup ? onSetupDigit : onUnlockDigit}
            onBackspace={isSetup ? onSetupBackspace : onUnlockBackspace}
            disabled={busy || isBackedOff}
          />
        ) : isSetup ? (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={busy || isBackedOff || isWeakPassphrase(passphrase)}
            onClick={handlePassphraseContinue}
          >
            <Check size={18} aria-hidden="true" />
            {screen === 'setup-confirm' ? 'Confirm' : 'Continue'}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={busy || isBackedOff || unlockSecret.length === 0}
            onClick={() => void handleUnlockComplete(unlockSecret)}
          >
            Unlock
          </Button>
        )}
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
