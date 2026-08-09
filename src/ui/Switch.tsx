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
      {/*
        m2 fix: the real hit target is the <input> below, and it used to be sized
        exactly to the *visible* track (h-8 w-14 = 32x56) — measured 56x32px, under
        the 48px minimum on the short axis (CONTRACTS.md §4: "Minimum touch target
        48x48px. No exceptions"). The outer <label>'s own `min-h-[48px]` didn't help:
        that's the label's box, not the input's, and it only ever mattered here when
        a `label` string was passed — a bare switch with no text (like this file's own
        callers with no `label` prop) had no 48px-tall element at all.

        Fix: this wrapper is the real hit target now, at h-12 w-14 (48x56), and the
        <input> fills it exactly as before. The visible track/knob stay their
        original 32px-tall size but are positioned with `top-1/2 -translate-y-1/2`
        instead of relying on flex centring, because they have to stay direct
        siblings of `.peer` — Tailwind's `peer-*` variants compile to a CSS general
        sibling combinator (`.peer:focus-visible ~ …`), which only matches actual
        siblings, not a nested wrapper's children.
      */}
      <span className="relative inline-flex h-12 w-14 shrink-0">
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
            'pointer-events-none absolute left-0 top-1/2 h-8 w-14 -translate-y-1/2 rounded-pill border border-hairline transition-colors duration-180 ease-standard',
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
            'pointer-events-none absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-surface shadow-card transition-transform duration-180 ease-standard',
            checked ? 'translate-x-7' : 'translate-x-1',
          ].join(' ')}
        />
      </span>
    </label>
  );
}
