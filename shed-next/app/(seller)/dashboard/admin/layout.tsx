import { requireSuperadmin } from '@/lib/server/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();
  return <>{children}</>;
}
