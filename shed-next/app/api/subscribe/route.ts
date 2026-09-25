import { getDb } from '@/lib/server/db';
import { handler, json, readBody } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

/** Newsletter signup from the landing page (5 attempts / 15 min per IP). */
export const POST = handler(async (req: Request) => {
  if (!rateLimit(`subscribe:${req.headers.get('x-forwarded-for') || 'local'}`, 5, 15 * 60_000)) {
    return json({ message: 'Too many subscription attempts from this IP, please try again later' }, 429);
  }
  const { email } = await readBody(req);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ message: 'Please provide a valid email address' }, 400);
  const db = await getDb();
  if (await db.collection('subscriptions').findOne({ email })) return json({ message: 'This email is already subscribed' }, 409);
  await db.collection('subscriptions').insertOne({ email, subscribedAt: new Date(), source: 'landing_page', active: true });
  return json({ message: 'Subscription successful' }, 201);
});
