import { redirect } from 'next/navigation';
import { currentOutlet } from '@/lib/server/seller/outlets';
import { OutletSell } from '@/components/outlet/OutletSell';
import { serialize } from '@/lib/server/db';

export const metadata = { title: 'Sell' };

export default async function Page() {
  const cur = await currentOutlet();
  if (!cur) redirect('/outlet-login');
  const items = serialize((cur.outlet.inventory || []).filter((i: any) => i.stock > 0).map((i: any) => ({ id: String(i.id || i._id), name: i.name, cost: Number(i.cost) || 0, stock: i.stock })));
  return <OutletSell items={items} currency={cur.admin?.currency || '₦'} />;
}
