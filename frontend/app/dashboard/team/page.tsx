'use client';

import { useState } from 'react';
import { useApi, apiJson } from '@/lib/client-api';
import { PageHeader, Panel, EmptyState, StatusBadge } from '@/components/dashboard/ui';

interface Member {
  _id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  role?: string;
  status?: string;
}

export default function TeamPage() {
  const { data, loading, error, reload } = useApi<{ users: Member[] }>('/api/admin/team');
  const [show, setShow] = useState(false);

  async function toggle(m: Member) {
    const action = (m.status || '').toLowerCase() === 'active' ? 'deactivate' : 'activate';
    try {
      await apiJson(`/api/admin/team/${m._id}/${action}`);
      reload();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Invite staff and manage their access."
        action={
          <button className="btn btn-primary" onClick={() => setShow((v) => !v)}>
            {show ? 'Close' : '+ Invite member'}
          </button>
        }
      />

      {show && (
        <div className="mb-6">
          <InviteForm
            onInvited={() => {
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
        ) : !data || data.users.length === 0 ? (
          <EmptyState>No team members yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.users.map((m) => (
                  <tr key={m._id}>
                    <td className="px-5 py-3 font-medium">
                      {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.username || '—'}
                    </td>
                    <td className="px-5 py-3 text-subtle">{m.email || '—'}</td>
                    <td className="px-5 py-3 capitalize text-subtle">{(m.role || '').replace('_', ' ')}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => toggle(m)} className="text-sm font-semibold hover:text-primary-hover">
                        {(m.status || '').toLowerCase() === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
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

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: 'cashier' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Reuse the existing Express invite route (sends the invitation email).
      const res = await fetch('/business-users/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
      });
      if (!res.ok && res.status >= 400) throw new Error('Could not send invite');
      onInvited();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <Panel title="Invite team member">
      <form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink/80">First name</span>
          <input value={form.firstName} onChange={f('firstName')} required className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink/80">Last name</span>
          <input value={form.lastName} onChange={f('lastName')} required className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink/80">Email</span>
          <input type="email" value={form.email} onChange={f('email')} required className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink/80">Role</span>
          <select value={form.role} onChange={f('role')} className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary">
            <option value="cashier">Cashier</option>
            <option value="stock_clerk">Stock clerk</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <button disabled={busy} className="btn btn-primary">
            {busy ? 'Sending…' : 'Send invitation'}
          </button>
          <p className="mt-2 text-xs text-subtle">An invitation email with setup instructions will be sent.</p>
        </div>
      </form>
    </Panel>
  );
}
