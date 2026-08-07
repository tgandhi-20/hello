import React from 'react';

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
      {label ? <span className="mb-1 block text-sm text-text-2">{label}</span> : null}
      <select
        ref={ref}
        id={selectId}
        className={[
          'h-12 w-full rounded-2xl border border-border bg-surface-2 px-4 text-md text-text-1',
          'outline-none transition-colors duration-200 focus:border-accent',
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
    </label>
  );
});
