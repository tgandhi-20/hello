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
      {label ? <span className="text-md text-ink-1">{label}</span> : null}
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
            'pointer-events-none absolute inset-0 rounded-pill border border-hairline transition-colors duration-180 ease-standard',
            // The real <input> is visually hidden (opacity-0) but stays the focusable
            // element — `peer-focus-visible:` mirrors its keyboard focus onto this
            // visible track so keyboard users still get a clear focus ring.
            'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
            checked ? 'bg-accent' : 'bg-surface-sunk',
          ].join(' ')}
        />
        <span
          className={[
            // White knob with its own soft shadow — the moving element, not the
            // track, is what earns a shadow here (DESIGN-V3.md §1: shadow for
            // elevation, never paired with a border on the same element).
            'pointer-events-none absolute h-6 w-6 rounded-full bg-surface shadow-card transition-transform duration-180 ease-standard',
            checked ? 'translate-x-7' : 'translate-x-1',
          ].join(' ')}
        />
      </span>
    </label>
  );
}
