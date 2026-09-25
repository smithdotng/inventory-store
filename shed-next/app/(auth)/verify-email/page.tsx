import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { VerifyEmailForm } from '@/components/auth/VerifyEmailForm';

export const metadata: Metadata = { title: 'Verify your email' };

export default function VerifyEmailPage({ searchParams }: { searchParams: { email?: string } }) {
  const email = searchParams.email || '';
  return (
    <AuthShell title="Check your email" subtitle={<>We sent a 6-digit code to <strong className="text-ink">{email || 'your email'}</strong>. It expires in 15 minutes.</>}>
      <VerifyEmailForm email={email} />
    </AuthShell>
  );
}
