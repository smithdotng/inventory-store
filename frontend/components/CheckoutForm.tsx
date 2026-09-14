'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { checkout } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import type { Store } from '@/lib/types';

export function CheckoutForm({ store }: { store: Store }) {
  const router = useRouter();
  const { items, total, clear } = useCart();
  const currency = store.currency || '₦';

  const [form, setForm] = useState({ customerName: '', phoneNumber: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { saleId, token } = await checkout(store.username, {
        ...form,
        cartItems: items.map((i) => ({ id: i.id, name: i.name, cost: i.cost, quantity: i.quantity })),
      });
      clear();
      router.push(`/store/${store.username}/order/${saleId}?token=${token}`);
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line py-20 text-center">
        <p className="text-subtle">Your cart is empty.</p>
        <Link href={`/store/${store.username}`} className="btn btn-dark mt-6">
          Back to store
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <form onSubmit={onSubmit} className="order-2 lg:order-1">
        <h2 className="text-xl font-bold">Your details</h2>
        <div className="mt-6 space-y-4">
          <Field label="Full name" value={form.customerName} onChange={update('customerName')} required />
          <Field
            label="Phone number"
            value={form.phoneNumber}
            onChange={update('phoneNumber')}
            type="tel"
            required
          />
          <Field label="Email" value={form.email} onChange={update('email')} type="email" required />
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn btn-primary mt-6 w-full">
          {submitting ? 'Placing order…' : `Place order · ${formatCurrency(total, currency)}`}
        </button>
        {store.paymentInstructions && (
          <p className="mt-4 text-xs text-subtle">
            Payment: {store.paymentInstructions}
          </p>
        )}
      </form>

      <aside className="order-1 h-fit rounded-card border border-line bg-muted p-6 lg:order-2">
        <h3 className="font-bold">Order summary</h3>
        <ul className="mt-4 space-y-3">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 text-sm">
              <span className="text-ink/80">
                {i.name} <span className="text-subtle">× {i.quantity}</span>
              </span>
              <span className="font-medium">{formatCurrency(i.cost * i.quantity, currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-line pt-4 text-base font-bold">
          <span>Total</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink/80">{label}</span>
      <input
        {...rest}
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
      />
    </label>
  );
}
