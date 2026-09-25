import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { getSeller } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'Store paused' };
export const dynamic = 'force-dynamic';

/** Shown to team members when the store owner's subscription has lapsed. */
export default async function AccountLockedPage() {
  const s = await getSeller();
  const name = s?.admin?.businessName || 'This store';
  return (
    <AuthShell title="Store paused" subtitle={`${name}'s Shed subscription needs renewing. Please ask the store owner to sign in and renew it under Billing.`}>
      <a href="/admin-logout" className="btn btn-dark btn-lg w-full">Sign out</a>
    </AuthShell>
  );
}
