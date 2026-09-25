'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createInvoiceAction } from '@/lib/actions/seller';
import { formatCurrency } from '@/lib/format';
import { Icon } from '../Icon';

type P = { _id: string; name: string; cost: number; stock: number; isVatable?: boolean };
type C = { _id: string; name: string; phone?: string; email?: string };
type Line = { key: number; itemId: string; quantity: number; isNew: boolean; name: string; cost: string; stock: string };

let k = 1;
const blank = (): Line => ({ key: k++, itemId: '', quantity: 1, isNew: false, name: '', cost: '', stock: '' });

export function InvoiceBuilder({ products, customers, currency, vat, defaultBank, initialCustomer }: { products: P[]; customers: C[]; currency: string; vat: number; defaultBank: { bankName: string; bankAccountName: string; accountNumber: string }; initialCustomer: string }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(initialCustomer || (customers.length ? '' : 'new'));
  const [nc, setNc] = useState({ name: '', phone: '', email: '' });
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [method, setMethod] = useState('Bank Transfer');
  const [bank, setBank] = useState(defaultBank);
  const [notes, setNotes] = useState('');
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);

  const priced = lines.map((l) => {
    const p = byId.get(l.itemId);
    const cost = l.isNew ? Number(l.cost) || 0 : p?.cost || 0;
    const vatable = l.isNew ? vat > 0 : !!p?.isVatable;
    const sub = cost * (l.quantity || 0);
    return { ...l, cost, sub, vat: vatable ? (sub * vat) / 100 : 0, max: l.isNew ? Number(l.stock) || 0 : p?.stock ?? 0 };
  });
  const subtotal = priced.reduce((n, l) => n + l.sub, 0);
  const vatTotal = priced.reduce((n, l) => n + l.vat, 0);
  const update = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await createInvoiceAction({
        customer: customerId && customerId !== 'new' ? { customerId } : nc,
        lines: lines.filter((l) => l.isNew ? l.name.trim() : l.itemId).map((l) => (l.isNew ? { quantity: l.quantity, newProduct: { name: l.name, cost: Number(l.cost), stock: Number(l.stock) } } : { itemId: l.itemId, quantity: l.quantity })),
        paymentMethod: method,
        bankDetails: method === 'Bank Transfer' ? bank : null,
        additionalComments: notes,
        paid,
      });
      if (r.error || !r.id) return setError(r.error || 'Could not create the invoice.');
      router.push(`/dashboard/sales/${r.id}`);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        <section className="card p-5">
          <h2 className="mb-4 font-bold">Bill to</h2>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input" aria-label="Customer">
            <option value="">Select a customer…</option>
            <option value="new">+ New customer</option>
            {customers.map((c) => <option key={c._id} value={c._id}>{c.name}{c.phone && c.phone !== 'N/A' ? ` · ${c.phone}` : ''}</option>)}
          </select>
          {customerId === 'new' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <input className="input" placeholder="Full name" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
              <input className="input" placeholder="Phone" inputMode="tel" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
              <input className="input" placeholder="Email" type="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-bold">Items</h2>
          <div className="space-y-3">
            {priced.map((l) => (
              <div key={l.key} className="rounded-xl border border-line p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_100px_auto]">
                  {l.isNew ? (
                    <input className="input" placeholder="New product name" value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} />
                  ) : (
                    <select className="input" value={l.itemId} onChange={(e) => (e.target.value === '__new' ? update(l.key, { isNew: true, itemId: '' }) : update(l.key, { itemId: e.target.value }))} aria-label="Product">
                      <option value="">Choose a product…</option>
                      {products.map((p) => <option key={p._id} value={p._id} disabled={p.stock <= 0}>{p.name} — {formatCurrency(p.cost, currency)} ({p.stock} in stock)</option>)}
                      <option value="__new">+ Add a new product</option>
                    </select>
                  )}
                  <input className="input" type="number" min={1} max={l.max || undefined} value={l.quantity} onChange={(e) => update(l.key, { quantity: Math.max(1, parseInt(e.target.value || '1', 10)) })} aria-label="Quantity" />
                  <button type="button" onClick={() => setLines(lines.length > 1 ? lines.filter((x) => x.key !== l.key) : [blank()])} className="btn btn-ghost h-11 min-h-0 px-3" aria-label="Remove item"><Icon name="trash" size={16} /></button>
                </div>
                {l.isNew && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input className="input" type="number" min={0} placeholder={`Price (${currency})`} value={l.cost || ''} onChange={(e) => update(l.key, { cost: e.target.value })} />
                    <input className="input" type="number" min={0} placeholder="Opening stock" value={lines.find((x) => x.key === l.key)!.stock} onChange={(e) => update(l.key, { stock: e.target.value })} />
                  </div>
                )}
                <div className="mt-2 flex justify-between text-xs text-subtle">
                  <span>{l.quantity > l.max && (l.itemId || l.isNew) ? <span className="text-danger">Only {l.max} available</span> : l.cost ? `${formatCurrency(l.cost, currency)} each` : ''}</span>
                  <span className="font-semibold text-ink">{formatCurrency(l.sub + l.vat, currency)}</span>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLines([...lines, blank()])} className="mt-3 text-sm font-semibold hover:underline">+ Add another item</button>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-bold">Payment</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {['Bank Transfer', 'Cash', 'POS', 'Mobile Payment'].map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${method === m ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}>{m}</button>
            ))}
          </div>
          {method === 'Bank Transfer' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <input className="input" placeholder="Bank name" value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} />
              <input className="input" placeholder="Account name" value={bank.bankAccountName} onChange={(e) => setBank({ ...bank, bankAccountName: e.target.value })} />
              <input className="input" placeholder="Account number" inputMode="numeric" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} />
            </div>
          )}
          <label className="mt-4 block text-sm font-medium">Notes for the customer <span className="font-normal text-subtle">(optional)</span>
            <textarea className="input mt-1.5 min-h-[80px]" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Delivery by Friday. Thank you for your business!" />
          </label>
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <section className="card p-5">
          <h2 className="font-bold">Summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-subtle">Subtotal</dt><dd className="tabular-nums">{formatCurrency(subtotal, currency)}</dd></div>
            {vatTotal > 0 && <div className="flex justify-between"><dt className="text-subtle">VAT ({vat}%)</dt><dd className="tabular-nums">{formatCurrency(vatTotal, currency)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-3 text-xl font-extrabold"><dt>Total</dt><dd className="tabular-nums">{formatCurrency(subtotal + vatTotal, currency)}</dd></div>
          </dl>
          <label className="mt-4 flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-ink" /> Already paid (issue a receipt)
          </label>
          {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <button onClick={submit} disabled={pending} className="btn btn-brand btn-lg mt-4 w-full">{pending ? 'Creating…' : paid ? 'Create receipt' : 'Create invoice'}</button>
          <p className="mt-3 text-center text-xs text-subtle">You can email, download or WhatsApp it next.</p>
        </section>
      </aside>
    </div>
  );
}
