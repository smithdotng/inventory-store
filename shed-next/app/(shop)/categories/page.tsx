import Link from 'next/link';
import { pageMeta } from '@/lib/seo';
import type { Metadata } from 'next';
import { CATEGORIES } from '@/lib/categories';
import { Container } from '@/components/ui';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = pageMeta({ title: 'All categories', description: 'Browse every category on Shed — phones, fashion, food, home and more from local stores.', path: '/categories' });

export default function CategoriesPage() {
  return (
    <Container className="py-8 sm:py-12">
      <h1 className="text-2xl font-extrabold sm:text-3xl">All categories</h1>
      <p className="mt-1 text-subtle">Browse products by what you&apos;re shopping for.</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c) => (
          <Link key={c.name} href={`/search?category=${encodeURIComponent(c.name)}`} className="card group flex items-center gap-4 p-4 transition hover:border-ink">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-canvas transition group-hover:bg-brand">
              <Icon name={c.icon} size={22} />
            </span>
            <span className="flex-1 font-medium">{c.name}</span>
            <Icon name="chevronRight" size={18} className="text-subtle" />
          </Link>
        ))}
      </div>
    </Container>
  );
}
