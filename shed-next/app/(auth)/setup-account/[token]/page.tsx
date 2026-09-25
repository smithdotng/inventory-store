import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { SetupAccountForm } from '@/components/auth/SetupAccountForm';
import { Alert } from '@/components/forms';
import { findInvitation } from '@/lib/server/seller/account';

export const metadata: Metadata = { title: 'Set up your account' };
export const dynamic = 'force-dynamic';

export default async function SetupAccountPage({ params }: { params: { token: string } }) {
  const invite = await findInvitation(params.token);
  if (!invite) {
    return (
      <AuthShell title="Invitation expired" footer={<Link href="/admin-login" className="font-semibold text-ink hover:underline">Go to sign in</Link>}>
        <Alert>This invitation link is invalid or has expired. Ask your store owner to resend it.</Alert>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`Join ${invite.businessName}`} subtitle={<>Hi {invite.firstName}, choose a password to finish setting up <strong className="text-ink">{invite.email}</strong>.</>}>
      <SetupAccountForm token={params.token} />
    </AuthShell>
  );
}
