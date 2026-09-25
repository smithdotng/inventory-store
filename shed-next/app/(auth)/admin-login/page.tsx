import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';
import { dashboardUrl, getSeller } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: { message?: string; error?: string; next?: string } }) {
  const seller = await getSeller();
  if (seller) redirect(dashboardUrl(seller.role));
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your store, stock and sales."
      footer={
        <>
          New to Shed?{' '}
          <Link href="/admin-register" className="font-semibold text-ink hover:underline">
            Create your free store
          </Link>
          <span className="mx-2">·</span>
          <a href="/outlet-login" className="hover:text-ink">Outlet login</a>
        </>
      }
    >
      <LoginForm message={searchParams.message} error={searchParams.error} next={searchParams.next} />
    </AuthShell>
  );
}
