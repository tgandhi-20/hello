import React from 'react';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white active:bg-accent-pressed disabled:opacity-40',
  ghost:
    'bg-transparent text-text-1 border border-border active:bg-surface-2 disabled:opacity-40',
  danger: 'bg-danger text-white active:brightness-90 disabled:opacity-40',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  // min-h-12 (48px) satisfies the 48x48 touch target minimum on every size.
  md: 'h-12 px-4 text-md rounded-2xl',
  lg: 'h-14 px-6 text-lg rounded-2xl',
  icon: 'h-12 w-12 rounded-full',
};

/**
 * Primary interactive control. Every variant/size combination keeps at least a
 * 48x48px hit target, per CONTRACTS.md §4.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth, className = '', children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={[
        'inline-flex items-center justify-center gap-2 font-medium select-none',
        'transition-[transform,background-color,opacity] duration-200 ease-out active:scale-[0.97]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:pointer-events-none',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
});
