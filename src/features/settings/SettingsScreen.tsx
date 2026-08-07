import React, { useEffect, useState } from 'react';
import {
  KeyRound,
  Fingerprint,
  Timer,
  Wallet,
  CalendarClock,
  PiggyBank,
  Download,
  FileUp,
  Sparkles,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
import { Switch } from '@/ui/Switch';
import { ConfirmDialog } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';
import { formatMoney, todayStr } from '@/ui/format';
import { useStore, isBiometricAvailable, disableBiometric } from '@/store/useStore';
import type { Cents } from '@/types';
import { ChangePinSheet } from './ChangePinSheet';
import { ImportBackupSheet } from './ImportBackupSheet';
import { parseDollarsToCents, centsToPlainDollarsString } from './money';

const LOCK_TIMEOUT_OPTIONS = [
  { value: '30000', label: '30 seconds' },
  { value: '60000', label: '1 minute' },
  { value: '120000', label: '2 minutes (default)' },
  { value: '300000', label: '5 minutes' },
  { value: '600000', label: '10 minutes' },
];

const PAYDAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}`,
}));

interface MoneyFieldProps {
  label: string;
  valueCents: Cents;
  onCommit: (cents: Cents) => void;
  hint?: string;
}

/** A money input that only ever produces integer cents — no float parsing. */
function MoneyField({ label, valueCents, onCommit, hint }: MoneyFieldProps) {
  const [text, setText] = useState(centsToPlainDollarsString(valueCents));

  useEffect(() => {
    setText(centsToPlainDollarsString(valueCents));
  }, [valueCents]);

  function commit() {
    const parsed = parseDollarsToCents(text);
    if (parsed === null || parsed < 0) {
      setText(centsToPlainDollarsString(valueCents));
      return;
    }
    if (parsed !== valueCents) onCommit(parsed);
  }

  return (
    <div>
      <Input
        label={label}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
      {hint ? <p className="mt-1 text-xs text-text-3">{hint}</p> : null}
    </div>
  );
}

export function SettingsScreen() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const enableBiometric = useStore((s) => s.enableBiometric);
  const resetAll = useStore((s) => s.resetAll);
  const loadDemoData = useStore((s) => s.loadDemoData);
  const exportBackup = useStore((s) => s.exportBackup);
  const { show } = useToast();

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  useEffect(() => {
    void isBiometricAvailable().then(setBiometricSupported);
  }, []);

  async function handleBiometricToggle(next: boolean) {
    setBiometricBusy(true);
    try {
      if (next) {
        const ok = await enableBiometric();
        if (!ok) {
          show('Biometric unlock is unavailable on this device, or the prompt was cancelled.', {
            variant: 'danger',
          });
        }
      } else {
        await disableBiometric();
      }
    } finally {
      setBiometricBusy(false);
    }
  }

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
      show('Backup exported.', { variant: 'success' });
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not export a backup.', { variant: 'danger' });
    } finally {
      setExportBusy(false);
    }
  }

  async function handleLoadDemo() {
    setDemoBusy(true);
    try {
      await loadDemoData();
      show('Demo data loaded.', { variant: 'success' });
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not load demo data.', { variant: 'danger' });
    } finally {
      setDemoBusy(false);
    }
  }

  async function handleReset() {
    setResetOpen(false);
    await resetAll();
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      {/* --- Security --- */}
      <Card>
        <h2 className="mb-3 text-md font-semibold text-text-1">Security</h2>
        <div className="flex flex-col divide-y divide-border">
          <button
            type="button"
            onClick={() => setChangePinOpen(true)}
            className="flex min-h-[56px] items-center gap-3 py-3 text-left"
          >
            <KeyRound size={20} className="text-text-2" aria-hidden="true" />
            <span className="flex-1 text-md text-text-1">Change PIN</span>
          </button>

          <div className="flex min-h-[56px] items-center gap-3 py-3">
            <Fingerprint size={20} className="text-text-2" aria-hidden="true" />
            <span className="flex-1 text-md text-text-1">Biometric unlock</span>
            {biometricSupported ? (
              <Switch
                checked={settings.biometricEnabled}
                onChange={(v) => void handleBiometricToggle(v)}
                disabled={biometricBusy}
                id="biometric-toggle"
              />
            ) : (
              <span className="text-xs text-text-3">Not available</span>
            )}
          </div>

          <div className="flex min-h-[56px] items-center gap-3 py-3">
            <Timer size={20} className="text-text-2" aria-hidden="true" />
            <span className="flex-1 text-md text-text-1">Auto-lock after</span>
            <Select
              aria-label="Auto-lock timeout"
              options={LOCK_TIMEOUT_OPTIONS}
              value={String(settings.lockTimeoutMs)}
              onChange={(e) => void updateSettings({ lockTimeoutMs: Number(e.target.value) })}
              className="w-40"
            />
          </div>
        </div>
        <p className="mt-2 flex items-start gap-2 text-xs text-text-3">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Everything is encrypted on this device only. Your PIN is never stored — losing it means
          losing access unless you have a backup.
        </p>
      </Card>

      {/* --- Money --- */}
      <Card>
        <h2 className="mb-3 text-md font-semibold text-text-1">Income &amp; savings</h2>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Wallet size={20} className="mt-8 shrink-0 text-text-2" aria-hidden="true" />
            <div className="flex-1">
              <MoneyField
                label="Monthly income"
                valueCents={settings.monthlyIncomeCents}
                onCommit={(cents) => void updateSettings({ monthlyIncomeCents: cents })}
                hint={
                  settings.monthlyIncomeCents > 0
                    ? `Currently ${formatMoney(settings.monthlyIncomeCents)} / month`
                    : 'Used to calculate Safe to Spend.'
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CalendarClock size={20} className="shrink-0 text-text-2" aria-hidden="true" />
            <Select
              label="Payday"
              options={PAYDAY_OPTIONS}
              value={String(settings.paydayDayOfMonth)}
              onChange={(e) => void updateSettings({ paydayDayOfMonth: Number(e.target.value) })}
              className="flex-1"
            />
          </div>
          <div className="flex items-start gap-3">
            <PiggyBank size={20} className="mt-8 shrink-0 text-text-2" aria-hidden="true" />
            <div className="flex-1">
              <MoneyField
                label="Savings target"
                valueCents={settings.savingsTargetCents}
                onCommit={(cents) => void updateSettings({ savingsTargetCents: cents })}
                hint="Set aside each month before Safe to Spend is calculated."
              />
            </div>
          </div>
        </div>
      </Card>

      {/* --- Data --- */}
      <Card>
        <h2 className="mb-3 text-md font-semibold text-text-1">Your data</h2>
        <div className="flex flex-col gap-3">
          <Button variant="ghost" fullWidth disabled={exportBusy} onClick={() => void handleExport()}>
            <Download size={18} aria-hidden="true" />
            Export encrypted backup
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setImportOpen(true)}>
            <FileUp size={18} aria-hidden="true" />
            Restore from backup
          </Button>
          <Button variant="ghost" fullWidth disabled={demoBusy} onClick={() => void handleLoadDemo()}>
            <Sparkles size={18} aria-hidden="true" />
            Load demo data
          </Button>
          <Button variant="danger" fullWidth onClick={() => setResetOpen(true)}>
            <Trash2 size={18} aria-hidden="true" />
            Reset everything
          </Button>
        </div>
        <p className="mt-2 flex items-start gap-2 text-xs text-warning">
          A backup file is encrypted, but treat it like a copy of your bank statements — store it
          somewhere private.
        </p>
      </Card>

      <ChangePinSheet open={changePinOpen} onClose={() => setChangePinOpen(false)} />
      <ImportBackupSheet open={importOpen} onClose={() => setImportOpen(false)} />
      <ConfirmDialog
        open={resetOpen}
        title="Reset everything?"
        body="This permanently deletes every transaction, category, budget, and setting on this device. This cannot be undone unless you have a backup."
        confirmLabel="Delete everything"
        destructive
        onConfirm={() => void handleReset()}
        onCancel={() => setResetOpen(false)}
      />
    </div>
  );
}
