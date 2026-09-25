import { signIn } from '@/lib/server/auth-actions';
import { handler, json, readBody } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  const { usernameOrEmail, password } = await readBody(req);
  const r = await signIn(usernameOrEmail, password);
  if (!r.ok) return json({ error: r.error }, 401);
  return json({ success: true, role: r.role, username: r.username, redirect: r.redirect });
});
