'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormState } from 'react-dom';
import { shopperCodeAction, shopperLoginAction, shopperRegisterAction, shopperVerifyAction, shopperProfileAction, type ShopperForm } from '@/lib/actions/shopper';
import { Alert, Field, Input, PasswordInput, SubmitButton } from '../forms';
import { cn } from '@/lib/format';

export function ShopperLogin({ next, message }: { next: string; message?: string }) {
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [pw, pwAction] = useFormState<ShopperForm, FormData>(shopperLoginAction, {});
  const [code, codeAction] = useFormState<ShopperForm, FormData>(shopperCodeAction, { step: 'email' });
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 rounded-xl bg-canvas p-1 text-sm font-semibold">
        {(['password', 'code'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-lg py-2', mode === m ? 'bg-surface shadow-card' : 'text-subtle')}>
            {m === 'password' ? 'Password' : 'Email me a code'}
          </button>
        ))}
      </div>
      {message && <div className="mb-4"><Alert kind="success">{message}</Alert></div>}
      {mode === 'password' ? (
        <form action={pwAction} className="space-y-4">
          <Alert>{pw.error}</Alert>
          <input type="hidden" name="next" value={next} />
          <Field label="Email"><Input name="email" type="email" autoComplete="email" required defaultValue={pw.values?.email} /></Field>
          <Field label="Password"><PasswordInput name="password" autoComplete="current-password" required /></Field>
          <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
        </form>
      ) : (
        <form action={codeAction} className="space-y-4">
          <Alert>{code.error}</Alert>
          {code.message && <Alert kind="success">{code.message}</Alert>}
          <input type="hidden" name="next" value={next} />
          <Field label="Email"><Input name="email" type="email" autoComplete="email" required defaultValue={code.email} readOnly={code.step === 'code'} /></Field>
          {code.step === 'code' ? (
            <>
              <Field label="6-digit code"><Input name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="text-center text-xl font-bold tracking-[0.4em]" autoFocus /></Field>
              <SubmitButton name="intent" value="verify" pendingText="Checking…">Sign in</SubmitButton>
              <button type="submit" name="intent" value="send" formNoValidate className="btn btn-ghost w-full">Send a new code</button>
            </>
          ) : (
            <SubmitButton name="intent" value="send" pendingText="Sending…">Email me a sign-in code</SubmitButton>
          )}
          <p className="text-center text-xs text-subtle">No password needed. If you&apos;ve ordered before as a guest, your orders will be waiting.</p>
        </form>
      )}
    </div>
  );
}

export function ShopperRegister({ next }: { next: string }) {
  const [st, action] = useFormState<ShopperForm, FormData>(shopperRegisterAction, {});
  const v = st.values || {};
  return (
    <form action={action} className="space-y-4">
      <Alert>{st.error}</Alert>
      <input type="hidden" name="next" value={next} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name"><Input name="firstName" autoComplete="given-name" required defaultValue={v.firstName} /></Field>
        <Field label="Last name"><Input name="lastName" autoComplete="family-name" required defaultValue={v.lastName} /></Field>
      </div>
      <Field label="Email"><Input name="email" type="email" autoComplete="email" required defaultValue={v.email} /></Field>
      <Field label="Phone"><Input name="phone" type="tel" autoComplete="tel" required defaultValue={v.phone} /></Field>
      <Field label="Password" hint="8+ characters with an uppercase letter, a lowercase letter and a number"><PasswordInput name="password" autoComplete="new-password" required minLength={8} /></Field>
      <Field label="Confirm password"><PasswordInput name="confirmPassword" autoComplete="new-password" required minLength={8} /></Field>
      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
    </form>
  );
}

export function ShopperVerify({ email, next }: { email: string; next: string }) {
  const [st, action] = useFormState<ShopperForm, FormData>(shopperVerifyAction, {});
  return (
    <form action={action} className="space-y-4">
      <Alert>{st.error}</Alert>
      {st.message && <Alert kind="success">{st.message}</Alert>}
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <Field label="Verification code"><Input name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="text-center text-2xl font-bold tracking-[0.5em]" autoFocus /></Field>
      <SubmitButton name="intent" value="verify" pendingText="Verifying…">Verify email</SubmitButton>
      <button type="submit" name="intent" value="resend" formNoValidate className="btn btn-ghost w-full">Send a new code</button>
    </form>
  );
}

export function ShopperProfile({ values }: { values: { firstName: string; lastName: string; phone: string; email: string } }) {
  const [st, action] = useFormState<ShopperForm, FormData>(shopperProfileAction, {});
  return (
    <form action={action} className="space-y-3">
      <Alert>{st.error}</Alert>
      {st.message && <Alert kind="success">{st.message}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name"><Input name="firstName" defaultValue={values.firstName} /></Field>
        <Field label="Last name"><Input name="lastName" defaultValue={values.lastName} /></Field>
      </div>
      <Field label="Phone"><Input name="phone" type="tel" defaultValue={values.phone} /></Field>
      <Field label="Email" hint="Contact support to change your email"><Input value={values.email} readOnly disabled /></Field>
      <SubmitButton className="btn-outline" pendingText="Saving…">Save</SubmitButton>
      <p className="text-center text-sm"><a href="/shopper/logout" className="font-medium text-danger hover:underline">Sign out</a></p>
    </form>
  );
}
