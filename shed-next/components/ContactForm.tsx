'use client';

import { useFormState } from 'react-dom';
import { contactAction, type PublicForm } from '@/lib/actions/public';
import { Alert, Field, Input, Select, SubmitButton, Textarea } from './forms';

export function ContactForm() {
  const [st, action] = useFormState<PublicForm, FormData>(contactAction, {});
  if (st.message) return <Alert kind="success">{st.message}</Alert>;
  const v = st.values || {};
  return (
    <form action={action} className="space-y-4">
      <Alert>{st.error}</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><Input name="name" required defaultValue={v.name} autoComplete="name" /></Field>
        <Field label="Email"><Input name="email" type="email" required defaultValue={v.email} autoComplete="email" /></Field>
        <Field label="Phone (optional)"><Input name="phone" type="tel" defaultValue={v.phone} /></Field>
        <Field label="Topic">
          <Select name="subject" defaultValue={v.subject || 'General Inquiry'}>
            {['General Inquiry', 'Getting started', 'Billing', 'Technical support', 'Partnerships', 'Report a problem with a store'].map((o) => <option key={o}>{o}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Message"><Textarea name="message" required maxLength={5000} defaultValue={v.message} className="min-h-[160px]" /></Field>
      <SubmitButton pendingText="Sending…">Send message</SubmitButton>
    </form>
  );
}
