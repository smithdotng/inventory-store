import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, getOrder } from '@/lib/server/store';
import { formatCurrency, whatsappLink } from '@/lib/format';
import { Container } from '@/components/ui';
import { Icon, WhatsAppIcon } from '@/components/Icon';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Order confirmed', robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: { username: string; saleId: string }; searchParams: { token?: string } }) {
  let data;
  try {
    data = await getOrder(params.username, params.saleId, searchParams.token || '');
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const { store, sale, pdfUrl } = data;
  const currency = store.currency || '₦';
  const ref = String(sale._id).slice(-8).toUpperCase();
  const msg = `Hi ${store.businessName}, I just placed order #${ref} (${formatCurrency(sale.totalAmount, currency)}) on Shed. My name is ${sale.customerName}.`;

  return (
    <Container className="py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center text-center animate-fade-up">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
            <Icon name="check" size={32} strokeWidth={2.5} />
          </span>
          <h1 className="mt-5 text-3xl font-extrabold">Thank you, {sale.customerName.split(' ')[0]}!</h1>
          <p className="mt-2 text-subtle">
            Your order with <strong className="text-ink">{store.businessName}</strong> has been placed.
            {sale.email && <> A copy of your invoice was sent to <strong className="text-ink">{sale.email}</strong>.</>}
          </p>
          <p className="mt-3 rounded-full bg-surface px-4 py-1.5 text-sm font-medium ring-1 ring-line">Order #{ref}</p>
        </div>

        {/* What's next */}
        <ol className="card mt-8 grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
          {[
            { icon: 'receipt', title: 'Order received', body: 'The seller has been notified.' },
            { icon: 'chat', title: 'Confirm & pay', body: store.paymentInstructions ? 'Follow the payment instructions below.' : 'The seller will contact you.' },
            { icon: 'truck', title: 'Get your items', body: 'Arrange pickup or delivery with the seller.' },
          ].map((s, i) => (
            <li key={s.title} className="flex gap-3 sm:flex-col">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${i === 0 ? 'bg-success text-white' : 'bg-canvas text-ink'}`}>
                <Icon name={s.icon} size={18} />
              </span>
              <span>
                <span className="block text-sm font-semibold">{s.title}</span>
                <span className="block text-xs text-subtle">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>

        {store.paymentInstructions && (
          <section className="mt-4 rounded-card border border-brand/40 bg-brand-soft p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-bold">
              <Icon name="info" size={18} /> How to pay
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm text-ink/85">{store.paymentInstructions}</p>
          </section>
        )}

        <section className="card mt-4 overflow-hidden">
          <h2 className="border-b border-line px-5 py-4 font-bold">Order details</h2>
          <ul className="divide-y divide-line">
            {sale.items.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
                <span>
                  {item.itemName} <span className="text-subtle">× {item.quantity}</span>
                </span>
                <span className="font-medium">{formatCurrency(item.totalCost, currency)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-line px-5 py-4 text-lg font-extrabold">
            <span>Total</span>
            <span>{formatCurrency(sale.totalAmount, currency)}</span>
          </div>
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn btn-dark btn-lg">
            <Icon name="receipt" size={18} /> Download invoice
          </a>
          {store.whatsappNumber ? (
            <a href={whatsappLink(store.whatsappNumber, msg)} target="_blank" rel="noreferrer" className="btn btn-lg bg-[#25D366] text-white hover:bg-[#1ebe5b]">
              <WhatsAppIcon size={18} /> Message seller
            </a>
          ) : (
            <Link href={`/store/${store.username}`} className="btn btn-outline btn-lg">
              Continue shopping
            </Link>
          )}
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/" className="font-medium text-subtle hover:text-ink">Back to Shed marketplace</Link>
        </p>
      </div>
    </Container>
  );
}
