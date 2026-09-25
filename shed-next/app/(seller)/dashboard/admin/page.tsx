import { requireSuperadmin } from '@/lib/server/auth';
import Link from 'next/link';
import { listStores, platformStats } from '@/lib/server/admin/superadmin';
import { cn, formatCurrency, realImage } from '@/lib/format';
import { Flash, PageHeader, Stat, fmtDate } from '@/components/dashboard/ui';
import { Img } from '@/components/Img';
import { Icon } from '@/components/Icon';
import { ActionButton } from '@/components/admin/ActionButton';
import { activateLegacyStoresA } from '@/lib/actions/admin';

export const metadata = { title: 'Stores' };

const FILTERS = [['', 'All'], ['trial', 'On trial'], ['paying', 'Paying'], ['locked', 'Locked'], ['unverified', 'Awaiting verification']];
const SUB: Record<string, string> = { trial: 'Trial', active: 'Paying', comped: 'Comped', legacy: 'Legacy', expired: 'Expired', past_due: 'Past due', canceled: 'Cancelled' };

export default async function AdminStores({ searchParams }: { searchParams: { q?: string; filter?: string; ok?: string } }) {
  await requireSuperadmin();
  const [stats, rows] = await Promise.all([platformStats(), listStores(searchParams.q || '', searchParams.filter || '')]);
  return (
    <>
      <PageHeader title="Shed platform" subtitle="Every store on Shed, their plan and activity." actions={<ActionButton action={activateLegacyStoresA} confirm="Mark every store without an 'active' flag as active?">Fix older stores</ActionButton>} />
      <Flash ok={searchParams.ok} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Stores" icon="store" value={stats.stores} hint={`+${stats.newStores30} in 30 days`} />
        <Stat label="Sales (30 days)" icon="receipt" value={stats.sales30} hint={formatCurrency(stats.gmv30, '₦')} />
        <Stat label="Shoppers" icon="user" value={stats.shoppers} hint={`${stats.affiliates} affiliates · ${stats.outlets} outlets`} />
        <Stat label="Needs attention" icon="info" value={stats.flags + stats.contact} hint={`${stats.flags} payment flags · ${stats.contact} messages`} tone={stats.flags ? 'warn' : 'default'} href="/dashboard/admin/support" />
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form action="/dashboard/admin" className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-ink">
          <Icon name="search" size={18} className="text-subtle" />
          {searchParams.filter && <input type="hidden" name="filter" value={searchParams.filter} />}
          <input name="q" defaultValue={searchParams.q} placeholder="Search name, username or email" className="h-full w-full bg-transparent outline-none" />
        </form>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {FILTERS.map(([k, l]) => (
            <Link key={k} href={`/dashboard/admin?${new URLSearchParams({ ...(k ? { filter: k } : {}), ...(searchParams.q ? { q: searchParams.q } : {}) })}`} className={cn('chip', (searchParams.filter || '') === k && 'chip-active')}>{l}</Link>
          ))}
        </div>
      </div>
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-subtle">No stores match.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((a: any) => (
              <li key={a._id}>
                <Link href={`/dashboard/admin/stores/${a.username}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-canvas sm:flex-nowrap sm:px-5">
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-line"><Img src={realImage(a.logo)} alt={a.businessName || a.username} fallback="store" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm font-semibold">{a.businessName || a.username}{a.isVerified && <Icon name="check" size={14} className="text-success" />}</span>
                    <span className="block truncate text-xs text-subtle">@{a.username} · {a.email || 'no email'} · joined {fmtDate(a.createdAt)}</span>
                  </span>
                  <span className="hidden w-32 text-xs text-subtle md:block">{a.products} products<br />{a.salesCount} sales · {a.onlineOrders} online</span>
                  <span className="hidden w-28 text-xs text-subtle lg:block">{a.lastLogin ? `Seen ${fmtDate(a.lastLogin)}` : 'Never signed in'}</span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', a.locked ? 'bg-danger-soft text-danger' : a.subStatus === 'active' ? 'bg-success-soft text-success' : a.subStatus === 'trial' ? 'bg-brand-soft text-brand-dark' : 'bg-canvas text-subtle')}>{a.locked ? 'Locked' : SUB[a.subStatus] || a.subStatus}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
