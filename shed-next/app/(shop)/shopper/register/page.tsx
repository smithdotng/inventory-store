import Link from 'next/link';
import { AuthCard } from '@/components/shopper/AuthCard';
import { ShopperRegister } from '@/components/shopper/ShopperAuthForms';

export const metadata = { title: 'Create an account' };

export default function Page({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams.next || '/shopper/account';
  return (
    <AuthCard title="Create your account" subtitle="Save your cart, pay online and keep every receipt in one place." footer={<>Already have an account? <Link href={`/shopper/login?next=${encodeURIComponent(next)}`} className="font-semibold text-ink hover:underline">Sign in</Link></>}>
      <ShopperRegister next={next} />
    </AuthCard>
  );
}
