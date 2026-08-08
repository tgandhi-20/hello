import React, { useState } from 'react';
import { Sheet, CategoryIcon, Switch } from '@/ui';
import type { Category } from '@/types';
import { ruleMatchFor } from './merchant';

export interface CategoryPickerSheetProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  merchant: string;
  /** Called with the chosen category and whether to also remember this merchant via a Rule. */
  onPick: (category: Category, remember: boolean) => void;
}

/**
 * Shared category picker used by the swipe-to-recategorise gesture and the edit sheet.
 * Offers "always categorise <merchant> this way" — the app learning from a correction,
 * per CONTRACTS.md §6/§7.
 */
export function CategoryPickerSheet({ open, onClose, categories, merchant, onPick }: CategoryPickerSheetProps) {
  const [remember, setRemember] = useState(true);
  const shortMerchant = ruleMatchFor(merchant);

  return (
    <Sheet open={open} onClose={onClose} title="Re-categorise">
      <div className="flex flex-col gap-4">
        {shortMerchant ? (
          <Switch
            id="remember-merchant"
            checked={remember}
            onChange={setRemember}
            label={`Always categorise "${shortMerchant}" this way`}
          />
        ) : null}
        <div className="grid grid-cols-3 gap-3">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onPick(c, remember);
                onClose();
              }}
              className="flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-card bg-surface-sunk px-2 py-2 text-center active:scale-[0.97] transition-transform duration-200"
            >
              <CategoryIcon icon={c.icon} colorToken={c.colorToken} size="sm" />
              <span className="line-clamp-1 text-xs font-medium text-ink-1">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
