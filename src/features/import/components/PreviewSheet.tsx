import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Select';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Chip } from '@/ui/Chip';
import { Skeleton } from '@/ui/Skeleton';
import { ProgressBar } from '@/ui/ProgressBar';
import { ListGroup, ListRow } from '@/ui';
import { formatMoney, formatDate } from '@/ui/format';
import type { AccountId, ImportPreview } from '@/types';
import type { BankFormat } from '@/import';

const ACCOUNT_OPTIONS: { value: AccountId; label: string }[] = [
  { value: 'cba', label: 'Commonwealth Bank' },
  { value: 'cba-card', label: 'Commonwealth Bank — card' },
  { value: 'bankwest', label: 'Bankwest' },
  { value: 'amex', label: 'Amex' },
  { value: 'cash', label: 'Cash' },
];

const FORMAT_LABEL: Record<BankFormat, string> = {
  cba: 'Commonwealth Bank',
  bankwest: 'Bankwest',
  amex: 'Amex',
  generic: 'Manually mapped',
};

export interface PreviewSheetProps {
  open: boolean;
  loading: boolean;
  committing: boolean;
  preview: ImportPreview | null;
  detectedFormat: BankFormat;
  detectionConfidence: number;
  account: AccountId;
  onAccountChange: (account: AccountId) => void;
  signInverted: boolean;
  onSignInvertedChange: (inverted: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRemap: () => void;
  progress?: { done: number; total: number } | null;
}

/**
 * Preview-and-confirm screen (CONTRACTS.md §6, mandatory before any write). Shows the
 * detected format, an editable account, a sign-convention toggle, ~5 sample rows
 * rendered exactly as the user will see them, and new/duplicate counts. Nothing is
 * written to the store until "Confirm import" is tapped.
 */
export function PreviewSheet({
  open,
  loading,
  committing,
  preview,
  detectedFormat,
  detectionConfidence,
  account,
  onAccountChange,
  signInverted,
  onSignInvertedChange,
  onConfirm,
  onCancel,
  onRemap,
  progress,
}: PreviewSheetProps) {
  const sample = preview?.rows.slice(0, 5) ?? [];
  const newCount = preview?.rows.length ?? 0;
  const dupCount = preview?.duplicateCount ?? 0;

  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title="Confirm import"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" fullWidth onClick={onCancel} disabled={committing}>
            Cancel
          </Button>
          <Button
            fullWidth
            onClick={onConfirm}
            disabled={loading || committing || newCount === 0}
          >
            {committing ? 'Saving…' : `Confirm import (${newCount})`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Chip tone="accent">{FORMAT_LABEL[detectedFormat]}</Chip>
          {detectedFormat !== 'generic' ? (
            <span className="text-xs text-ink-3">{Math.round(detectionConfidence * 100)}% confident</span>
          ) : null}
          <button type="button" onClick={onRemap} className="ml-auto min-h-[48px] text-sm font-medium text-accent">
            Remap columns
          </button>
        </div>

        <Select
          label="Account"
          options={ACCOUNT_OPTIONS}
          value={account}
          onChange={(e) => onAccountChange(e.target.value as AccountId)}
        />

        <div>
          <span className="label mb-1 block">Sign convention</span>
          <SegmentedControl
            value={signInverted ? 'amex' : 'standard'}
            onChange={(v) => onSignInvertedChange(v === 'amex')}
            options={[
              { value: 'standard', label: '− = spend' },
              { value: 'amex', label: '+ = spend' },
            ]}
          />
        </div>

        {preview?.warnings.length ? (
          <div className="flex flex-col gap-2 rounded-card bg-caution-tint p-3">
            {preview.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-caution">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-ink-1">{newCount} new</span>
          <span className="text-ink-3">·</span>
          <span className="text-ink-2">{dupCount} duplicate{dupCount === 1 ? '' : 's'} skipped</span>
        </div>

        <div>
          <span className="label mb-2 block">Sample — exactly as it will appear</span>
          {loading ? (
            <div className="flex flex-col gap-2">
              {progress && progress.total > 0 ? (
                <ProgressBar value={progress.done / progress.total} label="Processing rows" />
              ) : null}
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sample.length === 0 ? (
            <p className="text-sm text-ink-3">No new rows to show.</p>
          ) : (
            <ListGroup>
              {sample.map((row) => {
                const isSpend = row.amountCents > 0;
                return (
                  <ListRow
                    key={row.id}
                    as="div"
                    title={row.merchant}
                    subtitle={formatDate(row.date, 'short')}
                    trailing={
                      <div className="text-right">
                        <p className="money text-sm text-ink-1">{formatMoney(Math.abs(row.amountCents))}</p>
                        {/* No `--positive` token in v3 — income reads via the label text
                            itself, in slightly stronger ink than a routine spend row. */}
                        <p className={['text-xs', isSpend ? 'text-ink-2' : 'text-ink-1'].join(' ')}>
                          {isSpend ? '— spend' : '— income'}
                        </p>
                      </div>
                    }
                  />
                );
              })}
            </ListGroup>
          )}
        </div>
      </div>
    </Sheet>
  );
}
