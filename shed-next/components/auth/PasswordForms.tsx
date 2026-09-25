'use client';

import { useFormState } from 'react-dom';
import { forgotPasswordAction, resetPasswordAction, type FormState } from '@/app/(auth)/actions';
import { Alert, Field, Input, PasswordInput, SubmitButton } from '../forms';

export function ForgotPasswordForm() {
  const [state, action] = useFormState<FormState, FormData>(forgotPasswordAction, {});
  if (state.message) return <Alert kind="success">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-4">
      <Field label="Email address"><Input name="email" type="email" autoComplete="email" required autoFocus /></Field>
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useFormState<FormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <Alert>{state.error}</Alert>
      <input type="hidden" name="token" value={token} />
      <Field label="New password" hint="8+ characters with upper & lower case, a number and a symbol"><PasswordInput name="password" autoComplete="new-password" required minLength={8} autoFocus /></Field>
      <Field label="Confirm new password"><PasswordInput name="confirmPassword" autoComplete="new-password" required minLength={8} /></Field>
      <SubmitButton pendingText="Saving…">Set new password</SubmitButton>
    </form>
  );
}
