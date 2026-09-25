'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { broadcastA, sendMessageA, updateStoreA } from '@/lib/actions/admin';
import type { ActionResult } from '@/lib/actions/seller';
import { Field, Input, Select, SubmitButton, Textarea } from '../forms';
import { Flash } from '../dashboard/ui';

export function EditStoreForm({ store, categories }: { store: Record<string, string>; categories: string[] }) {
  const [st, action] = useFormState<ActionResult, FormData>(updateStoreA, {});
  const router = useRouter();
  useEffect(() => {
    if (st.ok && st.id && st.id !== store.username) router.replace(`/dashboard/admin/stores/${st.id}`);
  }, [st.at]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Flash ok={st.ok} error={st.error} /></div>
      <input type="hidden" name="id" value={store.id} />
      <Field label="Business name"><Input name="businessName" defaultValue={store.businessName} /></Field>
      <Field label="Username"><Input name="username" defaultValue={store.username} required /></Field>
      <Field label="Email"><Input name="email" type="email" defaultValue={store.email} /></Field>
      <Field label="Phone"><Input name="phone" defaultValue={store.phone} /></Field>
      <Field label="Currency"><Input name="currency" defaultValue={store.currency} /></Field>
      <Field label="Category">
        <Select name="category" defaultValue={store.category}><option value="">—</option>{categories.map((c) => <option key={c}>{c}</option>)}</Select>
      </Field>
      <Field label="Role">
        <Select name="role" defaultValue={store.role}><option value="admin">Store owner</option><option value="superadmin">Shed administrator</option></Select>
      </Field>
      <div className="flex items-end"><SubmitButton pendingText="Saving…">Save</SubmitButton></div>
    </form>
  );
}

export function MessageForm({ recipientId, stores }: { recipientId?: string; stores?: { id: string; name: string }[] }) {
  const [st, action] = useFormState<ActionResult, FormData>(sendMessageA, {});
  return (
    <form action={action} className="space-y-3" key={st.ok ? st.at : 'm'}>
      <Flash ok={st.ok} error={st.error} />
      {recipientId ? (
        <input type="hidden" name="recipientId" value={recipientId} />
      ) : (
        <Field label="To">
          <Select name="recipientId" defaultValue="">
            <option value="">All stores</option>
            {(stores || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Subject"><Input name="subject" placeholder="Message from Shed" /></Field>
      <Field label="Message"><Textarea name="content" required /></Field>
      <SubmitButton pendingText="Sending…">Send to dashboard inbox</SubmitButton>
    </form>
  );
}

export function BroadcastForm({ count }: { count: number }) {
  const [st, action] = useFormState<ActionResult, FormData>(broadcastA, {});
  return (
    <form action={action} className="space-y-3" onSubmit={(e) => { if (!confirm(`Email all ${count} store owners now?`)) e.preventDefault(); }}>
      <Flash ok={st.ok} error={st.error} />
      <Field label="Subject"><Input name="subject" required /></Field>
      <Field label="Email body (HTML)" hint="Use {{name}} for the store owner's first name."><Textarea name="html" required className="min-h-[180px] font-mono text-sm" defaultValue={'<p>Hi {{name}},</p>\n<p></p>\n<p>— The Shed team</p>'} /></Field>
      <SubmitButton pendingText="Sending… this can take a few minutes">Send email to {count} store owners</SubmitButton>
    </form>
  );
}
