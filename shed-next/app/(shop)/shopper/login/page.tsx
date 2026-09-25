import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentShopper } from '@/lib/server/shopper/account';
import { AuthCard } from '@/components/shopper/AuthCard';
import { ShopperLogin } from '@/components/shopper/ShopperAuthForms';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: { next?: string; message?: string } }) {
  const next = searchParams.next || '/shopper/account';
  if (await currentShopper()) redirect(next.startsWith('/') ? next : '/shopper/account');
  return (
    <AuthCard
      title="Sign in to shop"
      subtitle="Track your orders and invoices across every Shed store."
      footer={<>New here? <Link href={`/shopper/register?next=${encodeURIComponent(next)}`} className="font-semibold text-ink hover:underline">Create an account</Link> · Selling on Shed? <a href="/admin-login" className="font-semibold text-ink hover:underline">Seller login</a></>}
    >
      <ShopperLogin next={next} message={searchParams.message} />
    </AuthCard>
  );
}
