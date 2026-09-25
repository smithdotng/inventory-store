import { suggestions } from '@/lib/server/store';
import { handler, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  return json(await suggestions(u.get('q') || '', u.get('type') || 'all'));
});
