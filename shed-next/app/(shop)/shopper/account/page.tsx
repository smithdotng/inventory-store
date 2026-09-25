import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentShopper, shopperOrders } from '@/lib/server/shopper/account';
import { Container } from '@/components/ui';
import { Img } from '@/components/Img';
import { Icon } from '@/components/Icon';
import { ShopperProfile } from '@/components/shopper/ShopperAuthForms';
import { formatCurrency, realImage } from '@/lib/format';

export const metadata = { title: 'My account', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AccountPage({ searchParams }: { searchParams: { paid?: string; error?: string } }) {
  const me = await currentShopper();
  if (!me) redirect('/shopper/login?next=/shopper/account');
  const { orders, profile } = await shopperOrders(me);
  return (
    <Container className="py-8 sm:py-12">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Hi {me.firstName || 'there'}</h1>
      <p className="mt-1 text-subtle">Your orders from Shed stores.</p>
      {searchParams.paid && (
        <p role="status" className="mt-5 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success"><Icon name="check" size={16} /> Payment received — thank you! The sellers have been notified.</p>
      )}
      {searchParams.error && <p role="alert" className="mt-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{searchParams.error}</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="card overflow-hidden">
          <h2 className="border-b border-line px-5 py-4 font-bold">Orders</h2>
          {orders.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm text-subtle">No orders yet.</p>
              <Link href="/search" className="btn btn-dark mt-4">Start shopping</Link>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {orders.map((o: any) => {
                const paid = o.paymentStatus === 'Paid' || o.paymentStatus === 'Confirmed';
                return (
                  <li key={o._id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-line"><Img src={realImage(o.storeLogo)} alt={o.storeName} fallback="store" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{o.storeUsername ? <Link href={`/store/${o.storeUsername}`} className="hover:underline">{o.storeName}</Link> : o.storeName}</span>
                      <span className="block truncate text-xs text-subtle">{(o.items || []).map((i: any) => `${i.itemName} ×${i.quantity}`).join(', ')}</span>
                      <span className="block text-xs text-subtle">{new Date(o.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · <span className={paid ? 'text-success' : 'text-brand-dark'}>{paid ? 'Paid' : 'Awaiting payment'}</span></span>
                    </span>
                    <span className="text-right">
                      <span className="block font-bold">{formatCurrency(o.totalAmount || 0, o.currency)}</span>
                      <a href={`/shopper/orders/${o._id}/invoice`} target="_blank" rel="noreferrer" className="text-xs font-semibold hover:underline">{paid ? 'Receipt' : 'Invoice'} (PDF)</a>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section id="profile" className="card h-fit scroll-mt-40 p-5">
          <h2 className="mb-4 font-bold">Your details</h2>
          <ShopperProfile values={{ firstName: profile?.firstName || '', lastName: profile?.lastName || '', phone: profile?.phone || '', email: me.email }} />
        </section>
      </div>
    </Container>
  );
}
