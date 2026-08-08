import React, { useRef, useState } from 'react';
import { Tag, Trash2 } from 'lucide-react';
import { CategoryIcon, formatTxnAmount } from '@/ui';
import type { Category, Txn } from '@/types';

const SWIPE_THRESHOLD = 72;
const MAX_DRAG = 120;
const AXIS_LOCK_PX = 8;

export interface TransactionRowProps {
  txn: Txn;
  category: Category | undefined;
  onTap: (txn: Txn) => void;
  onDelete: (txn: Txn) => void;
  onRecategorize: (txn: Txn) => void;
}

/**
 * A single transaction row with swipe actions: swipe left to delete, swipe right to
 * re-categorise. Uses a movement threshold + directional lock so a mostly-vertical
 * touch (scrolling the list) never gets mistaken for a swipe.
 */
export function TransactionRow({ txn, category, onTap, onDelete, onRecategorize }: TransactionRowProps) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'x' | 'y' | null>(null);
  const wasSwipe = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    wasSwipe.current = false;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;

    if (axis.current === null) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axis.current === 'y') return; // let native vertical scroll happen

    wasSwipe.current = true;
    const clamped = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dx));
    setDragX(clamped);
  }

  function endDrag() {
    setDragging(false);
    if (axis.current === 'x') {
      if (dragX <= -SWIPE_THRESHOLD) onDelete(txn);
      else if (dragX >= SWIPE_THRESHOLD) onRecategorize(txn);
    }
    setDragX(0);
    start.current = null;
    axis.current = null;
  }

  function handleClick() {
    if (wasSwipe.current) {
      wasSwipe.current = false;
      return;
    }
    onTap(txn);
  }

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 flex items-stretch justify-between">
        <div className="flex w-1/2 items-center gap-2 bg-accent px-4 text-ink-on-accent">
          <Tag size={18} aria-hidden="true" />
          <span className="text-sm font-medium">Re-categorise</span>
        </div>
        <div className="flex w-1/2 items-center justify-end gap-2 bg-critical px-4 text-ink-on-accent">
          <span className="text-sm font-medium">Delete</span>
          <Trash2 size={18} aria-hidden="true" />
        </div>
      </div>
      <div
        className={[
          // `bg-surface` (not `bg-ground`) so the list reads as one raised white surface with
          // hairline row dividers (DESIGN-V3.md §3 "grouped lists... never one card per row"),
          // rather than floating directly on the page ground — it's still fully opaque, which is
          // what actually matters for hiding the swipe-action layer sitting at `absolute inset-0`
          // behind it.
          'relative flex min-h-[64px] items-center gap-3 border-b border-hairline bg-surface px-4 py-3 select-none',
          // Dim the CONTENTS, never this element. It carries the opaque background that
          // hides the swipe-action layer sitting at `absolute inset-0` behind it —
          // fading the element itself made that background translucent and let the
          // Re-categorise/Delete actions bleed through, so every excluded row looked
          // corrupted even at rest.
          txn.excluded ? '[&>*]:opacity-45' : '',
        ].join(' ')}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? 'none' : 'transform 200ms var(--ease-standard)',
          touchAction: 'pan-y',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={handleClick}
        role="button"
        tabIndex={0}
      >
        <CategoryIcon icon={category?.icon ?? 'Circle'} colorToken={category?.colorToken ?? 'cat-1'} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-md text-ink-1">{txn.merchant || txn.description}</p>
            {txn.excluded ? (
              <span className="shrink-0 rounded-pill border border-hairline px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-3">
                Excluded
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-ink-3">
            {category?.label ?? 'Uncategorised'}
            {txn.note ? ` · ${txn.note}` : ''}
          </p>
        </div>
        {/* No `--positive` token in v3 — income is carried by the `+` sign, not a
            second green competing with the accent. */}
        <span className="money shrink-0 text-md text-ink-1">{formatTxnAmount(txn.amountCents)}</span>
      </div>
    </div>
  );
}
