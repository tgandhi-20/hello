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
      {label ? (
        <span className="mb-1 block text-sm text-text-2">{label}</span>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={[
          'h-12 w-full rounded-2xl border bg-surface-2 px-4 text-md text-text-1',
          'placeholder:text-text-3 outline-none transition-colors duration-200',
          'border-border focus:border-accent',
          error ? 'border-danger' : '',
          className,
        ].join(' ')}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
});
