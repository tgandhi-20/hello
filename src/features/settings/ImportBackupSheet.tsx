import React, { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/Button';
import { useToast } from '@/ui/Toast';
import { Keypad, PinDots, PIN_LENGTH } from '@/security/PinPad';
import { useStore } from '@/store/useStore';

export interface ImportBackupSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Restore from a `.tally` backup file. This REPLACES all local data with the
 * backup's contents (see useStore.ts's importBackup doc comment) — the
 * confirmation copy makes that explicit since it's destructive.
 */
export function ImportBackupSheet({ open, onClose }: ImportBackupSheetProps) {
  const importBackup = useStore((s) => s.importBackup);
  const { show } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setFile(null);
    setPin('');
    setError(null);
    setBusy(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleComplete(fullPin: string) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await importBackup(file, fullPin);
      show('Backup restored.', { variant: 'success' });
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore that backup.');
      setPin('');
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

  return (
    <Sheet open={open} onClose={handleClose} title="Restore backup">
      <div className="flex flex-col gap-4 py-2">
        <p className="text-sm text-danger">
          This replaces everything currently on this device with the contents of the backup. This
          cannot be undone.
        </p>

        {!file ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".tally,application/json"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button variant="ghost" fullWidth onClick={() => fileInputRef.current?.click()}>
              <FileUp size={18} aria-hidden="true" />
              Choose .tally file
            </Button>
          </>
        ) : (
          <>
            <p className="text-center text-sm text-text-2">
              Selected: <span className="text-text-1">{file.name}</span>
            </p>
            <p className="text-center text-sm text-text-2">Enter the PIN that backup was made with.</p>
            <div className="flex flex-col items-center gap-5 py-2">
              <PinDots length={PIN_LENGTH} filled={pin.length} />
              {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
              <Keypad onDigit={onDigit} onBackspace={onBackspace} disabled={busy} />
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
