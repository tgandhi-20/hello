import React from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

/** Accessible on/off toggle with a full 48x48 hit area, per CONTRACTS.md §4. */
export function Switch({ checked, onChange, label, disabled, id }: SwitchProps) {
  return (
    <label
      htmlFor={id}
      className={[
        'inline-flex min-h-[48px] items-center gap-3 select-none',
        disabled ? 'opacity-40' : 'cursor-pointer',
      ].join(' ')}
    >
      {label ? <span className="text-md text-text-1">{label}</span> : null}
      <span className="relative inline-flex h-8 w-14 shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          className={[
            'pointer-events-none absolute inset-0 rounded-pill border border-border transition-colors duration-200',
            checked ? 'bg-accent' : 'bg-surface-2',
          ].join(' ')}
        />
        <span
          className={[
            'pointer-events-none absolute h-6 w-6 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-7' : 'translate-x-1',
          ].join(' ')}
        />
      </span>
    </label>
  );
}
