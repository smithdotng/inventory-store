import Link from 'next/link';
import { Suspense } from 'react';
import { listProducts, searchStores } from '@/lib/server/store';
import { CATEGORIES } from '@/lib/categories';
import { fromMarket } from '@/lib/mappers';
import { realImage } from '@/lib/format';
import { Container, SectionHeader } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Img } from '@/components/Img';
import { SearchBox } from '@/components/SearchBox';
import { ProductCard, ProductRail } from '@/components/ProductCard';
import { TrustStrip } from '@/components/SiteFooter';
import { activeAds } from '@/lib/server/admin/superadmin';
import { formatCurrency } from '@/lib/format';

export const dynamic = 'force-dynamic';

const RAIL_CATEGORIES = ['Electronics', 'Fashion & Apparel', 'Food & Groceries'];

export default async function HomePage() {
  const ads = await activeAds(4).catch(() => []);
  const [latest, stores, ...rails] = await Promise.all([
    listProducts({ limit: 10 }),
    searchStores({ limit: 8 }),
    ...RAIL_CATEGORIES.map((category) => listProducts({ category, limit: 10 })),
  ]);

  const heroImages = latest.results.map((p) => realImage(p.image)).filter(Boolean).slice(0, 4) as string[];

  return (
    <>
      {/* Hero */}
      <section className="border-b border-line bg-surface">
        <Container className="grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[1.1fr_1fr] lg:py-16">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-dark">
              <Icon name="store" size={14} /> {stores.total > 0 ? `${stores.total}+ local stores` : 'Local stores'} in one place
            </p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
              Shop from businesses <span className="text-brand">near you.</span>
            </h1>
            <p className="mt-4 max-w-lg text-lg text-subtle">
              Find what you need, order in a few taps, and pay the seller directly. Your invoice lands in your inbox instantly.
            </p>
            <Suspense>
              <SearchBox size="lg" className="mt-7 max-w-xl" />
            </Suspense>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Phones', 'Generator', 'Shoes', 'Rice', 'Laptop'].map((t) => (
                <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="chip h-8 text-xs">
                  {t}
                </Link>
              ))}
            </div>
          </div>

          <div className="hidden grid-cols-2 gap-3 lg:grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`overflow-hidden rounded-2xl border border-line bg-canvas ${i % 2 ? 'translate-y-6' : ''}`}>
                <div className="aspect-[4/5]">
                  <Img src={heroImages[i]} alt="" loading="eager" />
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Container className="space-y-12 py-10 sm:space-y-16 sm:py-14">
        {/* Categories */}
        <section>
          <SectionHeader title="Shop by category" href="/categories" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
            {CATEGORIES.slice(0, 12).map((c) => (
              <Link
                key={c.name}
                href={`/search?category=${encodeURIComponent(c.name)}`}
                className="group flex flex-col items-center gap-2 rounded-card border border-line bg-surface px-2 py-4 text-center transition hover:border-ink hover:shadow-card"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-ink transition group-hover:bg-brand">
                  <Icon name={c.icon} size={22} />
                </span>
                <span className="line-clamp-2 text-xs font-medium leading-tight sm:text-sm">{c.name}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Sponsored (featured ads managed by Shed admins) */}
        {ads.length > 0 && (
          <section>
            <SectionHeader title="Featured" subtitle="Sponsored picks from Shed stores" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ads.map((a: any) => (
                <a key={a._id} href={a.storeUrl} className="card group flex gap-3 overflow-hidden p-3 transition hover:border-ink">
                  <span className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-canvas"><Img src={realImage(a.imageUrl)} alt={a.productName} /></span>
                  <span className="min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Sponsored</span>
                    <span className="line-clamp-2 block text-sm font-semibold">{a.productName}</span>
                    <span className="block text-xs text-subtle">{a.businessName}</span>
                    {a.price > 0 && <span className="block text-sm font-bold">{formatCurrency(a.price, a.currency || '₦')}</span>}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* New arrivals */}
        {latest.results.length > 0 && (
          <section>
            <SectionHeader title="New arrivals" subtitle="Fresh stock from stores across Shed" href="/search" />
            <ProductRail>
              {latest.results.map((p, i) => (
                <ProductCard key={p.id} p={fromMarket(p)} showStore priority={i < 4} />
              ))}
            </ProductRail>
          </section>
        )}

        {/* Stores */}
        {stores.results.length > 0 && (
          <section>
            <SectionHeader title="Popular stores" href="/search?type=stores" linkLabel="All stores" />
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
              {stores.results.map((s) => (
                <Link key={s.id} href={`/store/${s.username}`} className="card flex w-64 shrink-0 items-center gap-3 p-4 transition hover:border-ink sm:w-auto">
                  <span className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-line">
                    <Img src={realImage(s.logo)} alt={s.name} fallback="store" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{s.name}</span>
                    <span className="block truncate text-xs text-subtle">
                      {s.productCount} products{s.location ? ` · ${s.location}` : ''}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Category rails */}
        {rails.map((r, i) =>
          r.results.length > 0 ? (
            <section key={RAIL_CATEGORIES[i]}>
              <SectionHeader title={RAIL_CATEGORIES[i]} href={`/search?category=${encodeURIComponent(RAIL_CATEGORIES[i])}`} />
              <ProductRail>
                {r.results.map((p) => (
                  <ProductCard key={p.id} p={fromMarket(p)} showStore />
                ))}
              </ProductRail>
            </section>
          ) : null,
        )}

        <section className="card p-6 sm:p-8">
          <TrustStrip />
        </section>

        {/* Seller CTA */}
        <section className="overflow-hidden rounded-2xl bg-ink text-white">
          <div className="grid items-center gap-6 p-8 sm:p-12 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-2xl font-extrabold sm:text-3xl">Have something to sell?</h2>
              <p className="mt-2 max-w-xl text-white/70">
                Open a free Shed store in minutes. Manage stock, send invoices and take orders online — all in one place.
              </p>
            </div>
            <Link href="/sell" className="btn btn-brand btn-lg">
              Open your store <Icon name="arrowRight" size={18} />
            </Link>
          </div>
        </section>
      </Container>
    </>
  );
}
