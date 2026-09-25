'use client';

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { saveCustomerAction, type ActionResult } from '@/lib/actions/seller';
import { Drawer } from './Drawer';
import { Field, Input, SubmitButton } from '../forms';
import { Icon } from '../Icon';

export function CustomerForm({ trigger, customer }: { trigger: string; customer?: { _id: string; name: string; phone?: string; email?: string } }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState<ActionResult, FormData>(saveCustomerAction, {});
  const router = useRouter();
  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const clean = (v?: string) => (v && v !== 'N/A' ? v : '');
  return (
    <>
      <button onClick={() => setOpen(true)} className={customer ? 'btn btn-outline' : 'btn btn-dark'}>
        <Icon name={customer ? 'pen' : 'plus'} size={16} /> {trigger}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={customer ? 'Edit customer' : 'Add customer'}>
        <form action={action} className="space-y-4">
          {state.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
          {customer && <input type="hidden" name="id" value={customer._id} />}
          <Field label="Full name"><Input name="name" required defaultValue={customer?.name} autoFocus /></Field>
          <Field label="Phone"><Input name="phone" inputMode="tel" defaultValue={clean(customer?.phone)} /></Field>
          <Field label="Email"><Input name="email" type="email" defaultValue={clean(customer?.email)} /></Field>
          <SubmitButton pendingText="Saving…">{customer ? 'Save changes' : 'Add customer'}</SubmitButton>
        </form>
      </Drawer>
    </>
  );
}
