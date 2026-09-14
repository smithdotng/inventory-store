'use client';

import { useState } from 'react';
import { useApi, apiForm } from '@/lib/client-api';
import { PageHeader, Panel } from '@/components/dashboard/ui';

interface Profile {
  _id: string;
  username: string;
  businessName?: string;
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
  currency?: string;
  logo?: string;
  description?: string;
  paymentInstructions?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  publicPhone?: string;
}

export default function ProfilePage() {
  const { data, loading, error, reload } = useApi<{ profile: Profile }>('/api/admin/profile');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      await apiForm('/api/admin/profile', new FormData(e.currentTarget));
      setSaved(true);
      reload();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Panel><div className="p-8 text-sm text-subtle">Loading profile…</div></Panel>;
  if (error || !data) return <Panel><div className="p-8 text-sm text-subtle">{error || 'Not found'}</div></Panel>;

  const p = data.profile;

  return (
    <>
      <PageHeader title="Business profile" subtitle="This information powers your storefront and invoices." />

      <form onSubmit={onSubmit} className="space-y-6">
        <Panel title="Business details">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field name="businessName" label="Business name" defaultValue={p.businessName} />
            <Field name="currency" label="Currency symbol" defaultValue={p.currency} />
            <Field name="email" label="Email" type="email" defaultValue={p.email} />
            <Field name="phone" label="Phone" defaultValue={p.phone} />
            <Field name="country" label="Country" defaultValue={p.country} />
            <Field name="address" label="Address" defaultValue={p.address} />
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-ink/80">Store description</span>
              <textarea
                name="description"
                defaultValue={p.description}
                rows={2}
                className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-ink/80">Payment instructions (shown at checkout)</span>
              <textarea
                name="paymentInstructions"
                defaultValue={p.paymentInstructions}
                rows={2}
                className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
        </Panel>

        <Panel title="Logo & socials">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center gap-4">
              {p.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.logo} alt="" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl">🏪</span>
              )}
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink/80">Upload new logo</span>
                <input name="logo" type="file" accept="image/*" className="text-sm" />
              </label>
            </div>
            <Field name="instagram" label="Instagram URL" defaultValue={p.instagram} />
            <Field name="facebook" label="Facebook URL" defaultValue={p.facebook} />
            <Field name="twitter" label="Twitter URL" defaultValue={p.twitter} />
            <Field name="publicPhone" label="Public WhatsApp/phone" defaultValue={p.publicPhone} />
          </div>
        </Panel>

        <div className="flex items-center gap-4">
          <button disabled={busy} className="btn btn-primary">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="text-sm font-medium text-green-600">Saved ✓</span>}
          {saveError && <span className="text-sm text-red-600">{saveError}</span>}
        </div>
      </form>
    </>
  );
}

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink/80">{label}</span>
      <input
        {...rest}
        className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
