import React from 'react';
import { CategoryIcon } from '@/ui/CategoryIcon';
import type { Category } from '@/types';

export interface CategoryTileProps {
  category: Category;
  onSelect: (category: Category) => void;
}

/** Large, thumb-friendly tile for the quick-add grid. Well over the 48x48 minimum. */
export function CategoryTile({ category, onSelect }: CategoryTileProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(category)}
      className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface-1 px-2 py-3 text-center transition-[transform,background-color] duration-200 active:scale-[0.97] active:bg-surface-2"
    >
      <CategoryIcon icon={category.icon} colorToken={category.colorToken} size="md" />
      <span className="line-clamp-1 text-sm font-medium text-text-1">{category.label}</span>
    </button>
  );
}

export interface CategoryGridProps {
  categories: Category[];
  onSelect: (category: Category) => void;
}

/** Grid of category tiles, already ranked by the caller (most-used-first). */
export function CategoryGrid({ categories, onSelect }: CategoryGridProps) {
  return (
    <div className="grid grid-cols-3 gap-3" role="group" aria-label="Categories">
      {categories.map((c) => (
        <CategoryTile key={c.id} category={c} onSelect={onSelect} />
      ))}
    </div>
  );
}
