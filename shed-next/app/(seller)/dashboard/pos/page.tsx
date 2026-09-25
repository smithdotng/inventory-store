import { requireSeller } from '@/lib/server/auth';
import { sellableProducts, customerOptions } from '@/lib/server/seller/catalog';
import { PosTerminal } from '@/components/dashboard/PosTerminal';

export const metadata = { title: 'Point of sale' };

export default async function PosPage() {
  const ctx = await requireSeller({ roles: ['cashier', 'stock_clerk'] });
  const canPickCustomers = ['admin', 'superadmin'].includes(ctx.role);
  const [products, customers] = await Promise.all([sellableProducts(ctx), canPickCustomers ? customerOptions(ctx) : Promise.resolve([])]);
  return (
    <PosTerminal
      products={products}
      customers={customers}
      currency={ctx.admin.currency || '₦'}
      vat={ctx.admin.applyVat ? Number(ctx.admin.vatRate) || 0 : 0}
    />
  );
}
