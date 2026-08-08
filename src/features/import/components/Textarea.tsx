import React from 'react';

/**
 * Local textarea primitive — Agent 1's `src/ui` kit doesn't have one yet. Styled to
 * match `Input`/`Select` so it looks native to the design system. Only used within
 * `src/features/import`; flagged in the Agent 3 report per CONTRACTS.md §2.
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, className = '', id, ...rest },
  ref
) {
  const areaId = id ?? rest.name;
  return (
    <label className="block w-full">
      {label ? <span className="label mb-1 block">{label}</span> : null}
      <textarea
        ref={ref}
        id={areaId}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={[
          'w-full rounded-control border border-hairline bg-surface-sunk px-4 py-3 text-sm text-ink-1',
          'placeholder:text-ink-3 outline-none transition-colors duration-200 focus:border-accent',
          'font-mono leading-relaxed',
          className,
        ].join(' ')}
        {...rest}
      />
    </label>
  );
});
