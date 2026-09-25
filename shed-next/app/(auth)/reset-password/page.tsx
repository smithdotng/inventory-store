import type { Metadata } from 'next';
import { ResetPasswordPage } from '@/components/auth/ResetPasswordPage';

export const metadata: Metadata = { title: 'Reset password' };
export const dynamic = 'force-dynamic';

export default function Page({ searchParams }: { searchParams: { token?: string } }) {
  return <ResetPasswordPage token={searchParams.token || ''} />;
}
