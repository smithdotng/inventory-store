import Link from 'next/link';
import { pageMeta } from '@/lib/seo';
import { listPosts } from '@/lib/server/public/content';
import { Container } from '@/components/ui';
import { Img } from '@/components/Img';
import { Pagination } from '@/components/Pagination';
import { cn, realImage } from '@/lib/format';

export const metadata = pageMeta({ title: 'Blog', description: 'Tips and stories for growing a business with Shed.', path: '/blog' });
export const dynamic = 'force-dynamic';

export default async function BlogPage({ searchParams }: { searchParams: { page?: string; tag?: string } }) {
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const { posts, pages, tags } = await listPosts({ page, tag: searchParams.tag });
  const href = (p: number, t = searchParams.tag) => `/blog?${new URLSearchParams({ ...(t ? { tag: t } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  return (
    <Container className="py-10 sm:py-14">
      <h1 className="text-3xl font-extrabold sm:text-4xl">The Shed blog</h1>
      <p className="mt-2 text-subtle">Practical ideas for selling more and running a tighter business.</p>
      {tags.length > 0 && (
        <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto">
          <Link href="/blog" className={cn('chip', !searchParams.tag && 'chip-active')}>All</Link>
          {tags.map((t: string) => <Link key={t} href={href(1, t)} className={cn('chip', searchParams.tag === t && 'chip-active')}>{t}</Link>)}
        </div>
      )}
      {posts.length === 0 ? (
        <p className="card mt-8 px-6 py-16 text-center text-subtle">No posts yet — check back soon.</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p: any) => (
            <Link key={p._id} href={`/blog/${p.slug}`} className="card group overflow-hidden transition hover:shadow-lift">
              <span className="block aspect-[16/9] overflow-hidden bg-canvas"><Img src={realImage(p.coverImage && !/default-blog/.test(p.coverImage) ? p.coverImage : null)} alt={p.title} className="transition group-hover:scale-[1.03]" /></span>
              <span className="block p-5">
                <span className="text-xs text-subtle">{new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span className="mt-1 line-clamp-2 block text-lg font-bold leading-snug">{p.title}</span>
                {p.excerpt && <span className="mt-2 line-clamp-3 block text-sm text-subtle">{p.excerpt}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
      <Pagination page={page} pages={pages} hrefFor={(n) => href(n)} />
    </Container>
  );
}
