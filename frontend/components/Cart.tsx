'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { formatCurrency } from '@/lib/format';
import type { CartItem } from '@/lib/types';

export function AddToCart({ item, currency = '₦' }: { item: Omit<CartItem, 'quantity'>; currency?: string }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  if (item.stock <= 0) {
    return (
      <button disabled className="btn btn-outline w-full cursor-not-allowed opacity-60">
        Out of stock
      </button>
    );
  }

  return (
    <button
      className="btn btn-dark w-full"
      onClick={() => {
        add(item, 1);
        setAdded(true);
        setTimeout(() => setAdded(false), 1200);
      }}
    >
      {added ? 'Added ✓' : 'Add to cart'}
    </button>
  );
}

export function CartButton({ storeUsername, currency = '₦' }: { storeUsername: string; currency?: string }) {
  const { items, count, total, setQuantity, remove } = useCart();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold transition-colors hover:border-ink"
      >
        <span>🛒 Cart</span>
        {count > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-ink">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-lg font-bold">Your cart</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-2xl leading-none text-subtle">
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {items.length === 0 ? (
                <p className="py-16 text-center text-subtle">Your cart is empty.</p>
              ) : (
                <ul className="space-y-4">
                  {items.map((i) => (
                    <li key={i.id} className="flex gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {i.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={i.image} alt={i.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xl text-subtle">📦</div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col">
                        <span className="line-clamp-1 text-sm font-semibold">{i.name}</span>
                        <span className="text-sm text-subtle">{formatCurrency(i.cost, currency)}</span>
                        <div className="mt-auto flex items-center gap-2">
                          <div className="flex items-center rounded-lg border border-line">
                            <button className="px-2 py-1 text-sm" onClick={() => setQuantity(i.id, i.quantity - 1)}>
                              −
                            </button>
                            <span className="w-8 text-center text-sm">{i.quantity}</span>
                            <button className="px-2 py-1 text-sm" onClick={() => setQuantity(i.id, i.quantity + 1)}>
                              +
                            </button>
                          </div>
                          <button className="text-xs text-subtle underline" onClick={() => remove(i.id)}>
                            Remove
                          </button>
                        </div>
                      </div>
                      <span className="text-sm font-bold">{formatCurrency(i.cost * i.quantity, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-line px-6 py-4">
              <div className="mb-4 flex items-center justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatCurrency(total, currency)}</span>
              </div>
              <Link
                href={`/store/${storeUsername}/checkout`}
                onClick={() => setOpen(false)}
                className={`btn btn-primary w-full ${items.length === 0 ? 'pointer-events-none opacity-50' : ''}`}
              >
                Checkout
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
