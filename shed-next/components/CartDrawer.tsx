'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useCart } from '@/lib/cart';
import { formatCurrency } from '@/lib/format';
import { Icon } from './Icon';
import { Img } from './Img';
import { QtyStepper } from './AddToCart';

export function CartDrawer() {
  const { drawerOpen, closeDrawer, byStore, count, setQuantity, remove } = useCart();
  const pathname = usePathname();

  // Close on navigation + Escape; lock page scroll while open.
  useEffect(() => closeDrawer(), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDrawer();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen, closeDrawer]);

  if (!drawerOpen) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Shopping cart">
      <div className="absolute inset-0 bg-ink/40 animate-fade-up" onClick={closeDrawer} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-surface shadow-drawer animate-slide-in">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">
            Your cart {count > 0 && <span className="font-normal text-subtle">({count})</span>}
          </h2>
          <button onClick={closeDrawer} aria-label="Close cart" className="btn btn-ghost h-10 w-10 min-h-0 rounded-full px-0">
            <Icon name="close" />
          </button>
        </header>

        {byStore.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-canvas text-subtle">
              <Icon name="cart" size={28} />
            </span>
            <p className="mt-4 font-semibold">Your cart is empty</p>
            <p className="mt-1 text-sm text-subtle">Browse stores and add items you love.</p>
            <Link href="/search" onClick={closeDrawer} className="btn btn-dark mt-6">
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {byStore.length > 1 && (
              <p className="flex items-start gap-2 bg-brand-soft px-5 py-3 text-xs text-brand-dark">
                <Icon name="info" size={16} className="mt-px shrink-0" />
                Your cart has items from {byStore.length} stores. Each store is checked out separately.
              </p>
            )}
            {byStore.map((g) => (
              <section key={g.storeUsername} className="border-b border-line px-5 py-4 last:border-b-0">
                <Link href={`/store/${g.storeUsername}`} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold hover:underline">
                  <Icon name="store" size={16} /> {g.storeName}
                </Link>
                <ul className="space-y-4">
                  {g.items.map((i) => (
                    <li key={i.id} className="flex gap-3">
                      <Link href={`/store/${i.storeUsername}/products/${i.id}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line">
                        <Img src={i.image} alt={i.name} />
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <span className="line-clamp-2 text-sm font-medium">{i.name}</span>
                          <button onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`} className="shrink-0 p-1 text-subtle hover:text-danger">
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                        <span className="text-xs text-subtle">{formatCurrency(i.cost, i.currency)} each</span>
                        <div className="mt-auto flex items-center justify-between pt-2">
                          <QtyStepper size="sm" value={i.quantity} max={i.stock} onChange={(n) => setQuantity(i.id, n)} />
                          <span className="text-sm font-bold">{formatCurrency(i.cost * i.quantity, i.currency)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-subtle">Subtotal</span>
                  <span className="text-base font-bold">{formatCurrency(g.subtotal, g.currency)}</span>
                </div>
                <Link href={`/store/${g.storeUsername}/checkout`} className="btn btn-brand mt-3 w-full">
                  <Icon name="lock" size={16} />
                  {byStore.length > 1 ? `Checkout ${g.storeName}` : 'Checkout'}
                </Link>
              </section>
            ))}
          </div>
        )}

        {byStore.length > 0 && (
          <footer className="border-t border-line px-5 py-3 text-center text-xs text-subtle">
            <button onClick={closeDrawer} className="font-medium text-ink hover:underline">
              Continue shopping
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

export function CartToast() {
  const { toast, openDrawer, drawerOpen } = useCart();
  if (!toast || drawerOpen) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 md:bottom-6 md:justify-end md:px-6">
      <div key={toast.id} role="status" className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-ink p-3 pr-4 text-white shadow-lift animate-toast-in">
        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white/10">
          <Img src={toast.image} alt="" />
        </span>
        <span className="flex-1 text-sm">
          <span className="flex items-center gap-1 font-semibold text-brand">
            <Icon name="check" size={14} strokeWidth={2.5} /> Added
          </span>
          <span className="line-clamp-1 text-white/80">{toast.message.replace(/ added to cart$/, '')}</span>
        </span>
        <button onClick={openDrawer} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink hover:bg-brand">
          View cart
        </button>
      </div>
    </div>
  );
}
