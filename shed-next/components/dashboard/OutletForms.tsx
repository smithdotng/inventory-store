'use client';

import { useEffect, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createOutletAction, deleteOutletAction, dispenseAction, payCommissionAction, updateOutletAction, type ActionResult } from '@/lib/actions/seller';
import { Drawer } from './Drawer';
import { Field, Input, PasswordInput, SubmitButton } from '../forms';
import { Icon } from '../Icon';
import { Flash } from './ui';
import { formatCurrency } from '@/lib/format';

export function NewOutlet() {
  const [open, setOpen] = useState(false);
  const [st, action] = useFormState<ActionResult, FormData>(createOutletAction, {});
  const router = useRouter();
  useEffect(() => {
    if (st.ok && st.id) router.push(`/dashboard/outlets/${st.id}`);
  }, [st.at]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-dark"><Icon name="plus" size={16} strokeWidth={2.25} /> New outlet</button>
      <Drawer open={open} onClose={() => setOpen(false)} title="New outlet">
        <form action={action} className="space-y-4">
          {st.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{st.error}</p>}
          <Field label="Outlet name"><Input name="name" required placeholder="e.g. Garki kiosk" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Location"><Input name="location" /></Field>
            <Field label="Phone"><Input name="mobile" inputMode="tel" /></Field>
          </div>
          <p className="pt-2 text-sm font-semibold">Outlet login</p>
          <Field label="Username" hint="They sign in at /outlet-login"><Input name="username" required pattern="[A-Za-z0-9_.\-]{3,30}" /></Field>
          <Field label="Password" hint="At least 8 characters"><PasswordInput name="password" required minLength={8} autoComplete="new-password" /></Field>
          <SubmitButton pendingText="Creating…">Create outlet</SubmitButton>
        </form>
      </Drawer>
    </>
  );
}

export function DispenseForm({ outletId, products, currency }: { outletId: string; products: { _id: string; name: string; stock: number; cost: number }[]; currency: string }) {
  const [st, action] = useFormState<ActionResult, FormData>(dispenseAction, {});
  const [dir, setDir] = useState<'send' | 'return'>('send');
  const router = useRouter();
  useEffect(() => {
    if (st.ok) router.refresh();
  }, [st.at]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={action} className="space-y-3" key={st.ok ? st.at : 'd'}>
      <Flash ok={st.ok} error={st.error} />
      <input type="hidden" name="outletId" value={outletId} />
      <input type="hidden" name="direction" value={dir} />
      <div className="grid grid-cols-2 rounded-xl bg-canvas p-1 text-sm font-semibold">
        {(['send', 'return'] as const).map((d) => (
          <button key={d} type="button" onClick={() => setDir(d)} className={`rounded-lg py-2 ${dir === d ? 'bg-surface shadow-card' : 'text-subtle'}`}>{d === 'send' ? 'Send stock' : 'Take stock back'}</button>
        ))}
      </div>
      <select name="itemId" required className="input" aria-label="Product">
        <option value="">Choose a product…</option>
        {products.map((p) => <option key={p._id} value={p._id}>{p.name} — {formatCurrency(p.cost, currency)} ({p.stock} in your store)</option>)}
      </select>
      <div className="flex gap-2">
        <input name="quantity" type="number" min={1} required placeholder="Quantity" className="input" />
        <SubmitButton fullWidth={false} className="shrink-0 px-5" pendingText="…">{dir === 'send' ? 'Send' : 'Return'}</SubmitButton>
      </div>
    </form>
  );
}

export function PayCommission({ outletId, amount, currency }: { outletId: string; amount: number; currency: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const router = useRouter();
  return (
    <div>
      {msg && <Flash ok={msg.ok} error={msg.error} />}
      <button
        disabled={pending || amount <= 0}
        onClick={() => confirm(`Mark ${formatCurrency(amount, currency)} commission as paid?`) && start(async () => { setMsg(await payCommissionAction(outletId)); router.refresh(); })}
        className="btn btn-brand w-full"
      >
        {amount > 0 ? `Mark ${formatCurrency(amount, currency)} as paid` : 'Nothing to pay'}
      </button>
    </div>
  );
}

export function EditOutlet({ outlet }: { outlet: { _id: string; name: string; location?: string; mobile?: string; username: string } }) {
  const [open, setOpen] = useState(false);
  const [st, action] = useFormState<ActionResult, FormData>(updateOutletAction, {});
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    if (st.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [st.at]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-outline"><Icon name="pen" size={16} /> Edit</button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Edit outlet">
        <form action={action} className="space-y-4">
          {st.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{st.error}</p>}
          <input type="hidden" name="id" value={outlet._id} />
          <Field label="Outlet name"><Input name="name" defaultValue={outlet.name} required /></Field>
          <Field label="Location"><Input name="location" defaultValue={outlet.location} /></Field>
          <Field label="Phone"><Input name="mobile" defaultValue={outlet.mobile} /></Field>
          <Field label="New password" hint={`Leave blank to keep the current password for @${outlet.username}`}><PasswordInput name="password" minLength={8} autoComplete="new-password" /></Field>
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </form>
        <div className="mt-8 border-t border-line pt-5">
          <button
            disabled={pending}
            onClick={() => confirm(`Delete ${outlet.name}? Unsold stock goes back to your inventory.`) && start(async () => { await deleteOutletAction(outlet._id); })}
            className="text-sm font-semibold text-danger hover:underline"
          >
            Delete this outlet
          </button>
        </div>
      </Drawer>
    </>
  );
}
