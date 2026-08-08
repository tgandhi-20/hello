/**
 * Tally — the lock screen's "I genuinely cannot get in" escape hatch
 * (CONTRACTS.md §5, P0 fix deliverable 6).
 *
 * Before this existed, a corrupted or forgotten-PIN vault bricked the app
 * with no way forward at all — not even a path to wipe and start over, let
 * alone the much better option of restoring from a `.tally` backup. Reached
 * from a small, deliberately low-key "Trouble unlocking?" link on the unlock
 * screen (never the setup/choose-mode screens — there's nothing to recover
 * from before a vault exists).
 *
 * Two paths, offered in order of how much they preserve:
 *   1. Restore from a `.tally` backup. `importBackup` derives its own key
 *      from the backup's own PIN/passphrase (which may differ from whatever
 *      the user is currently stuck on) and does not require an existing
 *      unlock — see useStore.ts. This is the option that actually gets the
 *      user's data back.
 *   2. Erase this device and start over. The nuclear option, for when there
 *      is no backup — gated behind an explicit typed confirmation (not a
 *      single tap) so it can never be hit by accident, with the backup
 *      option pointed at first and harder to miss.
 */
import React, { useRef, useState } from 'react';
import { AlertTriangle, FileUp, Trash2 } from 'lucide-react';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { PassphraseField } from './PassphraseField';
import { useStore } from '@/store/useStore';

export interface RecoverySheetProps {
  open: boolean;
  onClose: () => void;
}

type View = 'menu' | 'restore' | 'erase';

const ERASE_CONFIRM_PHRASE = 'ERASE';

export function RecoverySheet({ open, onClose }: RecoverySheetProps) {
  const importBackup = useStore((s) => s.importBackup);
  const resetAll = useStore((s) => s.resetAll);

  const [view, setView] = useState<View>('menu');
  const [file, setFile] = useState<File | null>(null);
  const [secret, setSecret] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setView('menu');
    setFile(null);
    setSecret('');
    setConfirmText('');
    setBusy(false);
    setError(null);
  }

  function handleClose() {
    if (busy) return; // guarded by Sheet's `busy` prop too — belt and braces
    reset();
    onClose();
  }

  async function handleRestore() {
    if (!file || secret.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await importBackup(file, secret);
      // importBackup flips lockState to 'unlocked' itself on success —
      // LockGate swaps this whole screen out for the app on the next render.
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore that backup.');
      setSecret('');
    } finally {
      setBusy(false);
    }
  }

  async function handleErase() {
    if (confirmText !== ERASE_CONFIRM_PHRASE) return;
    setBusy(true);
    try {
      await resetAll();
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const title =
    view === 'menu' ? 'Trouble unlocking?' : view === 'restore' ? 'Restore from a backup' : 'Erase this device';

  return (
    <Sheet open={open} onClose={handleClose} title={title} busy={busy}>
      {view === 'menu' ? (
        <div className="flex flex-col gap-4 py-2">
          <p className="text-sm text-ink-2">
            Tally never stores your PIN or passphrase anywhere, and there is no account or server
            to reset it from — not even a reinstall can recover it. Two ways forward:
          </p>

          <Button variant="primary" fullWidth onClick={() => setView('restore')}>
            <FileUp size={18} aria-hidden="true" />
            Restore from a .tally backup
          </Button>
          <p className="px-1 text-xs text-ink-3">
            The better option if you've exported a backup before. It replaces this device's data
            with the backup's, using whatever PIN or passphrase that backup was made with — which
            can be different from the one you're stuck on now.
          </p>

          <Button variant="danger" fullWidth onClick={() => setView('erase')}>
            <Trash2 size={18} aria-hidden="true" />
            Erase this device and start fresh
          </Button>
          <p className="px-1 text-xs text-critical">
            Only if you have no backup. This permanently deletes every transaction, category,
            budget, and setting on this device — there is no undo.
          </p>
        </div>
      ) : null}

      {view === 'restore' ? (
        <div className="flex flex-col gap-4 py-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".tally,application/json"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {!file ? (
            <Button variant="ghost" fullWidth onClick={() => fileInputRef.current?.click()}>
              <FileUp size={18} aria-hidden="true" />
              Choose .tally file
            </Button>
          ) : (
            <>
              <p className="text-center text-sm text-ink-2">
                Selected: <span className="text-ink-1">{file.name}</span>
              </p>
              <PassphraseField
                value={secret}
                onChange={setSecret}
                onSubmit={() => void handleRestore()}
                placeholder="PIN or passphrase for that backup"
                autoFocus
                disabled={busy}
              />
            </>
          )}
          {error ? <p className="text-center text-sm text-critical">{error}</p> : null}
          <Button
            variant="primary"
            fullWidth
            disabled={busy || !file || secret.length === 0}
            onClick={() => void handleRestore()}
          >
            Restore and unlock
          </Button>
          <Button variant="ghost" fullWidth disabled={busy} onClick={() => setView('menu')}>
            Back
          </Button>
        </div>
      ) : null}

      {view === 'erase' ? (
        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-start gap-2 rounded-card bg-critical-tint px-4 py-3 text-sm text-critical">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              This erases every transaction, category, budget, and setting on this device,
              forever — there is no server copy to fall back on. If there's any chance you have a
              backup, go back and restore it instead.
            </span>
          </div>
          <Input
            label={`Type ${ERASE_CONFIRM_PHRASE} to confirm`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
          <Button
            variant="danger"
            fullWidth
            disabled={busy || confirmText !== ERASE_CONFIRM_PHRASE}
            onClick={() => void handleErase()}
          >
            Erase everything on this device
          </Button>
          <Button variant="ghost" fullWidth disabled={busy} onClick={() => setView('menu')}>
            Back
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
