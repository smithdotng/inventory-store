import type { Metadata } from 'next';
import Link from 'next/link';
import { dashboardGet } from '@/lib/server-auth';
import { formatCurrency } from '@/lib/format';
import { PageHeader, StatCard, Panel, EmptyState } from '@/components/dashboard/ui';

export const metadata: Metadata = { title: 'Dashboard' };

interface Overview {
  business: { businessName: string; currency: string; username: string };
  kpis: {
    revenue: number;
    sales: number;
    products: number;
    customers: number;
    lowStock: number;
    pendingPayments: number;
    outlets: number;
  };
  outlets: { _id: string; name: string; username: string | null; totalCommissionDue: number }[];
}

export default async function DashboardHome() {
  const data = await dashboardGet<Overview>('/api/admin/overview');
  const c = data.business.currency;
  const k = data.kpis;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${data.business.businessName}`}
        subtitle="Here's how your business is doing."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatCurrency(k.revenue, c)} accent />
        <StatCard label="Sales" value={k.sales} hint="all-time orders" />
        <StatCard label="Products" value={k.products} hint={`${k.lowStock} low on stock`} />
        <StatCard label="Customers" value={k.customers} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Pending payments" value={k.pendingPayments} />
        <StatCard label="Outlets" value={k.outlets} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Outlets"
          action={
            <Link href="/dashboard/transactions" className="text-sm font-semibold text-primary-hover hover:underline">
              View sales
            </Link>
          }
        >
          {data.outlets.length === 0 ? (
            <EmptyState>No outlets yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {data.outlets.map((o) => (
                <li key={o._id} className="flex items-center justify-between px-5 py-4">
                  <span className="font-medium">{o.name}</span>
                  <span className="text-sm text-subtle">
                    {formatCurrency(o.totalCommissionDue, c)} due
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Quick actions">
          <div className="grid grid-cols-2 gap-3 p-5">
            {[
              { label: 'Add product', href: '/dashboard/products' },
              { label: 'Record invoice', href: '/dashboard/invoices' },
              { label: 'Add customer', href: '/dashboard/customers' },
              { label: 'Edit profile', href: '/dashboard/profile' },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="rounded-xl border border-line px-4 py-4 text-sm font-semibold transition-colors hover:border-ink"
              >
                {a.label}
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
