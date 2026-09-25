import Link from 'next/link';
import { pageMeta } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { getPost } from '@/lib/server/public/content';
import { Container } from '@/components/ui';
import { Img } from '@/components/Img';
import { realImage } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const d = await getPost(params.slug, false);
  return d
    ? pageMeta({ title: d.post.title, description: d.post.excerpt || undefined, path: `/blog/${params.slug}`, images: [d.post.coverImage], type: 'article', publishedTime: d.post.createdAt ? new Date(d.post.createdAt).toISOString() : undefined })
    : { title: 'Post not found' };
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const d = await getPost(params.slug);
  if (!d) notFound();
  const { post, related } = d;
  return (
    <Container className="py-10 sm:py-14">
      <article className="mx-auto max-w-3xl">
        <Link href="/blog" className="text-sm font-medium text-subtle hover:text-ink">← All posts</Link>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-5xl">{post.title}</h1>
        <p className="mt-3 text-sm text-subtle">{post.author || 'Shed Team'} · {new Date(post.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        {post.coverImage && !/default-blog/.test(post.coverImage) && (
          <div className="mt-8 aspect-[16/9] overflow-hidden rounded-2xl bg-canvas"><Img src={realImage(post.coverImage)} alt="" loading="eager" /></div>
        )}
        <div className="prose-shed mt-8" dangerouslySetInnerHTML={{ __html: post.content }} />
        {post.tags?.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">{post.tags.map((t: string) => <Link key={t} href={`/blog?tag=${encodeURIComponent(t)}`} className="chip h-8 text-xs">{t}</Link>)}</div>
        )}
      </article>
      {related.length > 0 && (
        <section className="mx-auto mt-14 max-w-5xl">
          <h2 className="mb-4 text-xl font-bold">Keep reading</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {related.map((r: any) => <Link key={r._id} href={`/blog/${r.slug}`} className="card p-5 font-semibold hover:border-ink">{r.title}</Link>)}
          </div>
        </section>
      )}
    </Container>
  );
}
