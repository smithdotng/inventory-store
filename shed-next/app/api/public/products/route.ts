import { listProducts } from '@/lib/server/store';
import { handler, intParam, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  return json(await listProducts({ q: u.get('q') || '', category: u.get('category') || '', sort: u.get('sort') || 'newest', page: intParam(u.get('page'), 1), limit: intParam(u.get('limit'), 24) }));
});
