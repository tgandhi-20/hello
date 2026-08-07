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
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Select } from '@/ui/Select';
import { Switch } from '@/ui/Switch';
import { ConfirmDialog } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';
import { StorageStatus } from '@/ui/storage';
import { formatMoney, todayStr } from '@/ui/format';
import { useStore, isBiometricAvailable, disableBiometric, getUnlockConfig } from '@/store/useStore';
import { DEFAULT_UNLOCK_CONFIG, type UnlockConfig } from '@/security/unlockMode';
import type { Cents } from '@/types';
import { ChangeUnlockSheet } from './ChangeUnlockSheet';
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
      {hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
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
  const [changeUnlockOpen, setChangeUnlockOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [unlockConfig, setUnlockConfig] = useState<UnlockConfig>(DEFAULT_UNLOCK_CONFIG);

  useEffect(() => {
    void isBiometricAvailable().then(setBiometricSupported);
  }, []);

  const refreshUnlockConfig = React.useCallback(() => {
    void getUnlockConfig().then(setUnlockConfig);
  }, []);

  useEffect(() => {
    refreshUnlockConfig();
  }, [refreshUnlockConfig]);

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
    <div className="flex flex-col gap-6 px-4 py-6">
      {/* --- Security --- */}
      <section className="flex flex-col gap-2">
        <p className="label px-1">Security</p>
        <ListGroup>
          <ListRow
            onClick={() => setChangeUnlockOpen(true)}
            leading={<KeyRound size={20} className="text-ink-2" aria-hidden="true" />}
            title={unlockConfig.mode === 'pin' ? 'Change PIN' : 'Change passphrase'}
            trailing={
              <span className="text-sm text-ink-3">
                {unlockConfig.mode === 'pin' ? `${unlockConfig.pinLength}-digit PIN` : 'Passphrase'}
              </span>
            }
            chevron
          />

          <ListRow
            as="div"
            leading={<Fingerprint size={20} className="text-ink-2" aria-hidden="true" />}
            title="Biometric unlock"
            trailing={
              biometricSupported ? (
                <Switch
                  checked={settings.biometricEnabled}
                  onChange={(v) => void handleBiometricToggle(v)}
                  disabled={biometricBusy}
                  id="biometric-toggle"
                />
              ) : (
                <span className="text-xs text-ink-3">Not available</span>
              )
            }
          />

          <ListRow
            as="div"
            leading={<Timer size={20} className="text-ink-2" aria-hidden="true" />}
            title="Auto-lock"
            trailing={
              <Select
                aria-label="Auto-lock timeout"
                options={LOCK_TIMEOUT_OPTIONS}
                value={String(settings.lockTimeoutMs)}
                onChange={(e) => void updateSettings({ lockTimeoutMs: Number(e.target.value) })}
                className="w-40"
              />
            }
          />
        </ListGroup>
        <p className="flex items-start gap-2 px-1 text-xs text-ink-3">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Everything is encrypted on this device only. Your {unlockConfig.mode === 'pin' ? 'PIN' : 'passphrase'} is
          never stored — losing it means losing access unless you have a backup.
        </p>
        <p className="px-1 text-xs text-ink-3">
          {unlockConfig.mode === 'pin'
            ? 'A PIN protects against someone picking up your unlocked phone. It does not protect against a stolen device with its raw data copied off — switch to a passphrase for that.'
            : 'A passphrase protects against both an unlocked phone and a stolen device with its raw data copied off.'}
        </p>
      </section>

      {/* --- Money --- */}
      <Card>
        <h2 className="mb-3 text-md font-semibold text-ink-1">Income &amp; savings</h2>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Wallet size={20} className="mt-8 shrink-0 text-ink-2" aria-hidden="true" />
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
            <CalendarClock size={20} className="shrink-0 text-ink-2" aria-hidden="true" />
            <Select
              label="Payday"
              options={PAYDAY_OPTIONS}
              value={String(settings.paydayDayOfMonth)}
              onChange={(e) => void updateSettings({ paydayDayOfMonth: Number(e.target.value) })}
              className="flex-1"
            />
          </div>
          <div className="flex items-start gap-3">
            <PiggyBank size={20} className="mt-8 shrink-0 text-ink-2" aria-hidden="true" />
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
        <h2 className="mb-3 text-md font-semibold text-ink-1">Your data</h2>
        {/* There is no server and no backup (CONTRACTS.md §0) — this device's storage
            grant is the only thing standing between "everything" and "nothing" if
            Android decides to reclaim space. Calm and factual either way. */}
        <StorageStatus className="mb-3" />
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
        <p className="mt-2 flex items-start gap-2 text-xs text-caution">
          A backup file is encrypted, but treat it like a copy of your bank statements — store it
          somewhere private.
        </p>
      </Card>

      <ChangeUnlockSheet
        open={changeUnlockOpen}
        onClose={() => setChangeUnlockOpen(false)}
        onChanged={refreshUnlockConfig}
      />
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
