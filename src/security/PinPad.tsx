/**
 * Tally — shared PIN entry primitives. Used by LockScreen (setup/unlock) and
 * by Settings (change PIN). A custom keypad only — never the OS keyboard.
 */
import React from 'react';
import { Delete } from 'lucide-react';

export interface PinDotsProps {
  length: number;
  filled: number;
}

export function PinDots({ length, filled }: PinDotsProps) {
  return (
    <div className="flex justify-center gap-3" aria-hidden="true">
      {Array.from({ length }).map((_, i) => (
        <span
          key={i}
          className={[
            'h-3.5 w-3.5 rounded-full border transition-colors duration-150',
            i < filled ? 'border-accent bg-accent' : 'border-border bg-transparent',
          ].join(' ')}
        />
      ))}
    </div>
  );
}

export interface KeypadProps {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}

/** Custom numeric keypad — every key is >=48x48px, per CONTRACTS.md §4. */
export function Keypad({ onDigit, onBackspace, disabled }: KeypadProps) {
  const rows: string[][] = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'back'],
  ];
  return (
    <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-3" role="group" aria-label="PIN keypad">
      {rows.flat().map((k, i) => {
        if (k === '') return <div key={i} aria-hidden="true" />;
        const isBack = k === 'back';
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => (isBack ? onBackspace() : onDigit(k))}
            aria-label={isBack ? 'Delete digit' : `Digit ${k}`}
            className={[
              'flex h-16 min-h-[48px] items-center justify-center rounded-2xl',
              'bg-surface-1 border border-border text-xl font-semibold text-text-1',
              'transition-[transform,background-color] duration-150 active:scale-[0.96] active:bg-surface-2',
              'disabled:opacity-40 disabled:active:scale-100',
            ].join(' ')}
          >
            {isBack ? <Delete size={22} aria-hidden="true" /> : k}
          </button>
        );
      })}
    </div>
  );
}

export const PIN_LENGTH = 6;

/** Weak-PIN advisory (non-blocking) shown during setup/change. */
export function isWeakPin(pin: string): string | null {
  if (/^(\d)\1+$/.test(pin)) return 'All the same digit is easy to guess.';
  const ascending = '0123456789';
  const descending = '9876543210';
  if (ascending.includes(pin) || descending.includes(pin)) return 'Sequential digits are easy to guess.';
  if (pin === '123123' || pin === '112233') return 'That pattern is easy to guess.';
  return null;
}
