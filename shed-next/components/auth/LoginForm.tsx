'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { loginAction, type FormState } from '@/app/(auth)/actions';
import { Alert, Field, Input, PasswordInput, SubmitButton } from '../forms';

export function LoginForm({ message, error, next }: { message?: string; error?: string; next?: string }) {
  const [state, action] = useFormState<FormState, FormData>(loginAction, { error: error || null });
  return (
    <form action={action} className="space-y-4">
      {message && !state.error && <Alert kind="success">{message}</Alert>}
      <Alert>{state.error}</Alert>
      <input type="hidden" name="next" value={next || ''} />
      <Field label="Username or email">
        <Input name="usernameOrEmail" autoComplete="username" required autoFocus defaultValue={state.values?.usernameOrEmail} placeholder="you@business.com" />
      </Field>
      <Field label="Password">
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-subtle hover:text-ink">
          Forgot password?
        </Link>
      </div>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
