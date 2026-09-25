import { AuthCard } from '@/components/shopper/AuthCard';
import { ShopperVerify } from '@/components/shopper/ShopperAuthForms';

export const metadata = { title: 'Verify your email' };

export default function Page({ searchParams }: { searchParams: { email?: string; next?: string } }) {
  return (
    <AuthCard title="Check your email" subtitle={<>Enter the 6-digit code we sent to <strong className="text-ink">{searchParams.email}</strong>.</>}>
      <ShopperVerify email={searchParams.email || ''} next={searchParams.next || '/shopper/account'} />
    </AuthCard>
  );
}
