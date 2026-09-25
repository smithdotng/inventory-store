import { requireSuperadmin } from '@/lib/server/auth';
import { supportInbox } from '@/lib/server/admin/superadmin';
import { formatCurrency } from '@/lib/format';
import { PageHeader, Panel, fmtDate } from '@/components/dashboard/ui';
import { ActionButton } from '@/components/admin/ActionButton';
import { supportActionA } from '@/lib/actions/admin';

export const metadata = { title: 'Support inbox' };

export default async function Page() {
  await requireSuperadmin();
  const { contact, flags } = await supportInbox();
  const open = flags.filter((f: any) => !f.resolved);
  return (
    <>
      <PageHeader title="Support inbox" subtitle="Contact-form messages and online payments that need a manual check." />
      <Panel title={`Payments to reconcile (${open.length})`} className="mb-6" padded={false}>
        {flags.length === 0 ? <p className="px-5 py-8 text-center text-sm text-subtle">No issues. 🎉</p> : (
          <ul className="divide-y divide-line">
            {flags.map((f: any) => (
              <li key={f._id} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm ${f.resolved ? 'opacity-50' : ''}`}>
                <span className="min-w-0"><span className="block font-semibold">{f.txRef} · {formatCurrency(f.amount || 0, '₦')}</span><span className="text-xs text-subtle">Store {f.adminId} · {f.error} · {fmtDate(f.createdAt, true)}</span></span>
                {!f.resolved && <ActionButton action={supportActionA.bind(null, 'flag', f._id)}>Mark resolved</ActionButton>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Contact messages" padded={false}>
        {contact.length === 0 ? <p className="px-5 py-8 text-center text-sm text-subtle">No messages.</p> : (
          <ul className="divide-y divide-line">
            {contact.map((m: any) => (
              <li key={m._id} className={`px-5 py-4 text-sm ${m.read ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{m.subject}</strong>
                  <span className="text-xs text-subtle">{fmtDate(m.createdAt, true)}</span>
                </div>
                <p className="text-xs text-subtle">{m.name} · <a href={`mailto:${m.email}`} className="underline">{m.email}</a>{m.phone ? ` · ${m.phone}` : ''}</p>
                <p className="mt-2 whitespace-pre-line">{m.message}</p>
                {!m.read && <div className="mt-2"><ActionButton action={supportActionA.bind(null, 'contact', m._id)}>Mark as handled</ActionButton></div>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
