'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { cn, formatCurrency } from '@/lib/format';
import type { CartItem } from '@/lib/types';
import { Icon } from './Icon';

type NewItem = Omit<CartItem, 'quantity'>;

/** Compact "+" button used on product cards. */
export function QuickAdd({ item }: { item: NewItem }) {
  const { add } = useCart();
  const [done, setDone] = useState(false);
  if (item.stock <= 0) return null;
  return (
    <button
      type="button"
      aria-label={`Add ${item.name} to cart`}
      onClick={() => {
        add(item, 1);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors',
        done ? 'border-success bg-success text-white' : 'border-line bg-surface text-ink hover:border-ink hover:bg-ink hover:text-white',
      )}
    >
      <Icon name={done ? 'check' : 'plus'} size={18} strokeWidth={2} />
    </button>
  );
}

export function QtyStepper({ value, max, onChange, size = 'md' }: { value: number; max: number; onChange: (n: number) => void; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? 'h-9' : 'h-12';
  const w = size === 'sm' ? 'w-9' : 'w-12';
  return (
    <div className={cn('inline-flex items-center rounded-xl border border-line bg-surface', h)}>
      <button type="button" aria-label="Decrease quantity" disabled={value <= 1} onClick={() => onChange(value - 1)} className={cn('flex h-full items-center justify-center text-ink disabled:text-line', w)}>
        <Icon name="minus" size={16} strokeWidth={2} />
      </button>
      <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" aria-label="Increase quantity" disabled={max > 0 && value >= max} onClick={() => onChange(value + 1)} className={cn('flex h-full items-center justify-center text-ink disabled:text-line', w)}>
        <Icon name="plus" size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

/** Product page buy box: quantity, Add to cart, Buy now + sticky mobile bar. */
export function BuyBox({ item }: { item: NewItem }) {
  const { add, openDrawer } = useCart();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const soldOut = item.stock <= 0;

  const addToCart = () => add(item, qty);
  const buyNow = () => {
    add(item, qty);
    router.push(`/store/${item.storeUsername}/checkout`);
  };

  if (soldOut) {
    return (
      <div className="rounded-xl bg-canvas p-4 text-sm text-subtle">
        This item is currently sold out. Check back soon or message the seller.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <QtyStepper value={qty} max={item.stock} onChange={setQty} />
          <span className="text-sm text-subtle">Total: <strong className="text-ink">{formatCurrency(item.cost * qty, item.currency)}</strong></span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={addToCart} className="btn btn-outline btn-lg">
            <Icon name="cart" size={18} /> Add to cart
          </button>
          <button type="button" onClick={buyNow} className="btn btn-brand btn-lg">
            Buy now
          </button>
        </div>
        <button type="button" onClick={openDrawer} className="text-sm font-medium text-subtle underline-offset-4 hover:text-ink hover:underline">
          View cart
        </button>
      </div>

      {/* Sticky bar on phones so the primary action is always reachable */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur md:hidden">
        <div className="mb-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-subtle">{item.name}</p>
            <p className="text-base font-bold">{formatCurrency(item.cost * qty, item.currency)}</p>
          </div>
          <button type="button" onClick={addToCart} aria-label="Add to cart" className="btn btn-outline h-12 w-12 px-0">
            <Icon name="cart" size={20} />
          </button>
          <button type="button" onClick={buyNow} className="btn btn-brand h-12 px-6">
            Buy now
          </button>
        </div>
      </div>
    </>
  );
}
