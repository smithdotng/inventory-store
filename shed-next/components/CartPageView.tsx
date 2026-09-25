'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { formatCurrency } from '@/lib/format';
import { Img } from './Img';
import { Icon } from './Icon';
import { QtyStepper } from './AddToCart';

export function CartPageView() {
  const { byStore, hydrated, setQuantity, remove } = useCart();
  if (!hydrated) return <div className="card mt-6 h-60 animate-pulse" />;
  if (!byStore.length)
    return (
      <div className="card mt-6 px-6 py-16 text-center">
        <p className="font-semibold">Your cart is empty</p>
        <Link href="/search" className="btn btn-dark mt-5">Start shopping</Link>
      </div>
    );
  return (
    <div className="mt-6 space-y-6">
      {byStore.length > 1 && <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-dark">Your cart has items from {byStore.length} stores. Each store is checked out separately.</p>}
      {byStore.map((g) => (
        <section key={g.storeUsername} className="card overflow-hidden">
          <header className="flex items-center justify-between border-b border-line px-5 py-4">
            <Link href={`/store/${g.storeUsername}`} className="flex items-center gap-2 font-semibold hover:underline"><Icon name="store" size={16} /> {g.storeName}</Link>
            <span className="text-sm text-subtle">{g.count} item{g.count === 1 ? '' : 's'}</span>
          </header>
          <ul className="divide-y divide-line">
            {g.items.map((i) => (
              <li key={i.id} className="flex items-center gap-4 px-5 py-4">
                <Link href={`/store/${i.storeUsername}/products/${i.id}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line"><Img src={i.image} alt={i.name} /></Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.name}</p>
                  <p className="text-sm text-subtle">{formatCurrency(i.cost, i.currency)} each</p>
                  <div className="mt-2 flex items-center gap-3">
                    <QtyStepper size="sm" value={i.quantity} max={i.stock} onChange={(n) => setQuantity(i.id, n)} />
                    <button onClick={() => remove(i.id)} className="text-sm text-subtle hover:text-danger">Remove</button>
                  </div>
                </div>
                <p className="font-bold">{formatCurrency(i.cost * i.quantity, i.currency)}</p>
              </li>
            ))}
          </ul>
          <footer className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-lg font-extrabold">Subtotal {formatCurrency(g.subtotal, g.currency)}</p>
            <Link href={`/store/${g.storeUsername}/checkout`} className="btn btn-brand"><Icon name="lock" size={16} /> Checkout {g.storeName}</Link>
          </footer>
        </section>
      ))}
    </div>
  );
}
