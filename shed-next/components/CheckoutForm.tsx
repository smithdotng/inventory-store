'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { checkout } from '@/lib/api';
import { useCart, useStoreCart } from '@/lib/cart';
import { cn, formatCurrency } from '@/lib/format';
import type { Store } from '@/lib/types';
import { Icon } from './Icon';
import { Img } from './Img';
import { QtyStepper } from './AddToCart';

const DETAILS_KEY = 'shed-checkout-details';
type Form = { customerName: string; phoneNumber: string; email: string };
type Errors = Partial<Record<keyof Form, string>>;

function validate(f: Form): Errors {
  const e: Errors = {};
  if (f.customerName.trim().length < 2) e.customerName = 'Please enter your full name';
  if (f.phoneNumber.replace(/\D/g, '').length < 7) e.phoneNumber = 'Enter a valid phone number';
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email — your invoice is sent here';
  return e;
}

export function CheckoutForm({ store, liveStock }: { store: Store; liveStock: Record<string, number> }) {
  const router = useRouter();
  const { hydrated, setQuantity, remove, clearStore } = useCart();
  const group = useStoreCart(store.username);
  const items = group?.items || [];
  const currency = store.currency || group?.currency || '₦';

  const [form, setForm] = useState<Form>({ customerName: '', phoneNumber: '', email: '' });
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pay, setPay] = useState<'direct' | 'online'>('direct');
  const [me, setMe] = useState<{ shopper: { firstName: string; email: string } | null; onlinePayments: boolean } | null>(null);
  useEffect(() => {
    fetch('/api/shopper/me', { cache: 'no-store' }).then((r) => r.json()).then(setMe).catch(() => setMe(null));
  }, []);

  // Prefill details from the last order on this device.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DETAILS_KEY) || 'null');
      if (saved) setForm((f) => ({ ...f, ...saved }));
    } catch {
      /* ignore */
    }
  }, []);

  const errors = validate(form);
  const unavailable = items.filter((i) => liveStock[i.id] === undefined || liveStock[i.id] <= 0);
  const overStock = items.filter((i) => liveStock[i.id] > 0 && i.quantity > liveStock[i.id]);
  const total = items.reduce((n, i) => n + i.cost * i.quantity, 0);
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);

  const bind = (k: keyof Form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
    'aria-invalid': !!(touched[k] && errors[k]),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ customerName: true, phoneNumber: true, email: true });
    if (Object.keys(errors).length || unavailable.length || overStock.length) return;
    setError(null);
    setSubmitting(true);
    if (pay === 'online') {
      try {
        const res = await fetch('/api/checkout/online', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items.map((i) => ({ id: i.id, quantity: i.quantity })) }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.link) throw new Error(data.error || 'Could not start the online payment.');
        window.location.href = data.link;
      } catch (err) {
        setError((err as Error).message);
        setSubmitting(false);
      }
      return;
    }
    try {
      const { saleId, token } = await checkout(store.username, {
        ...form,
        cartItems: items.map((i) => ({ id: i.id, name: i.name, cost: i.cost, quantity: i.quantity })),
      });
      try {
        localStorage.setItem(DETAILS_KEY, JSON.stringify(form));
      } catch {
        /* ignore */
      }
      clearStore(store.username);
      router.push(`/store/${store.username}/order/${saleId}?token=${encodeURIComponent(token)}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (!hydrated) return <div className="card h-80 animate-pulse" />;

  if (items.length === 0) {
    return (
      <div className="card flex flex-col items-center px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-canvas text-subtle">
          <Icon name="cart" size={26} />
        </span>
        <h2 className="mt-4 text-lg font-semibold">No items from {store.businessName} in your cart</h2>
        <p className="mt-1 text-sm text-subtle">Add something you like, then come back here to check out.</p>
        <Link href={`/store/${store.username}`} className="btn btn-dark mt-6">
          Browse {store.businessName}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 pb-28 lg:grid-cols-[1fr_420px] lg:gap-10 lg:pb-0">
      <div className="space-y-6">
        <section className="card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Step n={1} /> Your details
          </h2>
          <p className="mt-1 text-sm text-subtle">We&apos;ll send your invoice to your email and share your contact with the seller.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={touched.customerName && errors.customerName} className="sm:col-span-2">
              <input {...bind('customerName')} autoComplete="name" className="input" placeholder="e.g. Ada Obi" />
            </Field>
            <Field label="Phone number" error={touched.phoneNumber && errors.phoneNumber}>
              <input {...bind('phoneNumber')} type="tel" inputMode="tel" autoComplete="tel" className="input" placeholder="0803 000 0000" />
            </Field>
            <Field label="Email address" error={touched.email && errors.email}>
              <input {...bind('email')} type="email" inputMode="email" autoComplete="email" className="input" placeholder="you@example.com" />
            </Field>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Step n={2} /> Payment
          </h2>
          {me?.onlinePayments && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How would you like to pay?">
              {([['direct', 'Pay the seller directly', 'Bank transfer or cash, as the seller instructs'], ['online', 'Pay online now', 'Card, bank transfer or USSD — secured by Flutterwave']] as const).map(([k, t, h]) => (
                <button key={k} type="button" role="radio" aria-checked={pay === k} onClick={() => setPay(k)} className={cn('rounded-xl border p-4 text-left', pay === k ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink')}>
                  <span className="block text-sm font-semibold">{t}</span>
                  <span className="block text-xs text-subtle">{h}</span>
                </button>
              ))}
            </div>
          )}
          {pay === 'online' ? (
            <div className="mt-4 rounded-xl bg-canvas p-4 text-sm">
              {me?.shopper ? (
                <p>You&apos;ll be taken to a secure payment page. Paying as <strong>{me.shopper.email}</strong>; your receipt will be in your account.</p>
              ) : (
                <p>
                  Online payment needs a free Shed account so we can send your receipt.{' '}
                  <Link href={`/shopper/login?next=${encodeURIComponent(`/store/${store.username}/checkout`)}`} className="font-semibold underline">Sign in or create one</Link> — your cart will be kept.
                </p>
              )}
            </div>
          ) : (
          <div className="mt-4 rounded-xl bg-canvas p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Icon name="info" size={16} /> You pay {store.businessName} directly
            </p>
            {store.paymentInstructions ? (
              <p className="mt-2 whitespace-pre-line text-ink/80">{store.paymentInstructions}</p>
            ) : (
              <p className="mt-2 text-ink/80">After you place the order, the seller will contact you with payment and delivery details.</p>
            )}
          </div>
          )}
        </section>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-40 lg:self-start">
        <section className="card overflow-hidden">
          <h2 className="flex items-center justify-between border-b border-line px-5 py-4 text-lg font-bold">
            Order summary <span className="text-sm font-normal text-subtle">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
          </h2>
          <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
            {items.map((i) => {
              const live = liveStock[i.id];
              const out = live === undefined || live <= 0;
              return (
                <li key={i.id} className={cn('flex gap-3 px-5 py-4', out && 'bg-danger-soft/50')}>
                  <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line">
                    <Img src={i.image} alt={i.name} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium">{i.name}</span>
                      <span className="shrink-0 text-sm font-semibold">{formatCurrency(i.cost * i.quantity, currency)}</span>
                    </div>
                    {out ? (
                      <span className="mt-1 flex items-center justify-between text-xs font-medium text-danger">
                        No longer available
                        <button type="button" onClick={() => remove(i.id)} className="underline">Remove</button>
                      </span>
                    ) : (
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <QtyStepper size="sm" value={i.quantity} max={live} onChange={(n) => setQuantity(i.id, n)} />
                        <button type="button" onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`} className="p-1 text-subtle hover:text-danger">
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    )}
                    {!out && i.quantity > live && <span className="mt-1 text-xs text-danger">Only {live} available — please reduce quantity</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="space-y-2 border-t border-line px-5 py-4 text-sm">
            <div className="flex justify-between">
              <span className="text-subtle">Subtotal</span>
              <span>{formatCurrency(total, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-subtle">Delivery</span>
              <span className="text-subtle">Arranged with seller</span>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-lg font-extrabold">
              <span>Total</span>
              <span>{formatCurrency(total, currency)}</span>
            </div>
          </div>

          {error && (
            <p role="alert" className="mx-5 mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="hidden px-5 pb-5 lg:block">
            <SubmitButton submitting={submitting} online={pay === 'online'} total={formatCurrency(total, currency)} disabled={unavailable.length > 0 || overStock.length > 0 || (pay === 'online' && !me?.shopper)} />
          </div>
        </section>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-subtle">
          <Icon name="lock" size={14} /> Your details are only shared with {store.businessName}.
        </p>
      </aside>

      {/* Sticky place-order bar on phones/tablets */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur lg:hidden">
        <div className="mb-3">
          <SubmitButton submitting={submitting} online={pay === 'online'} total={formatCurrency(total, currency)} disabled={unavailable.length > 0 || overStock.length > 0 || (pay === 'online' && !me?.shopper)} />
        </div>
      </div>
    </form>
  );
}

function SubmitButton({ submitting, total, disabled, online }: { submitting: boolean; total: string; disabled: boolean; online?: boolean }) {
  return (
    <button type="submit" disabled={submitting || disabled} className="btn btn-brand btn-lg w-full">
      {submitting ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" /> Please wait…
        </>
      ) : (
        <>{online ? 'Pay' : 'Place order'} · {total}</>
      )}
    </button>
  );
}

function Step({ n }: { n: number }) {
  return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{n}</span>;
}

function Field({ label, error, className, children }: { label: string; error?: string | false; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('block', className, error && '[&_.input]:border-danger')}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}
