'use client';

import { useMemo, useState } from 'react';
import { useApi, apiJson } from '@/lib/client-api';
import { formatCurrency } from '@/lib/format';
import { PageHeader, Panel, EmptyState, StatusBadge } from '@/components/dashboard/ui';

interface Txn {
  _id: string;
  customerName: string | null;
  items: { itemName?: string; quantity?: number }[];
  totalAmount: number;
  paymentMethod: string | null;
  paymentStatus: string | null;
  source: string | null;
  date: string | null;
  outletName: string | null;
}
interface TxnResp {
  currency: string;
  transactions: Txn[];
}

export default function TransactionsPage() {
  const [search, setSearch] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [applied, setApplied] = useState('');

  const path = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set('search', search.trim());
    if (start && end) {
      p.set('startDate', start);
      p.set('endDate', end);
    }
    return `/api/admin/transactions${p.toString() ? `?${p}` : ''}`;
  }, [applied]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, loading, error, reload } = useApi<TxnResp>(path);
  const currency = data?.currency || '₦';

  async function markPaid(id: string) {
    try {
      await apiJson(`/api/admin/transactions/${id}/mark-paid`);
      reload();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Transactions" subtitle="All sales across your store and outlets." />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <input
          placeholder="Search customer or item…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1 rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-xl border border-line px-3 py-2.5 text-sm" />
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-xl border border-line px-3 py-2.5 text-sm" />
        <button className="btn btn-dark" onClick={() => setApplied(`${search}|${start}|${end}`)}>
          Filter
        </button>
      </div>

      <Panel>
        {loading ? (
          <EmptyState>Loading…</EmptyState>
        ) : error ? (
          <EmptyState>{error}</EmptyState>
        ) : !data || data.transactions.length === 0 ? (
          <EmptyState>No transactions found.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Items</th>
                  <th className="px-5 py-3 font-semibold">Source</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.transactions.map((t) => (
                  <tr key={t._id}>
                    <td className="whitespace-nowrap px-5 py-3 text-subtle">
                      {t.date ? new Date(t.date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3 font-medium">{t.customerName || '—'}</td>
                    <td className="px-5 py-3 text-subtle">
                      {t.items?.length ? `${t.items.length} item${t.items.length > 1 ? 's' : ''}` : '—'}
                    </td>
                    <td className="px-5 py-3 capitalize text-subtle">{t.outletName || t.source || '—'}</td>
                    <td className="px-5 py-3 font-semibold">{formatCurrency(t.totalAmount, currency)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={t.paymentStatus} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {(t.paymentStatus || '').toLowerCase() === 'pending' && (
                        <button onClick={() => markPaid(t._id)} className="text-sm font-semibold text-primary-hover hover:underline">
                          Mark paid
                        </button>
                      )}
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
