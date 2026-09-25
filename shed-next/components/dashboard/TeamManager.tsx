'use client';

import { useEffect, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { inviteMemberAction, teamAction, type ActionResult } from '@/lib/actions/seller';
import { cn } from '@/lib/format';
import { Drawer } from './Drawer';
import { Field, Input, Select, SubmitButton } from '../forms';
import { Icon } from '../Icon';
import { Flash, fmtDate } from './ui';

type U = { _id: string; firstName: string; lastName: string; email: string; role: string; status: string; lastLogin?: string; createdAt?: string };
type R = { value: string; label: string; hint: string };

export function TeamManager({ users, roles }: { users: U[]; roles: R[] }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [state, action] = useFormState<ActionResult, FormData>(inviteMemberAction, {});
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      setMsg(state);
      router.refresh();
    }
  }, [state.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = (id: string, a: Parameters<typeof teamAction>[1], role?: string) =>
    start(async () => {
      setMsg(await teamAction(id, a, role));
      router.refresh();
    });
  const label = (r: string) => roles.find((x) => x.value === r)?.label || r;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex-1">{msg && <Flash ok={msg.ok} error={msg.error} />}</div>
        <button onClick={() => setOpen(true)} className="btn btn-dark shrink-0"><Icon name="plus" size={16} strokeWidth={2.25} /> Invite someone</button>
      </div>
      <div className="card overflow-hidden">
        {users.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-subtle">It&apos;s just you for now. Invite a cashier or stock clerk so they can sign in with their own account.</p>
        ) : (
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u._id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-canvas text-sm font-bold">{u.firstName?.[0]}{u.lastName?.[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{u.firstName} {u.lastName}</span>
                  <span className="block truncate text-xs text-subtle">{u.email} · {u.status === 'pending' ? `Invited ${fmtDate(u.createdAt)}` : u.lastLogin ? `Last seen ${fmtDate(u.lastLogin)}` : 'Never signed in'}</span>
                </span>
                <select aria-label={`Role for ${u.firstName}`} value={u.role} disabled={pending} onChange={(e) => run(u._id, 'role', e.target.value)} className="input h-9 w-auto py-0 text-sm">
                  {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', u.status === 'active' ? 'bg-success-soft text-success' : u.status === 'pending' ? 'bg-brand-soft text-brand-dark' : 'bg-canvas text-subtle')}>
                  {u.status === 'active' ? 'Active' : u.status === 'pending' ? 'Invited' : 'Paused'}
                </span>
                <details className="relative">
                  <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-canvas" aria-label="Actions">⋯</summary>
                  <div className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lift">
                    {u.status === 'pending' && <button onClick={() => run(u._id, 'resend')} className="block w-full px-4 py-2 text-left text-sm hover:bg-canvas">Resend invitation</button>}
                    {u.status === 'active' && <button onClick={() => run(u._id, 'deactivate')} className="block w-full px-4 py-2 text-left text-sm hover:bg-canvas">Pause access</button>}
                    {u.status === 'inactive' && <button onClick={() => run(u._id, 'activate')} className="block w-full px-4 py-2 text-left text-sm hover:bg-canvas">Restore access</button>}
                    <button onClick={() => confirm(`Remove ${u.firstName} from your team?`) && run(u._id, 'remove')} className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-canvas">Remove</button>
                  </div>
                </details>
                <span className="sr-only">{label(u.role)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title="Invite a team member">
        <form action={action} className="space-y-4">
          {state.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><Input name="firstName" required /></Field>
            <Field label="Last name"><Input name="lastName" required /></Field>
          </div>
          <Field label="Email" hint="We'll email them a link to set their password."><Input name="email" type="email" required /></Field>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Role</legend>
            {roles.map((r, i) => (
              <label key={r.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-ink">
                <input type="radio" name="role" value={r.value} defaultChecked={i === 0} className="mt-1 accent-ink" />
                <span><span className="block text-sm font-semibold">{r.label}</span><span className="block text-xs text-subtle">{r.hint}</span></span>
              </label>
            ))}
          </fieldset>
          <SubmitButton pendingText="Sending…">Send invitation</SubmitButton>
        </form>
      </Drawer>
    </>
  );
}
