import { getDb } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    await db.collection('outlets').findOne({});
    return Response.json({ status: 'ok', message: 'Database connected' });
  } catch (e: any) {
    return Response.json({ status: 'error', message: e?.message }, { status: 500 });
  }
}
