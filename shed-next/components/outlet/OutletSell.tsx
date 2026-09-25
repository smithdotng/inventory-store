'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { outletSaleAction } from '@/lib/actions/public';
import { formatCurrency } from '@/lib/format';
import { QtyStepper } from '../AddToCart';

type I = { id: string; name: string; cost: number; stock: number };

export function OutletSell({ items, currency }: { items: I[]; currency: string }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [cust, setCust] = useState({ name: '', phone: '', email: '' });
  const [method, setMethod] = useState('Cash');
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const total = items.reduce((n, i) => n + (qty[i.id] || 0) * i.cost, 0);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const submit = () =>
    start(async () => {
      const r = await outletSaleAction({ lines: Object.entries(qty).filter(([, q]) => q > 0).map(([itemId, quantity]) => ({ itemId, quantity })), customer: cust, paymentMethod: method });
      if (r.error) return setMsg({ error: r.error });
      setMsg({ ok: `Sale of ${formatCurrency(total, currency)} recorded.` });
      setQty({});
      setCust({ name: '', phone: '', email: '' });
      router.refresh();
    });
  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className="card overflow-hidden">
        <h1 className="border-b border-line px-5 py-4 text-lg font-bold">New sale</h1>
        {items.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-subtle">No stock available to sell.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{i.name}</span><span className="text-xs text-subtle">{formatCurrency(i.cost, currency)} · {i.stock} left</span></span>
                {qty[i.id] ? (
                  <QtyStepper size="sm" value={qty[i.id]} max={i.stock} onChange={(n) => setQty({ ...qty, [i.id]: Math.max(0, n) })} />
                ) : (
                  <button onClick={() => setQty({ ...qty, [i.id]: 1 })} className="btn btn-outline h-9 min-h-0 px-4 text-sm">Add</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside className="card h-fit space-y-3 p-5">
        {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.error ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>{msg.error || msg.ok}</p>}
        <input className="input" placeholder="Customer name (optional)" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="Phone" inputMode="tel" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} />
          <input className="input" placeholder="Email" type="email" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} />
        </div>
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
          {['Cash', 'Bank Transfer', 'POS', 'Mobile Payment'].map((m) => <option key={m}>{m}</option>)}
        </select>
        <p className="flex justify-between pt-2 text-lg font-extrabold"><span>Total</span><span>{formatCurrency(total, currency)}</span></p>
        <button onClick={submit} disabled={!count || pending} className="btn btn-brand btn-lg w-full">{pending ? 'Recording…' : `Record sale (${count})`}</button>
      </aside>
    </div>
  );
}
