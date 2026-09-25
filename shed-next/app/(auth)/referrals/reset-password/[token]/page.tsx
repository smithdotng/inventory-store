import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { AffiliateReset } from '@/components/referrals/Forms';
import { Alert } from '@/components/forms';
import { affiliateTokenValid } from '@/lib/server/public/affiliates';

export const metadata = { title: 'Choose a new password' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { token: string } }) {
  const ok = await affiliateTokenValid(params.token);
  return (
    <AuthShell title="Choose a new password" footer={<Link href="/referrals/login" className="font-semibold text-ink hover:underline">Back to sign in</Link>}>
      {ok ? <AffiliateReset token={params.token} /> : <Alert>This reset link is invalid or has expired.</Alert>}
    </AuthShell>
  );
}
