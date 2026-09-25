import { searchStores } from '@/lib/server/store';
import { handler, intParam, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  const limit = intParam(u.get('limit'), 10);
  const r = await searchStores({ q: u.get('q') || '', category: u.get('category') || undefined, page: intParam(u.get('page'), 1), limit });
  return json({ ...r, results: r.results.map((s) => ({ ...s, url: `/store/${s.username}` })), limit });
});
