import React, { useEffect } from 'react';
import { Button } from './Button';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/** Centred modal for short, focused content. Prefer `Sheet` for anything longer or form-like. */
export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-[var(--overlay-scrim)]" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-card border border-border bg-surface-1 p-5">
        {title ? <h2 className="mb-2 text-lg font-semibold text-text-1">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use the danger button variant for destructive confirmations. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Every destructive action confirms (CONTRACTS.md §8) — use this for that confirmation. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      {body ? <div className="mb-4 text-sm text-text-2">{body}</div> : null}
      <div className="flex gap-3">
        <Button variant="ghost" fullWidth onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? 'danger' : 'primary'} fullWidth onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
