import { getSeller } from '@/lib/server/auth';
import { handler, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const s = await getSeller();
  if (!s) return json({ error: 'Not authenticated' }, 401);
  return json({
    user: { username: s.user.username, role: s.role, userType: s.userType, firstName: s.user.firstName || null },
    business: { adminId: String(s.admin._id), username: s.admin.username, businessName: s.admin.businessName || s.admin.username, logo: s.admin.logo || null, currency: s.admin.currency || '₦' },
    locked: s.locked,
  });
});
