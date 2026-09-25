'use client';

import { useFormState } from 'react-dom';
import { affiliateForgotAction, affiliateLoginAction, affiliateResetAction, affiliateSignupAction, type PublicForm } from '@/lib/actions/public';
import { Alert, Field, Input, PasswordInput, Select, SubmitButton } from '../forms';

export function AffiliateLogin({ message }: { message?: string }) {
  const [st, action] = useFormState<PublicForm, FormData>(affiliateLoginAction, {});
  return (
    <form action={action} className="space-y-4">
      {message && !st.error && <Alert kind="success">{message}</Alert>}
      <Alert>{st.error}</Alert>
      <Field label="Email"><Input name="email" type="email" autoComplete="email" required defaultValue={st.values?.email} /></Field>
      <Field label="Password"><PasswordInput name="password" autoComplete="current-password" required /></Field>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

const COUNTRIES = [['Nigeria', '+234'], ['Ghana', '+233'], ['Kenya', '+254'], ['South Africa', '+27'], ['United Kingdom', '+44'], ['United States', '+1'], ['Canada', '+1']];

export function AffiliateSignup() {
  const [st, action] = useFormState<PublicForm, FormData>(affiliateSignupAction, {});
  const v = st.values || {};
  return (
    <form action={action} className="space-y-4">
      <Alert>{st.error}</Alert>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name"><Input name="firstName" required defaultValue={v.firstName} /></Field>
        <Field label="Last name"><Input name="lastName" required defaultValue={v.lastName} /></Field>
      </div>
      <Field label="Email"><Input name="email" type="email" required defaultValue={v.email} /></Field>
      <Field label="Country">
        <Select name="country" defaultValue={v.country || 'Nigeria'}>{COUNTRIES.map(([c]) => <option key={c}>{c}</option>)}</Select>
      </Field>
      <div className="grid grid-cols-[110px_1fr] gap-3">
        <Field label="Code"><Select name="countryCode" defaultValue={v.countryCode || '+234'}>{[...new Set(COUNTRIES.map(([, c]) => c))].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Mobile number"><Input name="mobileNumber" type="tel" required defaultValue={v.mobileNumber} /></Field>
      </div>
      <Field label="Password" hint="At least 8 characters"><PasswordInput name="password" required minLength={8} autoComplete="new-password" /></Field>
      <SubmitButton pendingText="Creating…">Join the programme</SubmitButton>
    </form>
  );
}

export function AffiliateForgot() {
  const [st, action] = useFormState<PublicForm, FormData>(affiliateForgotAction, {});
  if (st.message) return <Alert kind="success">{st.message}</Alert>;
  return (
    <form action={action} className="space-y-4">
      <Field label="Email"><Input name="email" type="email" required /></Field>
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

export function AffiliateReset({ token }: { token: string }) {
  const [st, action] = useFormState<PublicForm, FormData>(affiliateResetAction, {});
  return (
    <form action={action} className="space-y-4">
      <Alert>{st.error}</Alert>
      <input type="hidden" name="token" value={token} />
      <Field label="New password"><PasswordInput name="password" required minLength={8} autoComplete="new-password" /></Field>
      <Field label="Confirm password"><PasswordInput name="confirmPassword" required minLength={8} autoComplete="new-password" /></Field>
      <SubmitButton pendingText="Saving…">Reset password</SubmitButton>
    </form>
  );
}
