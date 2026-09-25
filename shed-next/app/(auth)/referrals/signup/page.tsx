import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { AffiliateSignup } from '@/components/referrals/Forms';

export const metadata = { title: 'Become a Shed affiliate' };

export default function Page() {
  return (
    <AuthShell title="Become a Shed affiliate" subtitle="Share your link with business owners and earn rewards when they open a Shed store." footer={<>Already an affiliate? <Link href="/referrals/login" className="font-semibold text-ink hover:underline">Sign in</Link></>}>
      <AffiliateSignup />
    </AuthShell>
  );
}
