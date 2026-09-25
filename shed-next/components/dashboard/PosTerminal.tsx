'use client';

import { useMemo, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { cn, formatCurrency, realImage } from '@/lib/format';
import { emailReceiptAction, posSaleAction, type ActionResult } from '@/lib/actions/seller';
import { Icon } from '../Icon';
import { Img } from '../Img';
import { QtyStepper } from '../AddToCart';
import { SubmitButton } from '../forms';

type P = { _id: string; name: string; cost: number; stock: number; images?: string[]; isVatable?: boolean };
type C = { _id: string; name: string; phone?: string; email?: string };
const METHODS = [
  { value: 'Cash', icon: 'receipt' },
  { value: 'Bank Transfer', icon: 'globe' },
  { value: 'POS', icon: 'lock' },
  { value: 'Mobile Payment', icon: 'phone' },
];

export function PosTerminal({ products, customers, currency, vat }: { products: P[]; customers: C[]; currency: string; vat: number }) {
  const [stock, setStock] = useState<Record<string, number>>(() => Object.fromEntries(products.map((p) => [p._id, p.stock])));
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState({ customerId: '', name: '', phone: '', email: '' });
  const [method, setMethod] = useState('Cash');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; total: number; email: string } | null>(null);
  const [showCart, setShowCart] = useState(false);

  const byId = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => !t || p.name.toLowerCase().includes(t));
  }, [products, q]);
  const lines = Object.entries(cart).map(([id, qty]) => ({ p: byId.get(id)!, qty })).filter((l) => l.p);
  const subtotal = lines.reduce((n, l) => n + l.p.cost * l.qty, 0);
  const vatAmount = lines.reduce((n, l) => n + (l.p.isVatable ? (l.p.cost * l.qty * vat) / 100 : 0), 0);
  const total = subtotal + vatAmount;
  const count = lines.reduce((n, l) => n + l.qty, 0);

  const add = (p: P) => {
    const have = cart[p._id] || 0;
    if (have >= (stock[p._id] ?? 0)) return;
    setCart({ ...cart, [p._id]: have + 1 });
  };
  const setQty = (id: string, qty: number) => {
    const next = { ...cart };
    if (qty <= 0) delete next[id];
    else next[id] = Math.min(qty, stock[id] ?? qty);
    setCart(next);
  };

  const charge = () => {
    setError(null);
    start(async () => {
      const r = await posSaleAction({
        lines: lines.map((l) => ({ itemId: l.p._id, quantity: l.qty })),
        customer: customer.customerId ? { customerId: customer.customerId } : { name: customer.name, phone: customer.phone, email: customer.email },
        paymentMethod: method,
      });
      if (r.error || !r.id) return setError(r.error || 'Could not record the sale.');
      setStock((s) => {
        const n = { ...s };
        lines.forEach((l) => (n[l.p._id] = (n[l.p._id] ?? 0) - l.qty));
        return n;
      });
      const email = customer.customerId ? customers.find((c) => c._id === customer.customerId)?.email || '' : customer.email;
      setDone({ id: r.id, total, email: email && email !== 'N/A' ? email : '' });
      setCart({});
      setCustomer({ customerId: '', name: '', phone: '', email: '' });
      setShowCart(false);
    });
  };

  if (done) return <SaleDone sale={done} currency={currency} onNew={() => setDone(null)} />;

  const cartPanel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-bold">Current sale {count > 0 && <span className="font-normal text-subtle">({count})</span>}</h2>
        {count > 0 && <button onClick={() => setCart({})} className="text-sm font-medium text-subtle hover:text-danger">Clear</button>}
        <button onClick={() => setShowCart(false)} className="btn btn-ghost h-9 w-9 min-h-0 px-0 lg:hidden" aria-label="Close"><Icon name="close" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-subtle">Tap products to add them to the sale.</p>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map(({ p, qty }) => (
              <li key={p._id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-subtle">{formatCurrency(p.cost, currency)} each</p>
                </div>
                <QtyStepper size="sm" value={qty} max={stock[p._id] ?? 0} onChange={(v) => setQty(p._id, v)} />
                <button onClick={() => setQty(p._id, 0)} aria-label={`Remove ${p.name}`} className="p-1 text-subtle hover:text-danger"><Icon name="trash" size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-4 border-t border-line p-5">
        <details className="group rounded-xl border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
            <span className="flex items-center gap-2"><Icon name="user" size={16} /> {customer.customerId ? customers.find((c) => c._id === customer.customerId)?.name : customer.name || 'Customer (optional)'}</span>
            <Icon name="chevronDown" size={16} className="text-subtle transition group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-line p-3">
            {customers.length > 0 && (
              <select value={customer.customerId} onChange={(e) => setCustomer({ ...customer, customerId: e.target.value })} className="input py-2 text-sm">
                <option value="">New / walk-in customer</option>
                {customers.map((c) => <option key={c._id} value={c._id}>{c.name}{c.phone && c.phone !== 'N/A' ? ` · ${c.phone}` : ''}</option>)}
              </select>
            )}
            {!customer.customerId && (
              <>
                <input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Name" className="input py-2 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="Phone" inputMode="tel" className="input py-2 text-sm" />
                  <input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder="Email (for receipt)" type="email" className="input py-2 text-sm" />
                </div>
              </>
            )}
          </div>
        </details>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Payment method">
          {METHODS.map((m) => (
            <button key={m.value} type="button" role="radio" aria-checked={method === m.value} onClick={() => setMethod(m.value)} className={cn('flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-semibold', method === m.value ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink')}>
              <Icon name={m.icon} size={16} /> {m.value === 'Mobile Payment' ? 'Mobile' : m.value === 'Bank Transfer' ? 'Transfer' : m.value}
            </button>
          ))}
        </div>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-subtle">Subtotal</dt><dd className="tabular-nums">{formatCurrency(subtotal, currency)}</dd></div>
          {vatAmount > 0 && <div className="flex justify-between"><dt className="text-subtle">VAT ({vat}%)</dt><dd className="tabular-nums">{formatCurrency(vatAmount, currency)}</dd></div>}
          <div className="flex justify-between pt-1 text-lg font-extrabold"><dt>Total</dt><dd className="tabular-nums">{formatCurrency(total, currency)}</dd></div>
        </dl>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <button onClick={charge} disabled={!lines.length || pending} className="btn btn-brand btn-lg w-full">
          {pending ? 'Recording…' : `Charge ${formatCurrency(total, currency)}`}
        </button>
      </div>
    </div>
  );

  return (
    <div className="-mx-4 -my-6 grid min-h-[calc(100vh-4rem)] sm:-mx-6 lg:-mx-8 lg:-my-8 lg:grid-cols-[1fr_400px]">
      <section className="px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-extrabold">Point of sale</h1>
        </div>
        <label className="mb-4 flex h-12 items-center gap-2 rounded-xl border border-line bg-surface px-4 focus-within:border-ink">
          <Icon name="search" size={18} className="text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" autoFocus className="h-full w-full bg-transparent outline-none" />
        </label>
        {products.length === 0 ? (
          <p className="card px-6 py-16 text-center text-sm text-subtle">No products yet. Add products in Inventory to start selling.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-24 sm:grid-cols-3 xl:grid-cols-4 lg:pb-0">
            {list.map((p) => {
              const left = (stock[p._id] ?? 0) - (cart[p._id] || 0);
              const out = (stock[p._id] ?? 0) <= 0;
              return (
                <button key={p._id} type="button" onClick={() => add(p)} disabled={left <= 0} className={cn('card relative overflow-hidden text-left transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-50', !!cart[p._id] && 'ring-2 ring-brand')}>
                  <span className="block aspect-[4/3] bg-canvas"><Img src={realImage(p.images?.[0])} alt={p.name} /></span>
                  {cart[p._id] ? <span className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-brand px-2 text-sm font-bold text-ink">{cart[p._id]}</span> : null}
                  <span className="block p-3">
                    <span className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-5">{p.name}</span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="font-bold tabular-nums">{formatCurrency(p.cost, currency)}</span>
                      <span className={cn('text-xs', out ? 'text-danger' : left <= 5 ? 'text-brand-dark' : 'text-subtle')}>{out ? 'Out' : `${left} left`}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] border-l border-line bg-surface lg:block">{cartPanel}</aside>

      {/* Phones/tablets: summary bar + slide-up cart */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 lg:hidden">
        <button onClick={() => setShowCart(true)} disabled={!count} className="btn btn-brand btn-lg w-full justify-between">
          <span>{count} item{count === 1 ? '' : 's'}</span>
          <span>Review · {formatCurrency(total, currency)}</span>
        </button>
      </div>
      {showCart && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setShowCart(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-hidden rounded-t-2xl bg-surface">{cartPanel}</div>
        </div>
      )}
    </div>
  );
}

function SaleDone({ sale, currency, onNew }: { sale: { id: string; total: number; email: string }; currency: string; onNew: () => void }) {
  const [state, action] = useFormState<ActionResult, FormData>(emailReceiptAction, {});
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-white"><Icon name="check" size={32} strokeWidth={2.5} /></span>
      <h1 className="mt-5 text-2xl font-extrabold">Sale recorded</h1>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{formatCurrency(sale.total, currency)}</p>
      <div className="mt-8 grid grid-cols-2 gap-3">
        <a href={`/dashboard/sales/${sale.id}/pdf`} target="_blank" rel="noreferrer" className="btn btn-outline"><Icon name="receipt" size={16} /> View receipt</a>
        <a href={`/dashboard/sales/${sale.id}/pdf?download=1`} className="btn btn-outline"><Icon name="arrowRight" size={16} className="rotate-90" /> Download</a>
      </div>
      <form action={action} className="card mt-4 space-y-3 p-4 text-left">
        <input type="hidden" name="id" value={sale.id} />
        <label className="block text-sm font-medium">Email the receipt</label>
        <div className="flex gap-2">
          <input name="email" type="email" required defaultValue={sale.email} placeholder="customer@email.com" className="input py-2" />
          <SubmitButton fullWidth={false} className="min-h-[44px] px-4 text-sm" pendingText="Sending">Send</SubmitButton>
        </div>
        {state.ok && <p className="text-sm text-success">{state.ok}</p>}
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
      </form>
      <button onClick={onNew} className="btn btn-brand btn-lg mt-6 w-full">Start a new sale</button>
    </div>
  );
}
