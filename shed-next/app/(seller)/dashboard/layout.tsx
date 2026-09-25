import type { Metadata } from 'next';
import { requireSeller } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';
import { daysLeftInTrial } from '@/lib/server/subscription';
import { DashboardShell } from '@/components/dashboard/Shell';

export const metadata: Metadata = { title: { default: 'Dashboard', template: '%s · Shed dashboard' }, robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Pages enforce the lockout themselves (billing must stay reachable when locked).
  const ctx = await requireSeller({ allowLocked: true, anyRole: true });
  const db = await getDb();
  const unread = await db.collection('messages').countDocuments({ $or: [{ recipientId: ctx.admin._id }, { recipientId: null }], read: { $ne: true }, deleted: { $ne: true } });
  const sub = ctx.admin.subscription;
  return (
    <DashboardShell
      user={{
        name: ctx.displayName,
        role: ctx.role,
        isOwner: ctx.userType === 'admin',
        businessName: ctx.admin.businessName || ctx.admin.username,
        username: ctx.admin.username,
        logo: ctx.admin.logo || null,
        unread,
        trialDaysLeft: sub?.status === 'trial' && !sub.legacyAccount ? daysLeftInTrial(ctx.admin) : null,
        locked: ctx.locked,
      }}
    >
      {children}
    </DashboardShell>
  );
}
