import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { OutletLoginForm } from '@/components/outlet/OutletLoginForm';
import { currentOutlet } from '@/lib/server/seller/outlets';

export const metadata = { title: 'Outlet sign in' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  if (await currentOutlet()) redirect('/outlet-portal');
  return (
    <AuthShell title="Outlet sign in" subtitle="Use the outlet username and password your store owner gave you." footer={<>Store owner? <Link href="/admin-login" className="font-semibold text-ink hover:underline">Seller sign in</Link></>}>
      <OutletLoginForm />
    </AuthShell>
  );
}
