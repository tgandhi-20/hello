/**
 * Tally — change PIN, change passphrase, or switch between the two
 * (CONTRACTS.md §5, security audit follow-up: optional passphrase mode).
 *
 * Flow: current secret (whichever widget the vault currently uses) → choose
 * new mode (PIN or passphrase, same honest copy as first-run setup) → new
 * secret, twice to confirm. The actual key rotation is `changePin` /
 * `switchToPassphrase` in useStore.ts — both thin wrappers over the same
 * `setUnlockSecret` re-encrypt-and-verify mechanism, so "just change my PIN"
 * and "switch to a passphrase" are the same operation under the hood
 * (deliverable 4: reuse the migration mechanism, don't build a second one).
 */
import React, { useEffect, useState } from 'react';
import { KeyRound, Type } from 'lucide-react';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/Button';
import { useToast } from '@/ui/Toast';
import { Keypad, PinDots, PinLengthStepper, PIN_LENGTH, isWeakPin } from '@/security/PinPad';
import { PassphraseField } from '@/security/PassphraseField';
import { ModeOptionCard } from '@/security/ModeOptionCard';
import {
  type UnlockMode,
  type UnlockConfig,
  DEFAULT_UNLOCK_CONFIG,
  PIN_TRUTH,
  PASSPHRASE_TRUTH,
  isWeakPassphrase,
} from '@/security/unlockMode';
import { getUnlockConfig, changePin, switchToPassphrase } from '@/store/useStore';

export interface ChangeUnlockSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful change, so Settings can refresh the mode it displays. */
  onChanged?: () => void;
}

type Step = 'current' | 'choose-mode' | 'new-enter' | 'new-confirm';

export function ChangeUnlockSheet({ open, onClose, onChanged }: ChangeUnlockSheetProps) {
  const { show } = useToast();
  const [step, setStep] = useState<Step>('current');
  const [currentConfig, setCurrentConfig] = useState<UnlockConfig>(DEFAULT_UNLOCK_CONFIG);

  // Current-secret entry (widget depends on currentConfig.mode).
  const [currentPin, setCurrentPin] = useState('');
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [capturedCurrentSecret, setCapturedCurrentSecret] = useState('');

  // New-secret entry.
  const [newMode, setNewMode] = useState<UnlockMode>('pin');
  const [newPinLength, setNewPinLength] = useState(PIN_LENGTH);
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [firstPassphrase, setFirstPassphrase] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void getUnlockConfig().then((c) => {
      setCurrentConfig(c);
      setNewMode(c.mode);
      setNewPinLength(c.pinLength || PIN_LENGTH);
    });
  }, [open]);

  function reset() {
    setStep('current');
    setCurrentPin('');
    setCurrentPassphrase('');
    setCapturedCurrentSecret('');
    setPin('');
    setFirstPin('');
    setPassphrase('');
    setFirstPassphrase('');
    setError(null);
    setWarning(null);
    setBusy(false);
  }

  function handleClose() {
    // No-op while `busy` — `<Sheet busy>` already suppresses Escape/backdrop/drag,
    // this is belt-and-braces for any other path that might call onClose directly.
    if (busy) return;
    reset();
    onClose();
  }

  // --- step: current secret --------------------------------------------

  function proceedFromCurrent(secret: string) {
    setCapturedCurrentSecret(secret);
    setError(null);
    setStep('choose-mode');
  }

  function onCurrentDigit(d: string) {
    if (busy) return;
    if (currentPin.length >= currentConfig.pinLength) return;
    const next = currentPin + d;
    setCurrentPin(next);
    if (next.length === currentConfig.pinLength) proceedFromCurrent(next);
  }
  function onCurrentBackspace() {
    if (busy) return;
    setCurrentPin((p) => p.slice(0, -1));
  }

  // --- step: choose mode --------------------------------------------------

  function proceedFromChooseMode() {
    setPin('');
    setFirstPin('');
    setPassphrase('');
    setFirstPassphrase('');
    setError(null);
    setWarning(null);
    setStep('new-enter');
  }

  // --- step: new secret (PIN) ---------------------------------------------

  function onNewDigit(d: string) {
    if (busy) return;
    if (pin.length >= newPinLength) return;
    const next = pin + d;
    setPin(next);
    if (next.length === newPinLength) void handleNewPinComplete(next);
  }
  function onNewBackspace() {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
  }

  async function handleNewPinComplete(fullPin: string) {
    if (step === 'new-enter') {
      setFirstPin(fullPin);
      setWarning(isWeakPin(fullPin));
      setPin('');
      setStep('new-confirm');
      return;
    }
    if (fullPin !== firstPin) {
      setError("New PINs didn't match — let's try the new PIN again.");
      setPin('');
      setFirstPin('');
      setStep('new-enter');
      return;
    }
    await commit('pin', fullPin);
  }

  // --- step: new secret (passphrase) --------------------------------------

  function handleNewPassphraseContinue() {
    if (step === 'new-enter') {
      if (isWeakPassphrase(passphrase)) return;
      setFirstPassphrase(passphrase);
      setPassphrase('');
      setError(null);
      setStep('new-confirm');
      return;
    }
    if (passphrase !== firstPassphrase) {
      setError("New passphrases didn't match — let's try again.");
      setPassphrase('');
      setFirstPassphrase('');
      setStep('new-enter');
      return;
    }
    void commit('passphrase', passphrase);
  }

  // --- commit ---------------------------------------------------------------

  async function commit(mode: UnlockMode, newSecret: string) {
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'pin'
          ? await changePin(capturedCurrentSecret, newSecret)
          : await switchToPassphrase(capturedCurrentSecret, newSecret);
      if (!result.ok) {
        // Wrong current secret (or a rare fail-safe verification failure) —
        // send the user back to the start rather than guess which step failed.
        setError(result.error ?? 'Could not change how Tally unlocks.');
        setStep('current');
        setCurrentPin('');
        setCurrentPassphrase('');
        setCapturedCurrentSecret('');
        return;
      }
      show(mode === 'pin' ? 'PIN changed.' : 'Switched to a passphrase. Your data is unchanged.', {
        variant: 'success',
      });
      onChanged?.();
      handleClose();
    } finally {
      setBusy(false);
    }
  }

  const title =
    step === 'current'
      ? currentConfig.mode === 'pin'
        ? 'Enter current PIN'
        : 'Enter current passphrase'
      : step === 'choose-mode'
        ? 'Choose how to unlock'
        : newMode === 'pin'
          ? step === 'new-enter'
            ? 'Choose a new PIN'
            : 'Confirm new PIN'
          : step === 'new-enter'
            ? 'Choose a new passphrase'
            : 'Confirm new passphrase';

  return (
    <Sheet open={open} onClose={handleClose} title={title} busy={busy}>
      <div className="flex flex-col gap-5 py-2">
        {step === 'current' ? (
          currentConfig.mode === 'pin' ? (
            <div className="flex flex-col items-center gap-5">
              <PinDots length={currentConfig.pinLength} filled={currentPin.length} />
              {error ? <p className="text-center text-sm text-negative">{error}</p> : null}
              <Keypad onDigit={onCurrentDigit} onBackspace={onCurrentBackspace} disabled={busy} />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <PassphraseField
                value={currentPassphrase}
                onChange={setCurrentPassphrase}
                onSubmit={() => {
                  if (currentPassphrase.length > 0) proceedFromCurrent(currentPassphrase);
                }}
                autoFocus
                disabled={busy}
              />
              {error ? <p className="text-center text-sm text-negative">{error}</p> : null}
              <Button
                variant="primary"
                fullWidth
                disabled={busy || currentPassphrase.length === 0}
                onClick={() => proceedFromCurrent(currentPassphrase)}
              >
                Continue
              </Button>
            </div>
          )
        ) : null}

        {step === 'choose-mode' ? (
          <div className="flex flex-col gap-3">
            <ModeOptionCard
              icon={<KeyRound size={20} aria-hidden="true" />}
              title="PIN"
              badge="Fast"
              selected={newMode === 'pin'}
              onSelect={() => setNewMode('pin')}
              truth={PIN_TRUTH}
            >
              {newMode === 'pin' ? (
                <div className="mt-3 border-t border-hairline pt-3">
                  <PinLengthStepper value={newPinLength} onChange={setNewPinLength} disabled={busy} />
                </div>
              ) : null}
            </ModeOptionCard>
            <ModeOptionCard
              icon={<Type size={20} aria-hidden="true" />}
              title="Passphrase"
              badge="More secure"
              selected={newMode === 'passphrase'}
              onSelect={() => setNewMode('passphrase')}
              truth={PASSPHRASE_TRUTH}
            />
            <Button variant="primary" fullWidth onClick={proceedFromChooseMode}>
              Continue
            </Button>
          </div>
        ) : null}

        {(step === 'new-enter' || step === 'new-confirm') && newMode === 'pin' ? (
          <div className="flex flex-col items-center gap-5">
            <PinDots length={newPinLength} filled={pin.length} />
            {warning && step === 'new-confirm' ? (
              <p className="text-center text-xs text-caution">{warning} You can still use it.</p>
            ) : null}
            {error ? <p className="text-center text-sm text-negative">{error}</p> : null}
            <Keypad onDigit={onNewDigit} onBackspace={onNewBackspace} disabled={busy} />
          </div>
        ) : null}

        {(step === 'new-enter' || step === 'new-confirm') && newMode === 'passphrase' ? (
          <div className="flex flex-col gap-4">
            <PassphraseField
              value={passphrase}
              onChange={setPassphrase}
              onSubmit={handleNewPassphraseContinue}
              autoFocus
              disabled={busy}
              showStrength={step === 'new-enter'}
            />
            {error ? <p className="text-center text-sm text-negative">{error}</p> : null}
            <Button
              variant="primary"
              fullWidth
              disabled={
                busy ||
                (step === 'new-enter' && isWeakPassphrase(passphrase)) ||
                (step === 'new-confirm' && passphrase.length === 0)
              }
              onClick={handleNewPassphraseContinue}
            >
              {step === 'new-confirm' ? 'Confirm' : 'Continue'}
            </Button>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
