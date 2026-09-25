import { getPublicProduct } from '@/lib/server/store';
import { handler, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = handler(async (_req: Request, { params }: { params: { username: string; id: string } }) => {
  const { store, product } = await getPublicProduct(params.username, params.id);
  return json({ store, product });
});
