import Link from 'next/link';
import { requireSeller } from '@/lib/server/auth';
import { listProducts } from '@/lib/server/seller/catalog';
import { cn, formatCurrency } from '@/lib/format';
import { PageHeader } from '@/components/dashboard/ui';
import { InventoryManager } from '@/components/dashboard/InventoryManager';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Inventory' };

export default async function InventoryPage({ searchParams }: { searchParams: { q?: string; filter?: string; new?: string } }) {
  const ctx = await requireSeller({ roles: ['stock_clerk'] });
  const filter = searchParams.filter === 'low' || searchParams.filter === 'out' ? searchParams.filter : '';
  const { items, counts } = await listProducts(ctx, { q: searchParams.q, filter });
  const cur = ctx.admin.currency || '₦';
  const tab = (key: string, label: string, n: number) => {
    const qs = new URLSearchParams();
    if (key) qs.set('filter', key);
    if (searchParams.q) qs.set('q', searchParams.q);
    return (
      <Link key={key} href={`/dashboard/inventory${qs.size ? `?${qs}` : ''}`} className={cn('chip', filter === key && 'chip-active')}>
        {label} <span className="opacity-60">{n}</span>
      </Link>
    );
  };
  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={<>{counts.all} products · stock value {formatCurrency(counts.value || 0, cur)}</>}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-ink" action="/dashboard/inventory">
          <Icon name="search" size={18} className="text-subtle" />
          {filter && <input type="hidden" name="filter" value={filter} />}
          <input name="q" defaultValue={searchParams.q} placeholder="Search products" className="h-full w-full bg-transparent text-[15px] outline-none" />
        </form>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {tab('', 'All', counts.all)}
          {tab('low', 'Low stock', counts.low)}
          {tab('out', 'Out of stock', counts.out)}
        </div>
      </div>
      <InventoryManager items={items} currency={cur} vatEnabled={!!ctx.admin.applyVat} openNew={searchParams.new === '1'} storeUrl={`/store/${ctx.admin.username}`} />
    </>
  );
}
