import { requireSuperadmin } from '@/lib/server/auth';
import { listStores, sentMessages } from '@/lib/server/admin/superadmin';
import { PageHeader, Panel, fmtDate } from '@/components/dashboard/ui';
import { BroadcastForm, MessageForm } from '@/components/admin/StoreForms';

export const metadata = { title: 'Announcements' };

export default async function Page() {
  const ctx = await requireSuperadmin();
  const [sent, stores] = await Promise.all([sentMessages(ctx), listStores()]);
  const withEmail = stores.filter((s: any) => s.email).length;
  return (
    <>
      <PageHeader title="Announcements" subtitle="Message store owners in their dashboard inbox, or email everyone." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Dashboard message"><MessageForm stores={stores.map((s: any) => ({ id: s._id, name: `${s.businessName || s.username} (@${s.username})` }))} /></Panel>
        <Panel title="Email broadcast"><BroadcastForm count={withEmail} /></Panel>
      </div>
      <Panel title="Sent messages" className="mt-6" padded={false}>
        {sent.length === 0 ? <p className="px-5 py-8 text-center text-sm text-subtle">Nothing sent yet.</p> : (
          <ul className="divide-y divide-line">
            {sent.map((m: any) => (
              <li key={m._id} className="px-5 py-3 text-sm">
                <div className="flex justify-between gap-3"><strong className="truncate">{m.subject || '(no subject)'}</strong><span className="shrink-0 text-xs text-subtle">{fmtDate(m.createdAt, true)}</span></div>
                <p className="text-xs text-subtle">To {m.recipient} · {m.read ? `read ${fmtDate(m.readAt)}` : 'unread'}</p>
                <p className="mt-1 line-clamp-2 text-ink/75">{m.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
