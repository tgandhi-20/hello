import React, { useMemo, useState } from 'react';
import { Card } from '@/ui/Card';
import { Select } from '@/ui/Select';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Switch } from '@/ui/Switch';
import { Button } from '@/ui/Button';
import type { RawCsv } from '@/import';
import type { ManualColumnMapping } from '@/import';

export interface ManualMapperProps {
  rawCsv: RawCsv;
  onSubmit: (mapping: ManualColumnMapping) => void;
  onCancel: () => void;
}

const NONE = '__none__';

/**
 * Manual column mapper — the fallback path whenever structural detection isn't
 * confident enough (CONTRACTS.md §6). The user picks columns by looking at real sample
 * values, never by trusting a header name we couldn't verify.
 */
export function ManualMapper({ rawCsv, onSubmit, onCancel }: ManualMapperProps) {
  const [hasHeader, setHasHeader] = useState(rawCsv.rows.length > 1);
  const [dateCol, setDateCol] = useState('0');
  const [descriptionCol, setDescriptionCol] = useState(rawCsv.rows[0]?.length > 1 ? '1' : '0');
  const [amountMode, setAmountMode] = useState<'single' | 'split'>('single');
  const [amountCol, setAmountCol] = useState('');
  const [debitCol, setDebitCol] = useState('');
  const [creditCol, setCreditCol] = useState('');
  const [balanceCol, setBalanceCol] = useState(NONE);

  const colCount = useMemo(
    () => rawCsv.rows.reduce((max, r) => Math.max(max, r.length), 0),
    [rawCsv.rows]
  );
  const sampleRow = hasHeader ? rawCsv.rows[1] ?? rawCsv.rows[0] : rawCsv.rows[0];

  const columnOptions = useMemo(
    () =>
      Array.from({ length: colCount }, (_, i) => ({
        value: String(i),
        label: `Col ${i + 1}: "${(sampleRow?.[i] ?? '').slice(0, 24) || '(empty)'}"`,
      })),
    [colCount, sampleRow]
  );
  const columnOptionsWithNone = useMemo(() => [{ value: NONE, label: 'None' }, ...columnOptions], [columnOptions]);

  const canSubmit =
    dateCol !== '' &&
    descriptionCol !== '' &&
    (amountMode === 'single' ? amountCol !== '' : debitCol !== '' && creditCol !== '');

  const previewRows = (hasHeader ? rawCsv.rows.slice(1, 4) : rawCsv.rows.slice(0, 3));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-sm text-ink-2">
          We couldn&apos;t confidently detect the columns in this file. Pick them below by looking at
          the sample rows.
        </p>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-ink-3">
              {Array.from({ length: colCount }, (_, i) => (
                <th key={i} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                  Col {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri} className="border-t border-hairline">
                {Array.from({ length: colCount }, (_, i) => (
                  <td key={i} className="max-w-[120px] truncate whitespace-nowrap px-2 py-1 text-ink-1">
                    {row[i] || <span className="text-ink-3">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Switch checked={hasHeader} onChange={setHasHeader} label="First row is a header (not data)" id="mm-header" />

      <Select label="Date column" options={columnOptions} value={dateCol} onChange={(e) => setDateCol(e.target.value)} />
      <Select
        label="Description column"
        options={columnOptions}
        value={descriptionCol}
        onChange={(e) => setDescriptionCol(e.target.value)}
      />

      <div>
        <span className="label mb-1 block">Amount columns</span>
        <SegmentedControl
          value={amountMode}
          onChange={setAmountMode}
          options={[
            { value: 'single', label: 'One signed column' },
            { value: 'split', label: 'Separate debit/credit' },
          ]}
        />
      </div>

      {amountMode === 'single' ? (
        <Select label="Amount column" options={columnOptions} value={amountCol} onChange={(e) => setAmountCol(e.target.value)} />
      ) : (
        <>
          <Select label="Debit (spend) column" options={columnOptions} value={debitCol} onChange={(e) => setDebitCol(e.target.value)} />
          <Select label="Credit (income) column" options={columnOptions} value={creditCol} onChange={(e) => setCreditCol(e.target.value)} />
        </>
      )}

      <Select
        label="Balance column (optional — improves accuracy)"
        options={columnOptionsWithNone}
        value={balanceCol}
        onChange={(e) => setBalanceCol(e.target.value)}
      />

      <div className="flex gap-3 pb-2">
        <Button variant="ghost" fullWidth onClick={onCancel}>
          Cancel
        </Button>
        <Button
          fullWidth
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({
              hasHeader,
              dateCol: Number(dateCol),
              descriptionCol: Number(descriptionCol),
              amountCol: amountMode === 'single' ? Number(amountCol) : undefined,
              debitCol: amountMode === 'split' ? Number(debitCol) : undefined,
              creditCol: amountMode === 'split' ? Number(creditCol) : undefined,
              balanceCol: balanceCol === NONE ? undefined : Number(balanceCol),
            })
          }
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
