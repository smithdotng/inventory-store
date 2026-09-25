import { requireSuperadmin } from '@/lib/server/auth';
import Link from 'next/link';
import { adminPosts } from '@/lib/server/admin/superadmin';
import { Flash, PageHeader, fmtDate } from '@/components/dashboard/ui';
import { ActionButton } from '@/components/admin/ActionButton';
import { postActionA } from '@/lib/actions/admin';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Blog' };

export default async function Page({ searchParams }: { searchParams: { ok?: string } }) {
  await requireSuperadmin();
  const posts = await adminPosts();
  return (
    <>
      <PageHeader title="Blog" subtitle="Posts on shed.ng/blog." actions={<Link href="/dashboard/admin/blog/new" className="btn btn-dark"><Icon name="plus" size={16} /> New post</Link>} />
      <Flash ok={searchParams.ok} />
      <div className="card overflow-hidden">
        {posts.length === 0 ? <p className="px-6 py-14 text-center text-sm text-subtle">No posts yet.</p> : (
          <ul className="divide-y divide-line">
            {posts.map((p: any) => (
              <li key={p._id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <Link href={`/dashboard/admin/blog/${p._id}`} className="min-w-0 flex-1">
                  <span className="block truncate font-semibold hover:underline">{p.title}</span>
                  <span className="text-xs text-subtle">{fmtDate(p.createdAt)} · {p.views || 0} views · {(p.tags || []).join(', ')}</span>
                </Link>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.published ? 'bg-success-soft text-success' : 'bg-canvas text-subtle'}`}>{p.published ? 'Published' : 'Draft'}</span>
                {p.published && <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" className="text-sm underline">View</a>}
                <ActionButton action={postActionA.bind(null, p._id, 'toggle')}>{p.published ? 'Unpublish' : 'Publish'}</ActionButton>
                <ActionButton action={postActionA.bind(null, p._id, 'delete')} confirm="Delete this post?" danger>Delete</ActionButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
