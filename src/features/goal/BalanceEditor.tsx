import React, { useState } from 'react';
import { Edit3 } from 'lucide-react';
import type { Cents } from '@/types';
import { Button, Input, Sheet, formatMoney } from '@/ui';

export interface BalanceEditorProps {
  balanceCents: Cents;
  isUserEntered: boolean;
  onSave: (cents: Cents) => void;
  onReset: () => void;
}

/** Parse a plain dollar-amount string ("33569", "33,569.40") to integer cents.
 *  Returns null for anything that doesn't look like a plain amount — deliberately
 *  narrow, this is a manual balance entry field, not a full CSV money parser. */
function parseDollarsToCents(raw: string): Cents | null {
  const cleaned = raw.replace(/[,\s]/g, '').replace(/^\$/, '');
  if (cleaned === '' || !/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars)) return null;
  return Math.round(dollars * 100);
}

/**
 * Lets the user type in the real Bankwest balance when they know it. Tally only ever
 * sees logged/imported transactions, never a bank's actual balance (CONTRACTS.md) —
 * this is the honest workaround, and the button/badge language never implies the app
 * observed the figure itself.
 */
export function BalanceEditor({ balanceCents, isUserEntered, onSave, onReset }: BalanceEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const openSheet = () => {
    setDraft((balanceCents / 100).toFixed(2));
    setError(undefined);
    setOpen(true);
  };

  const save = () => {
    const cents = parseDollarsToCents(draft);
    if (cents === null) {
      setError('Enter a plain amount, e.g. 33569 or 33,569.40');
      return;
    }
    onSave(cents);
    setOpen(false);
  };

  return (
    <>
      <Button variant="ghost" size="md" onClick={openSheet} className="gap-2">
        <Edit3 size={16} strokeWidth={1.75} aria-hidden="true" />
        {isUserEntered ? 'Update balance' : 'Enter your balance'}
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Current savings balance"
        footer={
          <div className="flex gap-3">
            {isUserEntered ? (
              <Button
                variant="ghost"
                fullWidth
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
              >
                Use estimate instead
              </Button>
            ) : null}
            <Button fullWidth onClick={save}>
              Save
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            Tally can't see your Bankwest balance — it only knows what's been logged or imported. Enter what
            the account actually shows and Tally will track progress from there instead of its own estimate
            ({formatMoney(balanceCents)} right now).
          </p>
          <Input
            label="Balance (AUD)"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            error={error}
            placeholder="33569.00"
          />
        </div>
      </Sheet>
    </>
  );
}
