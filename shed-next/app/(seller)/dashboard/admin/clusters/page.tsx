import { requireSuperadmin } from '@/lib/server/auth';
import Link from 'next/link';
import { adminClusters } from '@/lib/server/admin/superadmin';
import { BUSINESS_CATEGORIES } from '@/lib/server/categories';
import { PageHeader } from '@/components/dashboard/ui';
import { ClusterForm } from '@/components/admin/ContentForms';
import { ActionButton } from '@/components/admin/ActionButton';
import { clusterActionA, storeActionA } from '@/lib/actions/admin';

export const metadata = { title: 'Markets' };

export default async function Page() {
  await requireSuperadmin();
  const clusters = await adminClusters();
  return (
    <>
      <PageHeader title="Market clusters" subtitle="Group stores by physical market. Stores only appear in a market after you verify them." actions={<ClusterForm categories={BUSINESS_CATEGORIES} />} />
      <div className="space-y-4">
        {clusters.length === 0 && <p className="card px-6 py-14 text-center text-sm text-subtle">No markets yet.</p>}
        {clusters.map((c: any) => (
          <section key={c._id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">{c.name} {!c.isActive && <span className="ml-1 rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold text-subtle">Hidden</span>}</p>
                <p className="text-sm text-subtle"><Link href={`/cluster/${c.slug}`} className="underline">/cluster/{c.slug}</Link> · {c.verifiedCount} verified · {c.storeCount - c.verifiedCount} waiting</p>
                {c.description && <p className="mt-1 text-sm">{c.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <ClusterForm categories={BUSINESS_CATEGORIES} cluster={c} />
                <ActionButton action={clusterActionA.bind(null, c._id, 'toggle')}>{c.isActive ? 'Hide' : 'Show'}</ActionButton>
                <ActionButton action={clusterActionA.bind(null, c._id, 'delete')} confirm={`Delete ${c.name}? Stores will be removed from it.`} danger>Delete</ActionButton>
              </div>
            </div>
            {c.pending.length > 0 && (
              <div className="mt-4 rounded-xl bg-brand-soft p-3">
                <p className="mb-2 text-sm font-semibold text-brand-dark">Waiting for verification</p>
                <ul className="space-y-2">
                  {c.pending.map((p: any) => (
                    <li key={p._id} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/dashboard/admin/stores/${p.username}`} className="underline">{p.businessName || p.username}</Link>
                      <ActionButton action={storeActionA.bind(null, p._id, 'verify')} className="btn btn-dark h-8 min-h-0 px-3 text-xs">Verify</ActionButton>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
