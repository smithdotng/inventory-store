'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/lib/actions/seller';
import { cn } from '@/lib/format';

/** Button that runs a server action, optionally after confirming, and shows the result. */
export function ActionButton({ action, confirm: ask, children, className, danger }: { action: () => Promise<ActionResult | void>; confirm?: string; children: ReactNode; className?: string; danger?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (ask && !window.confirm(ask)) return;
          start(async () => {
            const r = await action();
            setMsg(r || null);
            router.refresh();
          });
        }}
        className={cn(className || 'btn btn-outline h-9 min-h-0 px-3 text-sm', danger && 'text-danger')}
      >
        {pending ? '…' : children}
      </button>
      {msg?.error && <span className="mt-1 text-xs text-danger">{msg.error}</span>}
      {msg?.ok && <span className="mt-1 text-xs text-success">{msg.ok}</span>}
    </span>
  );
}
