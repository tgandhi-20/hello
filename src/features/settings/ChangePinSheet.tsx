import React, { useState } from 'react';
import { Sheet } from '@/ui/Sheet';
import { useToast } from '@/ui/Toast';
import { Keypad, PinDots, PIN_LENGTH, isWeakPin } from '@/security/PinPad';
import { changePin } from '@/store/useStore';

export interface ChangePinSheetProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'current' | 'new' | 'confirm';

/** Change-PIN flow: current PIN -> new PIN -> confirm. Custom keypad only. */
export function ChangePinSheet({ open, onClose }: ChangePinSheetProps) {
  const { show } = useToast();
  const [step, setStep] = useState<Step>('current');
  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setStep('current');
    setPin('');
    setCurrentPin('');
    setNewPin('');
    setError(null);
    setWarning(null);
    setBusy(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleComplete(fullPin: string) {
    if (step === 'current') {
      setCurrentPin(fullPin);
      setPin('');
      setError(null);
      setStep('new');
      return;
    }
    if (step === 'new') {
      setNewPin(fullPin);
      setWarning(isWeakPin(fullPin));
      setPin('');
      setStep('confirm');
      return;
    }
    // step === 'confirm'
    if (fullPin !== newPin) {
      setError("New PINs didn't match — let's try the new PIN again.");
      setPin('');
      setNewPin('');
      setStep('new');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await changePin(currentPin, fullPin);
      if (!result.ok) {
        setError(result.error ?? 'Could not change PIN.');
        setPin('');
        setStep('current');
        setCurrentPin('');
        return;
      }
      show('PIN changed.', { variant: 'success' });
      handleClose();
    } finally {
      setBusy(false);
    }
  }

  function onDigit(d: string) {
    if (busy) return;
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) void handleComplete(next);
  }

  function onBackspace() {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
  }

  const title =
    step === 'current' ? 'Enter current PIN' : step === 'new' ? 'Choose a new PIN' : 'Confirm new PIN';

  return (
    <Sheet open={open} onClose={handleClose} title={title}>
      <div className="flex flex-col items-center gap-5 py-4">
        <PinDots length={PIN_LENGTH} filled={pin.length} />
        {warning && step === 'confirm' ? (
          <p className="text-center text-xs text-warning">{warning} You can still use it.</p>
        ) : null}
        {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
        <Keypad onDigit={onDigit} onBackspace={onBackspace} disabled={busy} />
      </div>
    </Sheet>
  );
}
