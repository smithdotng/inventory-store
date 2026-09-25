import 'server-only';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getClient } from './db';
import { env } from './env';

/**
 * Sessions that are byte-for-byte compatible with the old Express stack
 * (express-session + connect-mongo):
 *   - cookie `connect.sid` = "s:" + sid + "." + base64(HMAC-SHA256(sid, SESSION_SECRET)) (no padding)
 *   - Mongo collection `sessions` in the URI's default database:
 *       { _id: sid, expires: Date, session: JSON.stringify({ cookie, ...data }) }
 *
 * Because the format is shared, a user who signs in on the Next app is also
 * signed in on any Express page still being proxied during the migration (and
 * vice versa). Session data keys are unchanged: admin, adminId, userId, role,
 * username, userType, firstName, shopper, affiliate, outletId, buyer, ...
 */
export const COOKIE_NAME = 'connect.sid';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day, as before

export type SessionData = {
  admin?: string;
  adminId?: string;
  userId?: string;
  role?: string;
  username?: string;
  userType?: 'admin' | 'business_user';
  firstName?: string;
  [key: string]: any;
};

type StoredCookie = { originalMaxAge: number; expires: string; secure: boolean; httpOnly: boolean; path: string };

function sign(value: string) {
  const mac = crypto.createHmac('sha256', env.sessionSecret).update(value).digest('base64').replace(/=+$/, '');
  return `${value}.${mac}`;
}

function unsign(signed: string): string | null {
  const value = signed.slice(0, signed.lastIndexOf('.'));
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signed);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual) ? value : null;
}

async function sessionsCollection() {
  // connect-mongo used MongoStore.create({ mongoUrl }) → the URI's default database.
  const client = await getClient();
  return client.db(process.env.SESSION_DB_NAME || undefined).collection<{ _id: string; expires: Date; session: string }>('sessions');
}

function readSid(): string | null {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return null;
  let v = raw;
  try {
    v = decodeURIComponent(raw);
  } catch {
    /* already decoded */
  }
  if (!v.startsWith('s:')) return null;
  return unsign(v.slice(2));
}

/** Read the current session (read-only; safe in Server Components). */
export async function getSession(): Promise<SessionData | null> {
  const sid = readSid();
  if (!sid) return null;
  const col = await sessionsCollection();
  const doc = await col.findOne({ _id: sid, $or: [{ expires: { $exists: false } }, { expires: { $gt: new Date() } }] } as any);
  if (!doc) return null;
  try {
    const { cookie: _c, ...data } = JSON.parse(doc.session);
    return data as SessionData;
  } catch {
    return null;
  }
}

function newCookieMeta(): StoredCookie {
  return { originalMaxAge: MAX_AGE_MS, expires: new Date(Date.now() + MAX_AGE_MS).toISOString(), secure: env.isProd, httpOnly: true, path: '/' };
}

async function writeSession(sid: string, data: SessionData) {
  const col = await sessionsCollection();
  const cookie = newCookieMeta();
  await col.updateOne(
    { _id: sid },
    { $set: { session: JSON.stringify({ cookie, ...data }), expires: new Date(cookie.expires) } },
    { upsert: true },
  );
  cookies().set(COOKIE_NAME, `s:${sign(sid)}`, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_MS / 1000,
  });
}

/**
 * Start a fresh session (like req.session.regenerate) — call from Server
 * Actions / Route Handlers only, because it sets a cookie.
 */
export async function createSession(data: SessionData, opts: { keep?: string[] } = {}) {
  // `keep` carries other sign-ins over (e.g. a shopper who then signs in as a seller).
  const carried: SessionData = {};
  if (opts.keep?.length) {
    const current = await getSession();
    for (const k of opts.keep) if (current?.[k] !== undefined) carried[k] = current[k];
  }
  const old = readSid();
  const col = await sessionsCollection();
  if (old) await col.deleteOne({ _id: old });
  const sid = crypto.randomBytes(24).toString('base64url'); // new id on every sign-in (no session fixation)
  await writeSession(sid, { ...carried, ...data });
}

export const SELLER_KEYS = ['admin', 'adminId', 'userId', 'role', 'username', 'userType', 'firstName', 'businessName', 'isSuperadmin'];
export const SHOPPER_KEYS = ['shopper', 'buyer'];

/** Merge values into the current session (creating one if needed). */
export async function updateSession(patch: SessionData) {
  const sid = readSid();
  const current = (await getSession()) || {};
  const next = { ...current, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  await writeSession(sid || crypto.randomBytes(24).toString('base64url'), next);
}

/**
 * Sign one identity out while keeping the others (a browser can be signed in as
 * a shopper and a seller at once). Destroys the session when nothing is left.
 */
export async function removeFromSession(keys: string[]) {
  const current = await getSession();
  if (!current) return;
  const rest: SessionData = { ...current };
  for (const k of keys) delete rest[k];
  const identities = ['admin', 'userId', 'shopper', 'affiliate', 'outletId'];
  if (identities.some((k) => rest[k])) {
    const sid = readSid();
    if (sid) await writeSession(sid, rest);
  } else {
    await destroySession();
  }
}

/** Destroy the session (like req.session.destroy). */
export async function destroySession() {
  const sid = readSid();
  if (sid) await (await sessionsCollection()).deleteOne({ _id: sid });
  cookies().delete(COOKIE_NAME);
}
