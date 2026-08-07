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

  // Move focus into the sheet on open, restore it to whatever was focused before on
  // close — same rationale as Modal (see its comment): otherwise a keyboard/AT user's
  // focus is left on a trigger control now hidden under the scrim.
  const previouslyFocused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

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
      <div className="absolute inset-0 bg-[var(--overlay-scrim)] transition-opacity duration-180" onClick={onClose} />
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="relative w-full max-w-lg bg-surface-3 rounded-t-sheet overflow-hidden shadow-[0_-8px_24px_rgba(0,0,0,0.4)] outline-none"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform 180ms var(--ease-standard)',
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
          <div className="h-1.5 w-10 rounded-pill bg-hairline" />
        </div>

        {title ? (
          <div className="px-5 pb-2">
            <h2 className="title">{title}</h2>
          </div>
        ) : null}

        <div className="px-5 pb-4 max-h-[70vh] overflow-y-auto scroll-container">{children}</div>

        {footer ? <div className="px-5 pt-2 pb-5 border-t border-hairline">{footer}</div> : null}
      </div>
    </div>
  );
}
