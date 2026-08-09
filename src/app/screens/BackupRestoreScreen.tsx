import React, { useState } from 'react';
import { Download, FileUp, Trash2, ShieldCheck } from 'lucide-react';
import { Card, Button, ConfirmDialog, useToast, StorageStatus, todayStr } from '@/ui';
import { useStore } from '@/store/useStore';
import { ImportBackupSheet } from '@/features/settings/ImportBackupSheet';

/**
 * "Backup & restore" (Menu > Data) — its own destination per DESIGN-V4.md §2,
 * rather than one more thing buried in Settings. Composed here, in `src/app/**`,
 * from pieces that already exist and are owned elsewhere: the store's own
 * export/import/reset actions (the same ones `SettingsScreen` calls) and
 * `ImportBackupSheet` (`src/features/settings/**`, reused as-is, never
 * duplicated). Settings keeps its own copy of these actions too — this screen
 * doesn't remove anything, it just gives backup/restore a door of its own.
 */
export function BackupRestoreScreen() {
  const exportBackup = useStore((s) => s.exportBackup);
  const resetAll = useStore((s) => s.resetAll);
  const { show } = useToast();

  const [importOpen, setImportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  async function handleExport() {
    setExportBusy(true);
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tally-backup-${todayStr()}.tally`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      show('Backup saved.', { variant: 'success' });
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not save a backup.', { variant: 'danger' });
    } finally {
      setExportBusy(false);
    }
  }

  async function handleReset() {
    setResetOpen(false);
    await resetAll();
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-ink-2">
          There's no server and no automatic backup — this device's storage is the only copy of your
          data unless you save one yourself.
        </p>
        <StorageStatus />
      </Card>

      <Card className="flex flex-col gap-3">
        <Button variant="ghost" fullWidth disabled={exportBusy} onClick={() => void handleExport()}>
          <Download size={18} aria-hidden="true" />
          Save a backup
        </Button>
        <Button variant="ghost" fullWidth onClick={() => setImportOpen(true)}>
          <FileUp size={18} aria-hidden="true" />
          Restore from a backup
        </Button>
        <p className="flex items-start gap-2 text-xs text-caution">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />A backup file is encrypted, but
          treat it like a copy of your bank statements — store it somewhere private.
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <Button variant="danger" fullWidth onClick={() => setResetOpen(true)}>
          <Trash2 size={18} aria-hidden="true" />
          Delete everything on this device
        </Button>
        <p className="text-xs text-ink-3">
          Every transaction, category, budget and setting — gone unless you have a backup.
        </p>
      </Card>

      <ImportBackupSheet open={importOpen} onClose={() => setImportOpen(false)} />
      <ConfirmDialog
        open={resetOpen}
        title="Delete everything?"
        body="This permanently deletes every transaction, category, budget, and setting on this device. This cannot be undone unless you have a backup."
        confirmLabel="Delete everything"
        destructive
        onConfirm={() => void handleReset()}
        onCancel={() => setResetOpen(false)}
      />
    </div>
  );
}
