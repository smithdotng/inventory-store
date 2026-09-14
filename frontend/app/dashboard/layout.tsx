import { requireSession } from '@/lib/server-auth';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requireSession();
  return (
    <DashboardShell user={user} business={business}>
      {children}
    </DashboardShell>
  );
}
