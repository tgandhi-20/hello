import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = '', id, ...rest },
  ref
) {
  const inputId = id ?? rest.name;
  return (
    <label className="block w-full">
      {label ? <span className="label mb-1 block">{label}</span> : null}
      <input
        ref={ref}
        id={inputId}
        className={[
          'h-12 w-full rounded-control border bg-surface-sunk px-4 text-md text-ink-1',
          'placeholder:text-ink-3 transition-colors duration-180 ease-standard',
          'border-hairline focus:border-accent',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          error ? 'border-critical' : '',
          className,
        ].join(' ')}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error ? <span className="mt-1 block text-xs text-critical">{error}</span> : null}
    </label>
  );
});
