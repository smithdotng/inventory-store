import 'server-only';
import { MongoClient, ObjectId, type Db, type Filter, type Document } from 'mongodb';
import bcrypt from 'bcryptjs';
import { env } from './env';

export { ObjectId };

/**
 * One MongoClient per server process (cached on globalThis so Next's dev
 * hot-reload doesn't open a new pool on every edit).
 */
type Cache = { client?: MongoClient; clientPromise?: Promise<MongoClient>; initialised?: Promise<void> };
const g = globalThis as unknown as { __shedMongo?: Cache };
const cache: Cache = (g.__shedMongo ||= {});

export async function getClient(): Promise<MongoClient> {
  if (cache.client) return cache.client;
  if (!env.mongoUri) throw new Error('MONGO_URI is not set');
  cache.clientPromise ||= new MongoClient(env.mongoUri).connect().then((c) => {
    cache.client = c;
    return c;
  });
  return cache.clientPromise;
}

/** The app database (DB_NAME), same as the Express app's getDb(). */
export async function getDb(): Promise<Db> {
  const client = await getClient();
  const db = client.db(env.dbName);
  cache.initialised ||= initialiseDb(db).catch((e) => {
    console.warn('DB initialisation warning:', e?.message);
  });
  return db;
}

/** Helpers */
export const oid = (id: unknown): ObjectId | null => {
  if (id instanceof ObjectId) return id;
  if (typeof id === 'string' && ObjectId.isValid(id)) return new ObjectId(id);
  return null;
};
export const escapeRegex = (s: string) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const ci = (s: string) => ({ $regex: `^${escapeRegex(s)}$`, $options: 'i' }) as Filter<Document>;

/** Plain-JSON copy (ObjectIds -> strings, Dates -> ISO) for passing to client components. */
export function serialize<T>(value: T): any {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Port of config/db.js: indexes + first-run superadmin seed. Runs once per process.
 */
async function initialiseDb(db: Db) {
  const idx = async (name: string, key: Document, options: Document = {}) => {
    try {
      await db.collection(name).createIndex(key, options);
    } catch (e: any) {
      if (!/already exists|same name/i.test(e?.message || '')) console.warn(`Index ${name}:`, e?.message);
    }
  };

  const specs: [string, Document, Document?][] = [
    ['subscriptions', { email: 1 }, { unique: true }],
    ['business_users', { email: 1 }, { unique: true }],
    ['business_users', { username: 1 }, { unique: true }],
    ['business_users', { adminId: 1 }],
    ['business_users', { role: 1 }],
    ['business_users', { status: 1 }],
    ['business_users', { invitationToken: 1 }],
    ['business_users', { adminId: 1, status: 1 }],
    ['login_logs', { userId: 1 }],
    ['login_logs', { loginTime: -1 }],
    ['login_logs', { role: 1 }],
    ['login_logs', { userId: 1, loginTime: -1 }],
    ['inventory', { adminId: 1 }],
    ['inventory', { name: 1 }],
    ['inventory', { adminId: 1, name: 1 }],
    ['admins', { clusterId: 1 }],
    ['admins', { category: 1 }],
    ['outlets', { adminId: 1 }],
    ['outlets', { username: 1 }, { unique: true }],
    ['sales', { adminId: 1 }],
    ['sales', { outletId: 1 }],
    ['sales', { date: -1 }],
    ['sales', { adminId: 1, date: -1 }],
    ['customers', { adminId: 1 }],
    ['customers', { email: 1 }],
    ['customers', { adminId: 1, email: 1 }],
    ['commissions', { adminId: 1 }],
    ['commissions', { outletId: 1 }],
    ['commissions', { status: 1 }],
    ['messages', { recipientId: 1 }],
    ['messages', { senderId: 1 }],
    ['messages', { createdAt: -1 }],
    ['messages', { recipientId: 1, read: 1 }],
    ['affiliates', { email: 1 }, { unique: true }],
    ['affiliates', { referralCode: 1 }, { unique: true }],
    ['referral_activities', { affiliateId: 1 }],
    ['referral_activities', { date: -1 }],
    ['invoice_tokens', { saleId: 1 }],
    ['invoice_tokens', { token: 1 }],
    ['invoice_tokens', { expires: 1 }],
    ['password_resets', { token: 1 }],
    ['password_resets', { expires: 1 }],
    ['broadcast_logs', { initiatedBy: 1 }],
    ['broadcast_logs', { startTime: -1 }],
    ['broadcast_logs', { status: 1 }],
    ['shoppers', { email: 1 }, { unique: true }],
    ['shopper_verifications', { email: 1 }, { unique: true }],
    ['shopper_verifications', { expiresAt: 1 }],
    ['carts', { shopperId: 1 }, { unique: true }],
    ['subscription_charges', { adminId: 1 }],
    ['subscription_charges', { createdAt: -1 }],
    ['subscription_charges', { flwRef: 1 }],
    ['pending_cart_orders', { txRef: 1 }, { unique: true }],
    ['pending_cart_orders', { shopperId: 1 }],
    ['pending_cart_orders', { createdAt: 1 }],
    ['market_clusters', { slug: 1 }, { unique: true }],
    ['market_clusters', { isActive: 1 }],
  ];
  for (const [name, key, opts] of specs) await idx(name, key, opts);

  const admins = db.collection('admins');
  if ((await admins.countDocuments()) === 0) {
    await admins.insertOne({
      username: 'superadmin',
      password: await bcrypt.hash('superadmin123', 10),
      role: 'superadmin',
      businessName: 'Shed Administration',
      email: 'admin@shed.ng',
      firstName: 'Super',
      lastName: 'Admin',
      logo: '/images/logo.png',
      currency: '₦',
      country: 'NG',
      applyVat: false,
      vatRate: 0,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Initial superadmin account seeded');
  }
}
