import React, { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/Button';
import { useToast } from '@/ui/Toast';
import { PassphraseField } from '@/security/PassphraseField';
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

  async function handleComplete() {
    if (!file || pin.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await importBackup(file, pin);
      show('Backup restored.', { variant: 'success' });
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore that backup.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={handleClose} title="Restore backup">
      <div className="flex flex-col gap-4 py-2">
        <p className="text-sm text-negative">
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
            <p className="text-center text-sm text-ink-2">
              Selected: <span className="text-ink-1">{file.name}</span>
            </p>
            <p className="text-center text-sm text-ink-2">
              Enter the PIN or passphrase that backup was made with.
            </p>
            <div className="flex flex-col gap-4 py-2">
              <PassphraseField
                value={pin}
                onChange={setPin}
                onSubmit={() => void handleComplete()}
                placeholder="PIN or passphrase"
                autoFocus
                disabled={busy}
              />
              {error ? <p className="text-center text-sm text-negative">{error}</p> : null}
              <Button variant="primary" fullWidth disabled={busy || pin.length === 0} onClick={() => void handleComplete()}>
                Restore
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
