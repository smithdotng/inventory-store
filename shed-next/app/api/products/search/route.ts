import { listProducts } from '@/lib/server/store';
import { handler, intParam, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Legacy endpoint (kept for old clients) — now backed by the marketplace listing. */
export const GET = handler(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  const q = (u.get('q') || '').trim();
  const limit = intParam(u.get('limit'), 15);
  if (!q) return json({ success: true, results: [], total: 0, page: 1, pages: 0 });
  return json({ ...(await listProducts({ q, page: intParam(u.get('page'), 1), limit })), limit });
});
