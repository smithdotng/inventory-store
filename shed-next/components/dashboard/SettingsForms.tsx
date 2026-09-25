'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { changePasswordAction, saveSettingsAction, type ActionResult } from '@/lib/actions/seller';
import { Field, Input, PasswordInput, Select, SubmitButton, Textarea } from '../forms';
import { Img } from '../Img';
import { Flash } from './ui';

type Bank = { bankName: string; bankAccountName: string; accountNumber: string };

const CURRENCIES = [['₦', 'Naira (₦)'], ['$', 'US Dollar ($)'], ['£', 'Pound (£)'], ['€', 'Euro (€)'], ['GH₵', 'Cedi (GH₵)'], ['KSh', 'Shilling (KSh)'], ['R', 'Rand (R)']];
const COUNTRIES = [['NG', 'Nigeria'], ['GH', 'Ghana'], ['KE', 'Kenya'], ['ZA', 'South Africa'], ['GB', 'United Kingdom'], ['US', 'United States'], ['CA', 'Canada']];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card grid gap-6 p-5 sm:p-6 lg:grid-cols-[260px_1fr]">
      <div>
        <h2 className="font-bold">{title}</h2>
        {hint && <p className="mt-1 text-sm text-subtle">{hint}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm">
      {label}
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-5 w-5 accent-ink" />
    </label>
  );
}

export function SettingsForm({ values: v, categories, clusters }: { values: Record<string, any> & { primary: Bank; secondary: Bank }; categories: string[]; clusters: { id: string; name: string }[] }) {
  const [state, action] = useFormState<ActionResult, FormData>(saveSettingsAction, {});
  const [logo, setLogo] = useState<string | null>(null);
  const [vatOn, setVatOn] = useState<boolean>(v.applyVat);
  return (
    <form action={action} className="space-y-6">
      <Flash ok={state.ok} error={state.error} />

      <Section title="Business" hint="Shown on your online store, invoices and receipts.">
        <div className="flex items-center gap-4 sm:col-span-2">
          <span className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-line">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-full w-full object-cover" />
            ) : (
              <Img src={v.logo && !/images\/logo\.png$/.test(v.logo) ? v.logo : null} alt={v.businessName} fallback="store" />
            )}
          </span>
          <label className="btn btn-outline cursor-pointer">
            Change logo
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setLogo(URL.createObjectURL(f)); }} />
          </label>
        </div>
        <Field label="Business name" className="sm:col-span-2"><Input name="businessName" required defaultValue={v.businessName} /></Field>
        <Field label="About your business" hint="A short description for your store page" className="sm:col-span-2"><Textarea name="description" maxLength={600} defaultValue={v.description} /></Field>
        <Field label="Business category">
          <Select name="category" defaultValue={v.category}>
            <option value="">Not set</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Market cluster" hint={v.clusterId && !v.verified ? 'Pending verification by Shed' : undefined}>
          <Select name="clusterId" defaultValue={v.clusterId}>
            <option value="">None</option>
            {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Country">
          <Select name="country" defaultValue={v.country}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</Select>
        </Field>
        <Field label="Currency">
          <Select name="currency" defaultValue={v.currency}>{CURRENCIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</Select>
        </Field>
      </Section>

      <Section title="Contact" hint="Choose which details customers can see on your store. Your phone is also your WhatsApp button.">
        <Field label="First name"><Input name="firstName" defaultValue={v.firstName} /></Field>
        <Field label="Last name"><Input name="lastName" defaultValue={v.lastName} /></Field>
        <Field label="Phone / WhatsApp"><Input name="phone" inputMode="tel" defaultValue={v.phone} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={v.email} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input name="address" defaultValue={v.address} /></Field>
        <Toggle name="publicPhone" label="Show phone & WhatsApp" defaultChecked={v.publicPhone} />
        <Toggle name="publicEmail" label="Show email" defaultChecked={v.publicEmail} />
        <Toggle name="publicAddress" label="Show address" defaultChecked={v.publicAddress} />
      </Section>

      <Section title="Getting paid" hint="Printed on invoices and shown to online customers at checkout.">
        <Field label="Payment instructions" hint="e.g. Transfer to GTBank 0123456789 and send proof on WhatsApp" className="sm:col-span-2"><Textarea name="paymentInstructions" maxLength={1000} defaultValue={v.paymentInstructions} /></Field>
        {(['primary', 'secondary'] as const).map((p) => (
          <fieldset key={p} className="space-y-3 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold capitalize">{p} account</legend>
            <Input name={`${p}BankName`} placeholder="Bank" defaultValue={v[p].bankName} />
            <Input name={`${p}BankAccountName`} placeholder="Account name" defaultValue={v[p].bankAccountName} />
            <Input name={`${p}AccountNumber`} placeholder="Account number" inputMode="numeric" defaultValue={v[p].accountNumber} />
          </fieldset>
        ))}
        <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm">
          Charge VAT
          <input type="checkbox" name="applyVat" checked={vatOn} onChange={(e) => setVatOn(e.target.checked)} className="h-5 w-5 accent-ink" />
        </label>
        {vatOn && <Field label="VAT rate (%)"><Input name="vatRate" type="number" min={0} max={100} step="0.1" defaultValue={v.vatRate} /></Field>}
      </Section>

      <Section title="Social links" hint="Full links, e.g. https://instagram.com/yourstore">
        <Field label="Instagram"><Input name="instagram" type="url" placeholder="https://instagram.com/…" defaultValue={v.instagram} /></Field>
        <Field label="Facebook"><Input name="facebook" type="url" placeholder="https://facebook.com/…" defaultValue={v.facebook} /></Field>
        <Field label="X / Twitter"><Input name="twitter" type="url" placeholder="https://x.com/…" defaultValue={v.twitter} /></Field>
        <Field label="Website"><Input name="website" type="url" placeholder="https://…" defaultValue={v.website} /></Field>
      </Section>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <SubmitButton fullWidth={false} className="btn-lg px-8 shadow-lift" pendingText="Saving…">Save settings</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useFormState<ActionResult, FormData>(changePasswordAction, {});
  return (
    <form action={action} key={state.ok ? state.at : 'pw'}>
      <section className="card grid gap-6 p-5 sm:p-6 lg:grid-cols-[260px_1fr]">
        <div>
          <h2 className="font-bold">Password</h2>
          <p className="mt-1 text-sm text-subtle">8+ characters with upper & lower case, a number and a symbol.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {(state.ok || state.error) && <div className="sm:col-span-3"><Flash ok={state.ok} error={state.error} /></div>}
          <Field label="Current password"><PasswordInput name="current" autoComplete="current-password" required /></Field>
          <Field label="New password"><PasswordInput name="password" autoComplete="new-password" required minLength={8} /></Field>
          <Field label="Confirm new password"><PasswordInput name="confirm" autoComplete="new-password" required minLength={8} /></Field>
          <div className="sm:col-span-3"><SubmitButton fullWidth={false} className="px-6" pendingText="Saving…">Change password</SubmitButton></div>
        </div>
      </section>
    </form>
  );
}
