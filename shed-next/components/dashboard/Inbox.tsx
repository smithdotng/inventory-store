'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { messageAction } from '@/lib/actions/seller';
import { cn } from '@/lib/format';
import { fmtDate } from './ui';

type M = { _id: string; subject: string; content: string; createdAt: string; read?: boolean; isHtml?: boolean; sender?: string };

/** Very small, safe renderer: messages are shown as plain text (HTML tags stripped). */
const toText = (m: M) => (m.isHtml ? m.content.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : m.content);

export function Inbox({ rows, trash }: { rows: M[]; trash: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const act = (id: string, a: Parameters<typeof messageAction>[1]) => start(async () => { await messageAction(id, a); router.refresh(); });

  if (!rows.length) return <p className="card px-6 py-16 text-center text-sm text-subtle">{trash ? 'Trash is empty.' : "You're all caught up."}</p>;
  return (
    <ul className="card divide-y divide-line overflow-hidden">
      {rows.map((m) => {
        const isOpen = open === m._id;
        return (
          <li key={m._id}>
            <button
              onClick={() => {
                setOpen(isOpen ? null : m._id);
                if (!m.read && !trash) act(m._id, 'read');
              }}
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-canvas sm:px-5"
              aria-expanded={isOpen}
            >
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', m.read ? 'bg-transparent' : 'bg-brand')} />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm', !m.read && 'font-bold')}>{m.subject || '(no subject)'}</span>
                <span className="block truncate text-xs text-subtle">{m.sender || 'Shed'} · {fmtDate(m.createdAt, true)}</span>
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-line bg-canvas/60 px-5 py-4 sm:pl-10">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{toText(m)}</pre>
                <div className="mt-4 flex gap-3 text-sm font-medium">
                  {trash ? (
                    <>
                      <button onClick={() => act(m._id, 'restore')} className="hover:underline">Restore</button>
                      <button onClick={() => confirm('Delete forever?') && act(m._id, 'delete')} className="text-danger hover:underline">Delete forever</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => act(m._id, 'unread')} className="hover:underline">Mark unread</button>
                      <button onClick={() => act(m._id, 'trash')} className="text-danger hover:underline">Move to trash</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
