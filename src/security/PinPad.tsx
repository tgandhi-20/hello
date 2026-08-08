/**
 * Tally — shared PIN entry primitives. Used by LockScreen (setup/unlock) and
 * by Settings (change PIN). A custom keypad only — never the OS keyboard.
 */
import React from 'react';
import { Delete, Minus, Plus } from 'lucide-react';
import { DEFAULT_PIN_LENGTH, MIN_PIN_LENGTH, MAX_PIN_LENGTH } from './unlockMode';

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
            i < filled ? 'border-accent bg-accent' : 'border-hairline bg-transparent',
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
              'bg-surface border border-hairline text-xl font-semibold text-ink-1',
              'transition-[transform,background-color] duration-150 active:scale-[0.96] active:bg-surface-sunk',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
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

/**
 * Historical fixed PIN length, kept as the default. PIN length is now
 * configurable (4–10 digits, see `unlockMode.ts`) — code that needs "the"
 * length for an in-progress entry should use the length that entry was
 * actually started with, not this constant. It remains exported because
 * `PinDots`/`Keypad` callers need *some* default before the user has chosen
 * one (e.g. first paint of the length stepper).
 */
export const PIN_LENGTH = DEFAULT_PIN_LENGTH;

/** Weak-PIN advisory (non-blocking) shown during setup/change. Works at any length. */
export function isWeakPin(pin: string): string | null {
  if (/^(\d)\1+$/.test(pin)) return 'All the same digit is easy to guess.';
  const ascending = '0123456789';
  const descending = '9876543210';
  if (ascending.includes(pin) || descending.includes(pin)) return 'Sequential digits are easy to guess.';
  if (pin === '123123' || pin === '112233') return 'That pattern is easy to guess.';
  return null;
}

export interface PinLengthStepperProps {
  value: number;
  onChange: (length: number) => void;
  disabled?: boolean;
}

/**
 * Lets the user pick a PIN length from 4–10 digits at setup/change time —
 * "nearly free" extra entropy per the security audit, without forcing anyone
 * into a passphrase. Every control keeps the 48x48px minimum touch target.
 */
export function PinLengthStepper({ value, onChange, disabled }: PinLengthStepperProps) {
  return (
    <div className="flex items-center justify-center gap-4" role="group" aria-label="PIN length">
      <button
        type="button"
        disabled={disabled || value <= MIN_PIN_LENGTH}
        onClick={() => onChange(Math.max(MIN_PIN_LENGTH, value - 1))}
        aria-label="Fewer digits"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-surface text-ink-1 active:bg-surface-sunk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-30"
      >
        <Minus size={18} aria-hidden="true" />
      </button>
      <span className="min-w-[6rem] text-center text-sm text-ink-2 tabular-nums">{value} digits</span>
      <button
        type="button"
        disabled={disabled || value >= MAX_PIN_LENGTH}
        onClick={() => onChange(Math.min(MAX_PIN_LENGTH, value + 1))}
        aria-label="More digits"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-surface text-ink-1 active:bg-surface-sunk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-30"
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
