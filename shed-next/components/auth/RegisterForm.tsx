'use client';

import { useFormState } from 'react-dom';
import { registerAction, type FormState } from '@/app/(auth)/actions';
import { Alert, Field, Input, PasswordInput, Select, SubmitButton } from '../forms';

const CURRENCIES = [
  ['₦', 'Nigerian Naira (₦)'],
  ['$', 'US Dollar ($)'],
  ['£', 'British Pound (£)'],
  ['€', 'Euro (€)'],
  ['GH₵', 'Ghanaian Cedi (GH₵)'],
  ['KSh', 'Kenyan Shilling (KSh)'],
  ['R', 'South African Rand (R)'],
];
const COUNTRIES = [
  ['NG', 'Nigeria'], ['GH', 'Ghana'], ['KE', 'Kenya'], ['ZA', 'South Africa'], ['GB', 'United Kingdom'], ['US', 'United States'], ['CA', 'Canada'],
];

export function RegisterForm({ referralCode, categories, clusters }: { referralCode?: string | null; categories: string[]; clusters: { id: string; name: string }[] }) {
  const [state, action] = useFormState<FormState, FormData>(registerAction, {});
  const v = state.values || {};
  return (
    <form action={action} className="space-y-5">
      <Alert>{state.error}</Alert>
      <input type="hidden" name="ref" value={referralCode || ''} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">About you</legend>
        <Field label="First name"><Input name="firstName" autoComplete="given-name" required defaultValue={v.firstName} /></Field>
        <Field label="Last name"><Input name="lastName" autoComplete="family-name" required defaultValue={v.lastName} /></Field>
        <Field label="Email" className="sm:col-span-2"><Input name="email" type="email" autoComplete="email" required defaultValue={v.email} /></Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">Your business</legend>
        <Field label="Business name" className="sm:col-span-2"><Input name="businessName" autoComplete="organization" required defaultValue={v.businessName} /></Field>
        <Field label="Country">
          <Select name="country" defaultValue={v.country || 'NG'}>
            {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </Select>
        </Field>
        <Field label="Currency">
          <Select name="currency" defaultValue={v.currency || '₦'}>
            {CURRENCIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </Select>
        </Field>
        <Field label="Business category" hint="Helps shoppers find you">
          <Select name="category" defaultValue={v.category || ''}>
            <option value="">Choose later</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Market cluster" hint="Optional — e.g. your market or plaza">
          <Select name="clusterId" defaultValue={v.clusterId || ''}>
            <option value="">None</option>
            {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Logo" hint="PNG or JPG, up to 5MB (optional)" className="sm:col-span-2">
          <input name="logo" type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-canvas file:px-4 file:py-2 file:text-sm file:font-semibold hover:file:bg-line" />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">Sign-in details</legend>
        <Field label="Username" hint="Your store link: shed.ng/store/username"><Input name="username" autoComplete="username" required pattern="[A-Za-z0-9_.\-]{3,30}" defaultValue={v.username} /></Field>
        <Field label="Password" hint="8+ characters with upper & lower case, a number and a symbol"><PasswordInput name="password" autoComplete="new-password" required minLength={8} /></Field>
      </fieldset>

      <SubmitButton pendingText="Creating your store…">Create my store — free for 14 days</SubmitButton>
      <p className="text-center text-xs text-subtle">We&apos;ll email you a 6-digit code to confirm your address.</p>
    </form>
  );
}
