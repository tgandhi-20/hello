/**
 * Tally — masked passphrase entry (CONTRACTS.md §5, security audit follow-up).
 *
 * Used INSTEAD of the numeric Keypad whenever unlock mode is 'passphrase'.
 * `type="password"` by default with an explicit show/hide toggle; no
 * autocomplete, no autocorrect, no autocapitalize, no spellcheck — this is a
 * secret, not prose. The value only ever lives in component state handed
 * back to the caller; it is never logged (see CONTRACTS.md §5's blanket rule)
 * and never written anywhere by this component.
 */
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { estimatePassphraseStrength } from './unlockMode';

export interface PassphraseFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the user presses Enter/Go on the keyboard. */
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Show the length/character-class strength meter beneath the field. */
  showStrength?: boolean;
  id?: string;
  'aria-label'?: string;
}

// No "positive" token in v3 (DESIGN-V3.md §1) — a strong passphrase reads as the
// absence of warning, so the top of the scale is solid neutral ink rather than a
// second green competing with the accent.
function strengthBarClass(filled: boolean, score: number): string {
  if (!filled) return 'bg-surface-sunk';
  if (score <= 1) return 'bg-critical';
  if (score === 2) return 'bg-caution';
  return 'bg-ink-1';
}

export function PassphraseField({
  value,
  onChange,
  onSubmit,
  placeholder,
  autoFocus,
  disabled,
  showStrength = false,
  id,
  'aria-label': ariaLabel,
}: PassphraseFieldProps) {
  const [reveal, setReveal] = useState(false);
  const strength = estimatePassphraseStrength(value);

  return (
    <div className="w-full">
      <div className="relative">
        <input
          id={id}
          aria-label={ariaLabel ?? placeholder ?? 'Passphrase'}
          type={reveal ? 'text' : 'password'}
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          // Best-effort hints to keep password managers/keyboards from treating
          // this as a normal text field to remember or suggest from.
          data-lpignore="true"
          data-1p-ignore="true"
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder ?? 'Passphrase'}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onSubmit) onSubmit();
          }}
          className={[
            'h-14 w-full rounded-2xl border bg-surface-sunk px-4 pr-14 text-lg text-ink-1',
            'placeholder:text-ink-3 outline-none transition-colors duration-200',
            'border-hairline focus:border-accent disabled:opacity-60',
          ].join(' ')}
        />
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          disabled={disabled}
          aria-label={reveal ? 'Hide passphrase' : 'Show passphrase'}
          aria-pressed={reveal}
          className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 active:bg-surface disabled:opacity-40"
        >
          {reveal ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      </div>

      {showStrength && value.length > 0 ? (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className={['h-1 flex-1 rounded-full transition-colors duration-200', strengthBarClass(i < strength.score, strength.score)].join(
                  ' '
                )}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {strength.label}
            {strength.hint ? ` — ${strength.hint}` : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
}
