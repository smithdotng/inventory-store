import { signOut } from '@/lib/server/auth-actions';
import { handler, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  await signOut();
  return json({ success: true });
});
