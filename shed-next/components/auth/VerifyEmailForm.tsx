'use client';

import { useFormState } from 'react-dom';
import { verifyEmailAction, type FormState } from '@/app/(auth)/actions';
import { Alert, Field, Input, SubmitButton } from '../forms';

export function VerifyEmailForm({ email }: { email: string }) {
  const [state, action] = useFormState<FormState, FormData>(verifyEmailAction, {});
  return (
    <form action={action} className="space-y-4">
      <Alert>{state.error}</Alert>
      {state.message && <Alert kind="success">{state.message}</Alert>}
      <input type="hidden" name="email" value={email} />
      <Field label="Verification code">
        <Input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="••••••" className="text-center text-2xl font-bold tracking-[0.5em]" autoFocus />
      </Field>
      <SubmitButton name="intent" value="verify" pendingText="Verifying…">Verify & create account</SubmitButton>
      <button type="submit" name="intent" value="resend" formNoValidate className="btn btn-ghost w-full">
        Didn&apos;t get it? Send a new code
      </button>
    </form>
  );
}
