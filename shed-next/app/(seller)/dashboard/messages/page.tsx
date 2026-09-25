import Link from 'next/link';
import { requireSeller } from '@/lib/server/auth';
import { listMessages } from '@/lib/server/seller/account';
import { cn } from '@/lib/format';
import { PageHeader } from '@/components/dashboard/ui';
import { Inbox } from '@/components/dashboard/Inbox';

export const metadata = { title: 'Messages' };

export default async function MessagesPage({ searchParams }: { searchParams: { box?: string; q?: string } }) {
  const ctx = await requireSeller({ allowLocked: true });
  const trash = searchParams.box === 'trash';
  const { rows, trashCount } = await listMessages(ctx, { trash, q: searchParams.q });
  return (
    <>
      <PageHeader title="Messages" subtitle="Order notifications and updates from Shed." />
      <div className="mb-4 flex gap-2">
        <Link href="/dashboard/messages" className={cn('chip', !trash && 'chip-active')}>Inbox</Link>
        <Link href="/dashboard/messages?box=trash" className={cn('chip', trash && 'chip-active')}>Trash <span className="opacity-60">{trashCount}</span></Link>
      </div>
      <Inbox rows={rows} trash={trash} />
    </>
  );
}
