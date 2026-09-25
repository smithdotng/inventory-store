import Link from 'next/link';
import { pageMeta } from '@/lib/seo';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, getProduct, getStore } from '@/lib/server/store';
import { fromStore } from '@/lib/mappers';
import { formatCurrency, realImage, whatsappLink } from '@/lib/format';
import { Breadcrumbs, Container, SectionHeader, StockBadge } from '@/components/ui';
import { Icon, WhatsAppIcon } from '@/components/Icon';
import { Img } from '@/components/Img';
import { BuyBox } from '@/components/AddToCart';
import { ProductGallery } from '@/components/ProductGallery';
import { ProductCard, ProductRail } from '@/components/ProductCard';
import { ShareButton } from '@/components/ShareButton';

export const dynamic = 'force-dynamic';

type P = { params: { username: string; id: string } };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  try {
    const { store, product } = await getProduct(params.username, params.id);
    const price = formatCurrency(product.cost, store.currency);
    return pageMeta({
      title: `${product.name} — ${store.businessName}`,
      description: `${price} · ${product.stock > 0 ? 'In stock' : 'Out of stock'} at ${store.businessName}. ${product.description || `Buy ${product.name} on Shed.`}`,
      path: `/store/${store.username}/products/${params.id}`,
      images: [...(product.images || []), store.logo],
    });
  } catch {
    return { title: 'Product' };
  }
}

export default async function ProductPage({ params }: P) {
  let data;
  try {
    data = await getProduct(params.username, params.id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { store, product, locked } = data;
  const currency = store.currency || '₦';
  const images = (product.images || []).map(realImage).filter(Boolean) as string[];

  // "More from this store" — prefer same category, then anything else.
  const others = await getStore(store.username)
    .then((r) => r.products.filter((p) => String(p._id) !== String(product._id)))
    .catch(() => []);
  const related = [...others.filter((p) => product.category && p.category === product.category), ...others.filter((p) => !product.category || p.category !== product.category)]
    .slice(0, 10)
    .map(fromStore(store));

  const enquiry = `Hi ${store.businessName}, I'm interested in "${product.name}" (${formatCurrency(product.cost, currency)}) on Shed.`;

  return (
    <div className="pb-28 md:pb-0">
      <Container className="py-4 sm:py-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: store.businessName, href: `/store/${store.username}` },
            ...(product.category ? [{ label: product.category, href: `/search?category=${encodeURIComponent(product.category)}` }] : []),
            { label: product.name },
          ]}
        />

        <div className="mt-4 grid gap-6 lg:mt-6 lg:grid-cols-[1.15fr_1fr] lg:gap-10">
          <ProductGallery images={images} alt={product.name} />

          <div className="lg:sticky lg:top-40 lg:self-start">
            <div className="card p-5 sm:p-6">
              {product.category && <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{product.category}</p>}
              <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{product.name}</h1>
              <div className="mt-2 flex items-center justify-between gap-3">
                <StockBadge stock={product.stock} />
                <ShareButton title={product.name} />
              </div>
              <p className="mt-4 text-3xl font-extrabold">{formatCurrency(product.cost, currency)}</p>

              <div className="mt-5">
                {locked ? (
                  <div className="rounded-xl bg-canvas p-4 text-sm text-subtle">This store isn&apos;t taking online orders right now.</div>
                ) : (
                  <BuyBox
                  item={{ id: String(product._id), name: product.name, cost: product.cost, stock: product.stock, image: images[0], storeUsername: store.username, storeName: store.businessName, currency }}
                />
                )}
              </div>

              <ul className="mt-6 space-y-3 border-t border-line pt-5 text-sm">
                <li className="flex gap-3">
                  <Icon name="receipt" size={18} className="shrink-0 text-subtle" />
                  <span>Instant PDF invoice sent to your email after you order.</span>
                </li>
                <li className="flex gap-3">
                  <Icon name="truck" size={18} className="shrink-0 text-subtle" />
                  <span>Pickup or delivery is arranged directly with the seller.</span>
                </li>
                <li className="flex gap-3">
                  <Icon name="shield" size={18} className="shrink-0 text-subtle" />
                  <span>Pay the seller using the instructions shown at checkout.</span>
                </li>
              </ul>
            </div>

            {/* Seller card */}
            <div className="card mt-4 flex items-center gap-3 p-4">
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-line">
                <Img src={realImage(store.logo)} alt={store.businessName} fallback="store" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-subtle">Sold by</p>
                <Link href={`/store/${store.username}`} className="block truncate font-semibold hover:underline">
                  {store.businessName}
                </Link>
              </div>
              {store.whatsappNumber ? (
                <a href={whatsappLink(store.whatsappNumber, enquiry)} target="_blank" rel="noreferrer" className="btn h-10 min-h-0 bg-[#25D366] px-3 text-white hover:bg-[#1ebe5b]">
                  <WhatsAppIcon size={16} /> Ask
                </a>
              ) : (
                <Link href={`/store/${store.username}`} className="btn btn-outline h-10 min-h-0 px-3">
                  Visit
                </Link>
              )}
            </div>
          </div>
        </div>

        {product.description && (
          <section className="mt-10 max-w-3xl">
            <h2 className="text-lg font-bold">Product details</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-ink/80">{product.description}</p>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-12">
            <SectionHeader title={`More from ${store.businessName}`} href={`/store/${store.username}`} linkLabel="Visit store" />
            <ProductRail>
              {related.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </ProductRail>
          </section>
        )}
      </Container>
    </div>
  );
}
