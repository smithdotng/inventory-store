import { requireSeller } from '@/lib/server/auth';
import { listTeam, TEAM_ROLES } from '@/lib/server/seller/account';
import { PageHeader } from '@/components/dashboard/ui';
import { TeamManager } from '@/components/dashboard/TeamManager';

export const metadata = { title: 'Team' };

export default async function TeamPage() {
  const ctx = await requireSeller();
  const users = await listTeam(ctx);
  return (
    <>
      <PageHeader title="Team" subtitle="Give staff their own login. Cashiers only see the point of sale; stock clerks also manage inventory." />
      <TeamManager users={users} roles={TEAM_ROLES} />
    </>
  );
}
