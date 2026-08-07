import React from 'react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface CategoryIconProps {
  /** lucide-react icon name, e.g. 'Coffee' — matches `Category.icon` in src/types.ts. */
  icon: string;
  /** Category colour token name, e.g. 'cat-1' — matches `Category.colorToken`. Never a raw hex. */
  colorToken: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_PX: Record<NonNullable<CategoryIconProps['size']>, number> = {
  sm: 32,
  md: 48,
  lg: 64,
};

const ICON_SIZE: Record<NonNullable<CategoryIconProps['size']>, number> = {
  sm: 16,
  md: 22,
  lg: 28,
};

/** Renders a lucide icon in a tinted circle, coloured from the category ramp token. */
export function CategoryIcon({ icon, colorToken, size = 'md', className = '' }: CategoryIconProps) {
  const IconComponent = ((LucideIcons as unknown as Record<string, LucideIcon>)[icon] ??
    LucideIcons.Circle) as LucideIcon;
  const dimension = SIZE_PX[size];
  const color = `var(--${colorToken})`;

  return (
    <span
      className={['inline-flex items-center justify-center rounded-full shrink-0', className].join(' ')}
      style={{
        width: dimension,
        height: dimension,
        backgroundColor: `color-mix(in srgb, ${color} 22%, transparent)`,
      }}
      aria-hidden="true"
    >
      <IconComponent size={ICON_SIZE[size]} color={color} strokeWidth={2} />
    </span>
  );
}
