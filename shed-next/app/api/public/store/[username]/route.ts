import { getPublicStore } from '@/lib/server/store';
import { handler, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = handler(async (_req: Request, { params }: { params: { username: string } }) => {
  const { store, products } = await getPublicStore(params.username);
  return json({ store, products });
});
