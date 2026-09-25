import { requireSuperadmin } from '@/lib/server/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStoreDetail } from '@/lib/server/admin/superadmin';
import { BUSINESS_CATEGORIES } from '@/lib/server/categories';
import { formatCurrency, realImage } from '@/lib/format';
import { Money, PageHeader, Panel, StatusBadge, fmtDate } from '@/components/dashboard/ui';
import { Img } from '@/components/Img';
import { ActionButton } from '@/components/admin/ActionButton';
import { EditStoreForm, MessageForm } from '@/components/admin/StoreForms';
import { storeActionA } from '@/lib/actions/admin';

export const metadata = { title: 'Store' };

export default async function StoreAdminPage({ params }: { params: { username: string } }) {
  await requireSuperadmin();
  const d = await getStoreDetail(decodeURIComponent(params.username));
  if (!d) notFound();
  const { admin: a, sales, products, team, outlets, charges, cluster, locked } = d;
  const sub = a.subscription;
  const id = String(a._id);
  const cur = a.currency || '₦';
  return (
    <>
      <PageHeader
        back={{ href: '/dashboard/admin', label: 'All stores' }}
        title={a.businessName || a.username}
        subtitle={<>@{a.username} · {a.email || 'no email'} · {a.phone || 'no phone'} · joined {fmtDate(a.createdAt)}</>}
        actions={<a href={`/store/${a.username}`} target="_blank" rel="noreferrer" className="btn btn-outline">View store</a>}
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Overview">
            <div className="flex items-center gap-4">
              <span className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-line"><Img src={realImage(a.logo)} alt="" fallback="store" /></span>
              <dl className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-subtle">Products</dt><dd className="font-bold">{products}</dd></div>
                <div><dt className="text-subtle">Team</dt><dd className="font-bold">{team.length}</dd></div>
                <div><dt className="text-subtle">Outlets</dt><dd className="font-bold">{outlets.length}</dd></div>
                <div><dt className="text-subtle">Category</dt><dd className="font-bold">{a.category || '—'}</dd></div>
              </dl>
            </div>
            {a.description && <p className="mt-4 text-sm text-ink/75">{a.description}</p>}
          </Panel>
          <Panel title="Recent sales" padded={false}>
            {sales.length === 0 ? <p className="px-5 py-8 text-center text-sm text-subtle">No sales yet.</p> : (
              <ul className="divide-y divide-line">
                {sales.map((s: any) => (
                  <li key={s._id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{s.customerName || 'Walk-in'}</span><span className="text-xs text-subtle">{fmtDate(s.date, true)} · {s.source || 'sale'}</span></span>
                    <StatusBadge status={s.paymentStatus} />
                    <Money value={s.totalAmount || 0} currency={cur} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Edit account"><EditStoreForm store={{ id, businessName: a.businessName || '', username: a.username, email: a.email || '', phone: a.phone || '', currency: a.currency || '₦', role: a.role || 'admin', category: a.category || '' }} categories={BUSINESS_CATEGORIES} /></Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Plan">
            <p className="text-sm">
              {!sub || sub.legacyAccount ? 'Legacy account — free, never locked.' : <>Status <strong>{sub.status}</strong>{sub.trialEndsAt && sub.status === 'trial' ? ` · trial ends ${fmtDate(sub.trialEndsAt)}` : ''}{sub.currentPeriodEnd ? ` · renews ${fmtDate(sub.currentPeriodEnd)}` : ''}</>}
              {locked && <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">Locked</span>}
            </p>
            {sub && !sub.legacyAccount && (
              <div className="mt-4 flex flex-wrap gap-2">
                {sub.status !== 'comped' ? <ActionButton action={storeActionA.bind(null, id, 'comp')}>Grant free access</ActionButton> : <ActionButton action={storeActionA.bind(null, id, 'uncomp')}>Remove free access</ActionButton>}
                <ActionButton action={storeActionA.bind(null, id, 'extendTrial')}>Extend trial 14 days</ActionButton>
              </div>
            )}
            {charges.length > 0 && <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs">{charges.map((c: any) => <li key={c._id} className="flex justify-between"><span>{fmtDate(c.createdAt)}</span><span className={c.status === 'successful' ? 'text-success' : 'text-danger'}>{c.status}</span><span>{formatCurrency(c.amount, '₦')}</span></li>)}</ul>}
          </Panel>
          <Panel title="Marketplace">
            <p className="text-sm">{cluster ? <>Market: <Link href={`/cluster/${cluster.slug}`} className="font-semibold underline">{cluster.name}</Link></> : 'Not in a market cluster.'} {a.isVerified ? <span className="font-semibold text-success">· Verified</span> : <span className="text-brand-dark">· Not verified</span>}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {a.isVerified ? <ActionButton action={storeActionA.bind(null, id, 'unverify')}>Remove verification</ActionButton> : <ActionButton action={storeActionA.bind(null, id, 'verify')} className="btn btn-brand h-9 min-h-0 px-3 text-sm">Verify store</ActionButton>}
              {a.active === false ? <ActionButton action={storeActionA.bind(null, id, 'activate')}>Show on marketplace</ActionButton> : <ActionButton action={storeActionA.bind(null, id, 'deactivate')} confirm="Hide this store from the marketplace?">Hide from marketplace</ActionButton>}
            </div>
          </Panel>
          <Panel title="Send a message"><MessageForm recipientId={id} /></Panel>
          <Panel title="Account">
            <div className="flex flex-wrap gap-2">
              <ActionButton action={storeActionA.bind(null, id, 'resetPassword')}>Email password reset</ActionButton>
              <ActionButton action={storeActionA.bind(null, id, 'delete')} confirm={`Permanently delete ${a.businessName || a.username}'s account? Their sales and products stay in the database but the login is removed.`} danger>Delete account</ActionButton>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
