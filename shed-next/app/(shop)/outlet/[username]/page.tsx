import Link from 'next/link';
import { pageMeta } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { publicOutlet } from '@/lib/server/seller/outlets';
import { Container, EmptyState } from '@/components/ui';
import { Img } from '@/components/Img';
import { Icon, WhatsAppIcon } from '@/components/Icon';
import { formatCurrency, realImage, whatsappLink } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { username: string } }) {
  const d = await publicOutlet(params.username);
  if (!d) return { title: 'Outlet' };
  const o: any = d.outlet, st: any = d.store;
  return pageMeta({ title: `${o.name} — ${st.businessName}`, description: `${o.name}${o.location ? ` in ${o.location}` : ''} — an outlet of ${st.businessName} on Shed.`, path: `/outlet/${params.username}`, images: [st.logo] });
}

export default async function OutletPublicPage({ params }: { params: { username: string } }) {
  const d = await publicOutlet(params.username);
  if (!d) notFound();
  return (
    <Container className="py-8 sm:py-12">
      <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <span className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-line"><Img src={realImage(d.store.logo)} alt={d.store.businessName} fallback="store" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">{d.outlet.name}</h1>
          <p className="text-sm text-subtle">{d.outlet.location || 'Outlet'} · part of <Link href={`/store/${d.store.username}`} className="font-semibold text-ink hover:underline">{d.store.businessName}</Link></p>
        </div>
        {d.outlet.mobile && (
          <a href={whatsappLink(d.outlet.mobile.replace(/^0/, '234'), `Hi ${d.outlet.name}, I found you on Shed.`)} target="_blank" rel="noreferrer" className="btn bg-[#25D366] text-white hover:bg-[#1ebe5b]"><WhatsAppIcon size={18} /> Chat with outlet</a>
        )}
      </div>
      <h2 className="mb-4 mt-8 text-xl font-bold">Available here</h2>
      {d.items.length === 0 ? (
        <EmptyState title="Nothing in stock at this outlet right now" action={<Link href={`/store/${d.store.username}`} className="btn btn-dark">Shop the main store</Link>} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {d.items.map((i: any) => (
            <Link key={i.id} href={`/store/${d.store.username}/products/${i.id}`} className="card overflow-hidden transition hover:shadow-lift">
              <span className="block aspect-square bg-canvas"><Img src={realImage(i.image)} alt={i.name} /></span>
              <span className="block p-3">
                <span className="line-clamp-2 text-sm font-medium">{i.name}</span>
                <span className="mt-1 flex items-center justify-between"><strong>{formatCurrency(i.cost, d.store.currency)}</strong><span className="text-xs text-subtle">{i.stock} here</span></span>
              </span>
            </Link>
          ))}
        </div>
      )}
      <p className="mt-8 flex items-center gap-2 text-sm text-subtle"><Icon name="info" size={16} /> To order online, open a product and buy from {d.store.businessName}&apos;s store.</p>
    </Container>
  );
}
