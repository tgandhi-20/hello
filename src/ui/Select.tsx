import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, className = '', id, ...rest },
  ref
) {
  const selectId = id ?? rest.name;
  return (
    <label className="block w-full">
      {label ? <span className="label mb-1 block">{label}</span> : null}
      <span className="relative block">
        <select
          ref={ref}
          id={selectId}
          className={[
            // `appearance-none` drops the browser's own arrow (whose reserved width isn't
            // guaranteed, which is what let long option text run flush against it with no
            // ellipsis) in favour of an explicit chevron + `pr-9` gutter sized for it, and
            // `truncate` guarantees the selected value always ellipsises instead of clipping.
            'h-12 w-full appearance-none truncate rounded-control border border-hairline bg-surface-2 py-0 pl-4 pr-9 text-md text-ink-1',
            'transition-colors duration-180 ease-standard focus:border-accent',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            className,
          ].join(' ')}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
        />
      </span>
    </label>
  );
});
