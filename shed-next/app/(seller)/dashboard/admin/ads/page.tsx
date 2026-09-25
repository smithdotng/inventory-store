import { requireSuperadmin } from '@/lib/server/auth';
import { listAds } from '@/lib/server/admin/superadmin';
import { formatCurrency, realImage } from '@/lib/format';
import { PageHeader } from '@/components/dashboard/ui';
import { AdForm } from '@/components/admin/ContentForms';
import { ActionButton } from '@/components/admin/ActionButton';
import { Img } from '@/components/Img';
import { adActionA } from '@/lib/actions/admin';

export const metadata = { title: 'Featured ads' };

export default async function Page() {
  await requireSuperadmin();
  const ads = await listAds();
  return (
    <>
      <PageHeader title="Featured ads" subtitle="Sponsored products shown on the marketplace home page and store pages." actions={<AdForm />} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ads.length === 0 && <p className="card px-6 py-14 text-center text-sm text-subtle sm:col-span-3">No ads yet.</p>}
        {ads.map((a: any) => (
          <div key={a._id} className={`card overflow-hidden ${a.isActive ? '' : 'opacity-60'}`}>
            <span className="block aspect-[16/9] bg-canvas"><Img src={realImage(a.imageUrl)} alt={a.productName} /></span>
            <div className="p-4">
              <p className="font-bold">{a.productName}</p>
              <p className="text-sm text-subtle">{a.businessName} · {formatCurrency(a.price || 0, a.currency || '₦')} · {a.position}</p>
              <p className="truncate text-xs text-subtle">{a.storeUrl}</p>
              <div className="mt-3 flex gap-2">
                <ActionButton action={adActionA.bind(null, a._id, 'toggle')}>{a.isActive ? 'Pause' : 'Activate'}</ActionButton>
                <ActionButton action={adActionA.bind(null, a._id, 'delete')} confirm="Delete this ad?" danger>Delete</ActionButton>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
