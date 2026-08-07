import React from 'react';
import { Delete } from 'lucide-react';
import { vibrate } from '@/ui/haptics';
import type { Cents } from '@/types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;

/** Digit-string amount buffer, e.g. `"12.5"`. Empty string means "nothing typed yet". */
export type AmountBuffer = string;

const MAX_INT_DIGITS = 6; // caps entry at $999,999.99 — comfortably above any real txn
const MAX_DEC_DIGITS = 2;

/** Append a keypress to an amount buffer, enforcing one decimal point and 2dp max. */
export function applyKey(buffer: AmountBuffer, key: string): AmountBuffer {
  if (key === 'back') return buffer.slice(0, -1);
  if (key === '.') return buffer.includes('.') ? buffer : buffer + '.';

  const [intPart, decPart] = buffer.split('.');
  if (decPart !== undefined) {
    if (decPart.length >= MAX_DEC_DIGITS) return buffer;
    return buffer + key;
  }
  if ((intPart ?? '').length >= MAX_INT_DIGITS) return buffer;
  return buffer + key;
}

/**
 * Convert a digit-string buffer straight to integer cents via string math — never a
 * float parse, per CONTRACTS.md §3 ("money is integer cents, never floats").
 */
export function bufferToCents(buffer: AmountBuffer): Cents {
  if (!buffer || buffer === '.') return 0;
  const [intPart, decPart = ''] = buffer.split('.');
  const intCents = (parseInt(intPart || '0', 10) || 0) * 100;
  const decDigits = (decPart + '00').slice(0, 2);
  const decCents = parseInt(decDigits, 10) || 0;
  return intCents + decCents;
}

/** Format cents back into an editable buffer, e.g. `550` -> `"5.50"`. */
export function centsToBuffer(cents: Cents): AmountBuffer {
  const dollars = Math.floor(cents / 100);
  const rem = Math.abs(cents % 100);
  return `${dollars}.${String(rem).padStart(2, '0')}`;
}

export interface KeypadProps {
  onKey: (key: string) => void;
  disabledBackspace?: boolean;
}

/**
 * Custom numeric keypad — never the OS keyboard (CONTRACTS.md §7: it's slow to appear
 * and covers half the screen). Big digits, thumb-reachable, lives in the bottom third.
 */
export function Keypad({ onKey, disabledBackspace }: KeypadProps) {
  const press = (key: string) => {
    vibrate('tap');
    onKey(key);
  };

  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Amount keypad">
      {KEYS.map((key) => {
        if (key === 'back') {
          return (
            <button
              key={key}
              type="button"
              aria-label="Backspace"
              disabled={disabledBackspace}
              onClick={() => press('back')}
              className="flex h-16 items-center justify-center rounded-2xl bg-surface-1 text-text-1 active:bg-surface-2 disabled:opacity-40 transition-[transform,background-color] duration-200 active:scale-[0.97]"
            >
              <Delete size={24} aria-hidden="true" />
            </button>
          );
        }
        return (
          <button
            key={key}
            type="button"
            aria-label={key === '.' ? 'Decimal point' : `Digit ${key}`}
            onClick={() => press(key)}
            className="h-16 rounded-2xl bg-surface-1 text-2xl font-semibold tabular-nums text-text-1 active:bg-surface-2 transition-[transform,background-color] duration-200 active:scale-[0.97]"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
