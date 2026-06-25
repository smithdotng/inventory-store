import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Container } from '@/components/ui';
import { DiscoverSearch } from '@/components/DiscoverSearch';

export const metadata: Metadata = {
  title: 'Discover stores & products',
  description: 'Search across every Shed store and product.',
};

export default function DiscoverPage({
  searchParams,
}: {
  searchParams: { q?: string; type?: string };
}) {
  const initialType =
    searchParams.type === 'stores' || searchParams.type === 'products' ? searchParams.type : 'all';
  return (
    <>
      <SiteHeader />
      <section className="bg-ink py-16 text-surface">
        <Container>
          <h1 className="text-center text-3xl font-extrabold sm:text-4xl">
            Discover stores &amp; products
          </h1>
          <p className="mt-3 text-center text-surface/70">
            Find any shop or item across the Shed marketplace.
          </p>
        </Container>
      </section>
      <Container className="py-12">
        <DiscoverSearch initialQuery={searchParams.q || ''} initialType={initialType} />
      </Container>
      <SiteFooter />
    </>
  );
}
