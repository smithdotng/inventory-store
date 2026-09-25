import { requireSuperadmin } from '@/lib/server/auth';
import Link from 'next/link';
import { listAffiliates, listAllOutlets } from '@/lib/server/admin/superadmin';
import { PageHeader, Panel, fmtDate } from '@/components/dashboard/ui';

export const metadata = { title: 'Affiliates & outlets' };

export default async function Page() {
  await requireSuperadmin();
  const [affs, outlets] = await Promise.all([listAffiliates(), listAllOutlets()]);
  return (
    <>
      <PageHeader title="Affiliates & outlets" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`Affiliates (${affs.length})`} padded={false}>
          {affs.length === 0 ? <p className="px-5 py-8 text-center text-sm text-subtle">None yet.</p> : (
            <ul className="divide-y divide-line">
              {affs.map((a: any) => (
                <li key={a._id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0"><span className="block truncate font-semibold">{a.firstName} {a.lastName}</span><span className="block truncate text-xs text-subtle">{a.email} · {a.countryCode} {a.mobileNumber} · joined {fmtDate(a.createdAt)}</span></span>
                  <span className="shrink-0 text-right text-xs"><strong>{a.signups}</strong> signups<br /><span className="text-subtle">{a.clicks} clicks</span></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`Outlets (${outlets.length})`} padded={false}>
          {outlets.length === 0 ? <p className="px-5 py-8 text-center text-sm text-subtle">None yet.</p> : (
            <ul className="divide-y divide-line">
              {outlets.map((o: any) => (
                <li key={o._id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0"><span className="block truncate font-semibold">{o.name}</span><span className="block truncate text-xs text-subtle">@{o.username} · {o.location || '—'} · <Link href={`/dashboard/admin/stores/${o.storeUsername}`} className="underline">{o.storeName}</Link></span></span>
                  <span className="shrink-0 text-xs"><strong>{o.units}</strong> units</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
