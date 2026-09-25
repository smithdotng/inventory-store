import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { activeClusters, trackReferralClick } from '@/lib/server/auth-actions';
import { BUSINESS_CATEGORIES } from '@/lib/server/categories';

export const metadata: Metadata = { title: 'Create your store' };
export const dynamic = 'force-dynamic';

export default async function RegisterPage({ searchParams }: { searchParams: { ref?: string } }) {
  const ref = searchParams.ref || null;
  const [clusters] = await Promise.all([activeClusters().catch(() => []), trackReferralClick(ref).catch(() => undefined)]);
  return (
    <AuthShell
      wide
      title="Create your Shed store"
      subtitle="Free for 14 days, then a simple monthly plan. No card needed to start."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/admin-login" className="font-semibold text-ink hover:underline">Sign in</Link>
        </>
      }
    >
      <RegisterForm referralCode={ref} categories={BUSINESS_CATEGORIES} clusters={clusters} />
    </AuthShell>
  );
}
