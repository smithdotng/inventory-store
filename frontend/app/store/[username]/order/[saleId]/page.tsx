import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrder } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Container } from '@/components/ui';
import { StoreHeader } from '@/components/StoreHeader';

export const metadata: Metadata = { title: 'Order confirmed' };

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: { username: string; saleId: string };
  searchParams: { token?: string };
}) {
  const token = searchParams.token || '';
  let data;
  try {
    data = await getOrder(params.username, params.saleId, token);
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }
  const { store, sale, pdfUrl } = data;
  const currency = store.currency || '₦';

  return (
    <>
      <StoreHeader store={store} />
      <Container className="py-12">
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-3xl">
              ✓
            </span>
            <h1 className="mt-5 text-3xl font-extrabold">Order confirmed</h1>
            <p className="mt-2 text-subtle">
              Thank you, {sale.customerName}. Your order has been received.
            </p>
            <p className="mt-1 text-xs text-subtle">Order ref: {String(sale._id)}</p>
          </div>

          <div className="mt-10 rounded-card border border-line bg-surface shadow-card">
            <div className="border-b border-line px-6 py-4 font-bold">Order details</div>
            <ul className="divide-y divide-line">
              {sale.items.map((item, idx) => (
                <li key={idx} className="flex items-center justify-between gap-3 px-6 py-4 text-sm">
                  <span className="text-ink/80">
                    {item.itemName} <span className="text-subtle">× {item.quantity}</span>
                  </span>
                  <span className="font-medium">{formatCurrency(item.totalCost, currency)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t border-line px-6 py-4 text-base font-bold">
              <span>Total</span>
              <span>{formatCurrency(sale.totalAmount, currency)}</span>
            </div>
          </div>

          {store.paymentInstructions && (
            <div className="mt-6 rounded-card bg-muted p-6">
              <h3 className="font-bold">Payment instructions</h3>
              <p className="mt-2 whitespace-pre-line text-sm text-ink/80">{store.paymentInstructions}</p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
              Download invoice (PDF)
            </a>
            <Link href={`/store/${store.username}`} className="btn btn-outline">
              Continue shopping
            </Link>
          </div>
        </div>
      </Container>
    </>
  );
}
