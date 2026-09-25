'use client';

import { useFormState } from 'react-dom';
import { outletLoginAction, type PublicForm } from '@/lib/actions/public';
import { Alert, Field, Input, PasswordInput, SubmitButton } from '../forms';

export function OutletLoginForm() {
  const [st, action] = useFormState<PublicForm, FormData>(outletLoginAction, {});
  return (
    <form action={action} className="space-y-4">
      <Alert>{st.error}</Alert>
      <Field label="Outlet username"><Input name="usernameOrEmail" autoComplete="username" required defaultValue={st.values?.usernameOrEmail} autoFocus /></Field>
      <Field label="Password"><PasswordInput name="password" autoComplete="current-password" required /></Field>
      <SubmitButton pendingText="Signing in…">Sign in to outlet</SubmitButton>
    </form>
  );
}
