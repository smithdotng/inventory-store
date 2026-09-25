import type { Metadata } from 'next';
import { ResetPasswordPage } from '@/components/auth/ResetPasswordPage';

export const metadata: Metadata = { title: 'Reset password' };
export const dynamic = 'force-dynamic';

/** Superadmin-initiated reset links (/reset-password/:token). */
export default function Page({ params }: { params: { token: string } }) {
  return <ResetPasswordPage token={params.token} />;
}
