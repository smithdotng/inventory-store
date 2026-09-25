import { runSubscriptionSweep } from '@/lib/server/jobs/subscriptions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily subscription sweep. Call with `Authorization: Bearer $CRON_SECRET`
 * (Vercel Cron does this automatically when CRON_SECRET is set), or let the
 * built-in daily timer in instrumentation.ts run it on a normal Node server.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  return Response.json({ ok: true, ...(await runSubscriptionSweep()) });
}
