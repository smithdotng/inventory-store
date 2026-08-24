'use client';

import { useState } from 'react';
import { useApi, apiJson } from '@/lib/client-api';
import { formatCurrency } from '@/lib/format';
import { PageHeader, Panel, EmptyState, StatusBadge } from '@/components/dashboard/ui';

interface Invoice {
  _id: string;
  customerName: string | null;
  items: { itemName?: string; quantity?: number }[];
  totalAmount: number;
  paymentStatus: string | null;
  date: string | null;
}
interface InvoicesResp {
  currency: string;
  invoices: Invoice[];
  customers: { _id: string; name: string }[];
  inventory: { _id: string; name: string; cost: number; stock: number }[];
}

export default function InvoicesPage() {
  const { data, loading, error, reload } = useApi<InvoicesResp>('/api/admin/invoices');
  const [show, setShow] = useState(false);
  const currency = data?.currency || '₦';

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Record sales and track payment status."
        action={
          <button className="btn btn-primary" onClick={() => setShow((v) => !v)} disabled={!data}>
            {show ? 'Close' : '+ New invoice'}
          </button>
        }
      />

      {show && data && (
        <div className="mb-6">
          <NewInvoiceForm
            customers={data.customers}
            inventory={data.inventory}
            currency={currency}
            onCreated={() => {
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
        ) : !data || data.invoices.length === 0 ? (
          <EmptyState>No invoices yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Items</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.invoices.map((inv) => (
                  <tr key={inv._id}>
                    <td className="whitespace-nowrap px-5 py-3 text-subtle">
                      {inv.date ? new Date(inv.date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3 font-medium">{inv.customerName || '—'}</td>
                    <td className="px-5 py-3 text-subtle">{inv.items?.length || 0}</td>
                    <td className="px-5 py-3 font-semibold">{formatCurrency(inv.totalAmount, currency)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={inv.paymentStatus} />
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

function NewInvoiceForm({
  customers,
  inventory,
  currency,
  onCreated,
}: {
  customers: { _id: string; name: string }[];
  inventory: { _id: string; name: string; cost: number; stock: number }[];
  currency: string;
  onCreated: () => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<{ itemId: string; quantity: string }[]>([{ itemId: '', quantity: '1' }]);
  const [paymentStatus, setPaymentStatus] = useState('Paid');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = lines.reduce((sum, l) => {
    const item = inventory.find((i) => i._id === l.itemId);
    return sum + (item ? Number(item.cost) * (parseInt(l.quantity, 10) || 0) : 0);
  }, 0);

  function updateLine(idx: number, key: 'itemId' | 'quantity', value: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiJson('/api/admin/invoices', 'POST', {
        customerId: customerId || undefined,
        items: lines.filter((l) => l.itemId && parseInt(l.quantity, 10) > 0),
        paymentStatus,
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Panel title="New invoice">
      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink/80">Customer</span>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Walk-in customer</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink/80">Payment status</span>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-primary"
            >
              <option>Paid</option>
              <option>Pending</option>
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium text-ink/80">Items</span>
          {lines.map((l, idx) => (
            <div key={idx} className="flex gap-2">
              <select
                value={l.itemId}
                onChange={(e) => updateLine(idx, 'itemId', e.target.value)}
                className="flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Select item…</option>
                {inventory.map((i) => (
                  <option key={i._id} value={i._id}>
                    {i.name} ({i.stock} in stock)
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={l.quantity}
                onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                className="w-24 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                  className="px-2 text-subtle"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLines((ls) => [...ls, { itemId: '', quantity: '1' }])}
            className="text-sm font-semibold text-primary-hover hover:underline"
          >
            + Add line
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <span className="text-lg font-bold">Total: {formatCurrency(total, currency)}</span>
          <button disabled={busy} className="btn btn-primary">
            {busy ? 'Saving…' : 'Create invoice'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Panel>
  );
}
