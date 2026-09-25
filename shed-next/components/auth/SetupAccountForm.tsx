'use client';

import { useFormState } from 'react-dom';
import { setupAccountAction, type FormState } from '@/app/(auth)/actions';
import { Alert, Field, PasswordInput, SubmitButton } from '../forms';

export function SetupAccountForm({ token }: { token: string }) {
  const [state, action] = useFormState<FormState, FormData>(setupAccountAction, {});
  return (
    <form action={action} className="space-y-4">
      <Alert>{state.error}</Alert>
      <input type="hidden" name="token" value={token} />
      <Field label="Choose a password" hint="8+ characters with upper & lower case, a number and a symbol"><PasswordInput name="password" autoComplete="new-password" required minLength={8} autoFocus /></Field>
      <Field label="Confirm password"><PasswordInput name="confirmPassword" autoComplete="new-password" required minLength={8} /></Field>
      <SubmitButton pendingText="Setting up…">Activate my account</SubmitButton>
    </form>
  );
}
