import React, { useEffect, useRef, useState } from 'react';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Optional footer, e.g. primary action row — kept in the bottom-third by design. */
  footer?: React.ReactNode;
}

const DISMISS_THRESHOLD_PX = 96;

/**
 * Bottom sheet modal with a drag-to-dismiss handle. Mobile-first: content and primary
 * actions live near the bottom of the screen for one-handed thumb reach.
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      setDragging(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    setDragY(Math.max(0, delta));
  };
  const endDrag = () => {
    setDragging(false);
    dragStartY.current = null;
    if (dragY > DISMISS_THRESHOLD_PX) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-[var(--overlay-scrim)] transition-opacity duration-200" onClick={onClose} />
      <div
        ref={sheetRef}
        className="relative w-full max-w-lg bg-surface-1 border-t border-border rounded-t-sheet overflow-hidden"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform 200ms var(--ease-standard)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div
          className="flex justify-center pt-3 pb-1 touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="h-1.5 w-10 rounded-pill bg-surface-2" />
        </div>

        {title ? (
          <div className="px-5 pb-2">
            <h2 className="text-lg font-semibold text-text-1">{title}</h2>
          </div>
        ) : null}

        <div className="px-5 pb-4 max-h-[70vh] overflow-y-auto scroll-container">{children}</div>

        {footer ? <div className="px-5 pt-2 pb-5 border-t border-border">{footer}</div> : null}
      </div>
    </div>
  );
}
