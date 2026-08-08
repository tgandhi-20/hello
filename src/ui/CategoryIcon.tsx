import React from 'react';
import { FALLBACK_ICON, ICONS } from './icons';

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

/**
 * Renders a lucide icon in `--cat-N` on a 16%-alpha well of that same hue,
 * mixed toward `--surface` (DESIGN-V3.md §1/§4: "tinted well of the
 * category's own hue") — not a fully saturated filled circle. On a white
 * card a fully-transparent-mixed tint reads as almost invisible, so this
 * mixes toward the card's own white rather than transparent; the well stays
 * a quiet tint (never as strong as the glyph itself, which carries the
 * colour at full strength and is the thing DESIGN-V3.md's swatch contrast
 * figures were measured against).
 */
export function CategoryIcon({ icon, colorToken, size = 'md', className = '' }: CategoryIconProps) {
  const IconComponent = ICONS[icon] ?? FALLBACK_ICON;
  const dimension = SIZE_PX[size];
  const color = `var(--${colorToken})`;

  return (
    <span
      className={['inline-flex items-center justify-center rounded-full shrink-0', className].join(' ')}
      style={{
        width: dimension,
        height: dimension,
        backgroundColor: `color-mix(in srgb, ${color} 16%, var(--surface))`,
      }}
      aria-hidden="true"
    >
      <IconComponent size={ICON_SIZE[size]} color={color} strokeWidth={2} />
    </span>
  );
}
