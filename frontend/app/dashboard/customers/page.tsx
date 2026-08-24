'use client';

import { useState } from 'react';
import { useApi, apiJson } from '@/lib/client-api';
import { PageHeader, Panel, EmptyState } from '@/components/dashboard/ui';

interface Customer {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  createdAt?: string;
}

export default function CustomersPage() {
  const { data, loading, error, reload } = useApi<{ customers: Customer[] }>('/api/admin/customers');
  const [show, setShow] = useState(false);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="People who have bought from your business."
        action={
          <button className="btn btn-primary" onClick={() => setShow((v) => !v)}>
            {show ? 'Close' : '+ Add customer'}
          </button>
        }
      />

      {show && (
        <div className="mb-6">
          <AddCustomerForm
            onAdded={() => {
              setShow(false);
              reload();
            }}
          />
        </div>
      )}

      <Panel>
        {loading ? (
          <EmptyState>Loading…</EmptyState>
        ) : error ? (
          <EmptyState>{error}</EmptyState>
        ) : !data || data.customers.length === 0 ? (
          <EmptyState>No customers yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Phone</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.customers.map((c) => (
                  <tr key={c._id}>
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    <td className="px-5 py-3 text-subtle">{c.phone || '—'}</td>
                    <td className="px-5 py-3 text-subtle">{c.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function AddCustomerForm({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiJson('/api/admin/customers', 'POST', form);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <Panel title="Add customer">
      <form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Name" value={form.name} onChange={f('name')} required />
        <Field label="Phone" value={form.phone} onChange={f('phone')} />
        <Field label="Email" type="email" value={form.email} onChange={f('email')} />
        {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
        <div className="sm:col-span-3">
          <button disabled={busy} className="btn btn-primary">
            {busy ? 'Saving…' : 'Save customer'}
          </button>
        </div>
      </form>
    </Panel>
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
