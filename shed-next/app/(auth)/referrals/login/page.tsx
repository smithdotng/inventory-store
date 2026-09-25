import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { AffiliateLogin } from '@/components/referrals/Forms';
import { currentAffiliate } from '@/lib/server/public/affiliates';

export const metadata = { title: 'Affiliate sign in' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: { message?: string } }) {
  if (await currentAffiliate()) redirect('/referrals/dashboard');
  return (
    <AuthShell title="Affiliate sign in" subtitle="Track your referral clicks and signups." footer={<><Link href="/referrals/forgot-password" className="hover:text-ink">Forgot password?</Link> · New? <Link href="/referrals/signup" className="font-semibold text-ink hover:underline">Join the affiliate programme</Link></>}>
      <AffiliateLogin message={searchParams.message} />
    </AuthShell>
  );
}
