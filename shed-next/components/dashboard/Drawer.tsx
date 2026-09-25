'use client';

import { useEffect, type ReactNode } from 'react';
import { Icon } from '../Icon';

/** Right-side panel on desktop, bottom sheet on phones. */
export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-2xl bg-surface shadow-drawer sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-lg sm:rounded-none sm:animate-slide-in">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost h-9 w-9 min-h-0 px-0"><Icon name="close" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmButton({ label, confirm, onConfirm, className, danger = true }: { label: ReactNode; confirm: string; onConfirm: () => void; className?: string; danger?: boolean }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (window.confirm(confirm)) onConfirm();
      }}
      data-danger={danger || undefined}
    >
      {label}
    </button>
  );
}
