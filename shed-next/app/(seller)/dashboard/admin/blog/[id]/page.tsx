import { requireSuperadmin } from '@/lib/server/auth';
import { notFound } from 'next/navigation';
import { adminPost } from '@/lib/server/admin/superadmin';
import { PageHeader } from '@/components/dashboard/ui';
import { PostEditor } from '@/components/admin/ContentForms';

export const metadata = { title: 'Edit post' };

export default async function Page({ params }: { params: { id: string } }) {
  await requireSuperadmin();
  const post = params.id === 'new' ? null : await adminPost(params.id);
  if (params.id !== 'new' && !post) notFound();
  return (
    <>
      <PageHeader back={{ href: '/dashboard/admin/blog', label: 'Blog' }} title={post ? 'Edit post' : 'New post'} />
      <div className="card p-5 sm:p-6"><PostEditor post={post || undefined} /></div>
    </>
  );
}
