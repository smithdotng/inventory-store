import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { AffiliateForgot } from '@/components/referrals/Forms';

export const metadata = { title: 'Reset affiliate password' };

export default function Page() {
  return (
    <AuthShell title="Reset your password" footer={<Link href="/referrals/login" className="font-semibold text-ink hover:underline">Back to sign in</Link>}>
      <AffiliateForgot />
    </AuthShell>
  );
}
