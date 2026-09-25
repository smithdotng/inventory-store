import 'server-only';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb, oid, serialize } from '../db';
import { getSession, updateSession, createSession, removeFromSession, SELLER_KEYS } from '../session';
import { sendMailSafe } from '../mailer';
import { env } from '../env';
import { escapeHtml } from '../store';

/* Shopper accounts (port of shopperController.js + buyerController.js).
 * The old OTP-only "buyer profile" login is merged in as "email me a sign-in code". */

export interface ShopperSession {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export class ShopperError extends Error {
  status = 400;
}

const OTP_TTL = 15 * 60 * 1000;
const code = () => crypto.randomInt(100000, 1000000).toString();
const SHOPPER_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function codeEmail(firstName: string | undefined, c: string, purpose: 'verify' | 'login') {
  const intro = purpose === 'verify' ? 'Thanks for creating a Shed account! Enter this code to confirm your email:' : 'Enter this code to sign in to your Shed account:';
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px"><h2 style="color:#141414;">${purpose === 'verify' ? 'Verify your email' : 'Your sign-in code'}</h2><p>Hi ${escapeHtml(firstName || 'there')}, ${intro}</p><div style="font-size:2.2rem;font-weight:700;letter-spacing:.3em;color:#FF9800;padding:20px 0;">${c}</div><p style="color:#888;font-size:0.85rem;">This code expires in 15 minutes. If you didn't request it, you can ignore this email.</p></div>`;
}

export async function currentShopper(): Promise<ShopperSession | null> {
  const s = await getSession();
  return (s?.shopper as ShopperSession) || null;
}

async function signInShopper(shopper: any) {
  const sessionData: ShopperSession = { id: String(shopper._id), email: shopper.email, firstName: shopper.firstName || '', lastName: shopper.lastName || '' };
  // Keep a seller session (if any) — only the shopper part changes.
  await createSession({ shopper: sessionData }, { keep: [...SELLER_KEYS, 'affiliate'] });
  const db = await getDb();
  await db.collection('shoppers').updateOne({ _id: shopper._id }, { $set: { lastLogin: new Date() } });
}

export async function signOutShopper() {
  await removeFromSession(['shopper', 'buyer']);
}

export async function startShopperRegistration(i: { firstName: string; lastName: string; email: string; phone: string; password: string; confirmPassword: string }) {
  const email = (i.email || '').trim().toLowerCase();
  if (!i.firstName?.trim() || !i.lastName?.trim()) throw new ShopperError('First name and last name are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ShopperError('Please enter a valid email address.');
  if (!i.phone || i.phone.replace(/\D/g, '').length < 7) throw new ShopperError('Please enter a valid phone number.');
  if (!SHOPPER_PASSWORD.test(i.password || '')) throw new ShopperError('Password must be at least 8 characters, with an uppercase letter, a lowercase letter and a number.');
  if (i.password !== i.confirmPassword) throw new ShopperError('Passwords do not match.');
  const db = await getDb();
  if (await db.collection('shoppers').findOne({ email })) throw new ShopperError('An account with that email already exists. Try signing in instead.');
  const c = code();
  await db.collection('shopper_verifications').updateOne(
    { email },
    { $set: { otp: c, pendingShopper: { firstName: i.firstName.trim(), lastName: i.lastName.trim(), email, phone: i.phone.trim(), password: await bcrypt.hash(i.password, 10) }, expiresAt: new Date(Date.now() + OTP_TTL) } },
    { upsert: true },
  );
  sendMailSafe({ from: `"Shed" <${env.emailUser}>`, to: email, subject: 'Verify your Shed account', html: codeEmail(i.firstName, c, 'verify') });
  return email;
}

export async function resendShopperCode(emailRaw: string) {
  const email = (emailRaw || '').trim().toLowerCase();
  const db = await getDb();
  const rec = await db.collection('shopper_verifications').findOne({ email });
  if (!rec) throw new ShopperError('No pending sign-up found. Please sign up again.');
  const c = code();
  await db.collection('shopper_verifications').updateOne({ email }, { $set: { otp: c, expiresAt: new Date(Date.now() + OTP_TTL) } });
  sendMailSafe({ from: `"Shed" <${env.emailUser}>`, to: email, subject: 'Your new Shed verification code', html: codeEmail(rec.pendingShopper?.firstName, c, 'verify') });
}

export async function completeShopperRegistration(emailRaw: string, otp: string) {
  const email = (emailRaw || '').trim().toLowerCase();
  const db = await getDb();
  const rec = await db.collection('shopper_verifications').findOne({ email });
  if (!rec) throw new ShopperError('No pending sign-up found for this email.');
  if (new Date() > new Date(rec.expiresAt)) {
    await db.collection('shopper_verifications').deleteOne({ email });
    throw new ShopperError('That code has expired. Please sign up again.');
  }
  if (String(rec.otp) !== String(otp || '').trim()) throw new ShopperError('Incorrect code. Please try again.');
  if (await db.collection('shoppers').findOne({ email })) throw new ShopperError('This email already has an account. Please sign in.');
  const doc = { ...rec.pendingShopper, isEmailVerified: true, createdAt: new Date(), lastLogin: new Date() };
  const r = await db.collection('shoppers').insertOne(doc);
  await db.collection('shopper_verifications').deleteOne({ email });
  await signInShopper({ ...doc, _id: r.insertedId });
}

export async function passwordSignIn(emailRaw: string, password: string) {
  const email = (emailRaw || '').trim().toLowerCase();
  const db = await getDb();
  const shopper = await db.collection('shoppers').findOne({ email });
  if (!shopper || !shopper.password || !(await bcrypt.compare(password || '', shopper.password))) throw new ShopperError('Invalid email or password.');
  await signInShopper(shopper);
}

/** Passwordless: email a 6-digit sign-in code (replaces the old /buyer OTP login). */
export async function sendSignInCode(emailRaw: string) {
  const email = (emailRaw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ShopperError('Please enter a valid email address.');
  const db = await getDb();
  const shopper = await db.collection('shoppers').findOne({ email });
  const c = code();
  await db.collection('buyer_otps').deleteMany({ email });
  await db.collection('buyer_otps').insertOne({ email, otp: c, expires: new Date(Date.now() + OTP_TTL), attempts: 0 });
  sendMailSafe({ from: `"Shed" <${env.emailUser}>`, to: email, subject: 'Your Shed sign-in code', html: codeEmail(shopper?.firstName, c, 'login') });
}

export async function codeSignIn(emailRaw: string, otp: string) {
  const email = (emailRaw || '').trim().toLowerCase();
  const db = await getDb();
  const rec = await db.collection('buyer_otps').findOne({ email });
  if (!rec || new Date() > new Date(rec.expires) || (rec.attempts || 0) >= 5) throw new ShopperError('That code is invalid or has expired. Request a new one.');
  if (String(rec.otp) !== String(otp || '').trim()) {
    await db.collection('buyer_otps').updateOne({ _id: rec._id }, { $inc: { attempts: 1 } });
    throw new ShopperError('Incorrect code. Please try again.');
  }
  await db.collection('buyer_otps').deleteMany({ email });
  let shopper = await db.collection('shoppers').findOne({ email });
  if (!shopper) {
    // First sign-in with a code: create a (password-less) account from any guest-checkout profile.
    const profile = await db.collection('buyer_profiles').findOne({ email });
    const [firstName = '', ...rest] = String(profile?.name || '').trim().split(/\s+/);
    const doc = { firstName, lastName: rest.join(' '), email, phone: profile?.phone || '', password: null, isEmailVerified: true, createdAt: new Date(), lastLogin: new Date() };
    const r = await db.collection('shoppers').insertOne(doc);
    shopper = { ...doc, _id: r.insertedId } as any;
  }
  await signInShopper(shopper);
}

/** Orders for the account page: account orders + earlier guest orders with the same (verified) email. */
export async function shopperOrders(s: ShopperSession) {
  const db = await getDb();
  const sid = oid(s.id);
  const orders = await db
    .collection('sales')
    .aggregate([
      { $match: { source: { $in: ['storefront', 'cart'] }, $or: [...(sid ? [{ shopperId: sid }] : []), { email: s.email }] } },
      { $sort: { date: -1 } },
      { $limit: 100 },
      { $lookup: { from: 'admins', localField: 'adminId', foreignField: '_id', as: 'store' } },
      {
        $project: {
          date: 1, items: 1, totalAmount: 1, paymentStatus: 1, paymentMethod: 1,
          storeName: { $ifNull: [{ $arrayElemAt: ['$store.businessName', 0] }, 'Store'] },
          storeUsername: { $arrayElemAt: ['$store.username', 0] },
          storeLogo: { $arrayElemAt: ['$store.logo', 0] },
          currency: { $ifNull: [{ $arrayElemAt: ['$store.currency', 0] }, '₦'] },
        },
      },
    ])
    .toArray();
  const profile = await db.collection('shoppers').findOne({ _id: sid! }, { projection: { password: 0 } });
  return serialize({ orders, profile });
}

export async function shopperOrderForPdf(s: ShopperSession, saleId: string) {
  const _id = oid(saleId);
  if (!_id) return null;
  const db = await getDb();
  const sid = oid(s.id);
  const sale = await db.collection('sales').findOne({ _id, $or: [...(sid ? [{ shopperId: sid }] : []), { email: s.email }] });
  if (!sale) return null;
  const admin = await db.collection('admins').findOne({ _id: sale.adminId });
  return admin ? { sale, admin } : null;
}

export async function updateShopperProfile(s: ShopperSession, p: { firstName: string; lastName: string; phone: string }) {
  if (!p.firstName.trim()) throw new ShopperError('First name is required.');
  const db = await getDb();
  await db.collection('shoppers').updateOne({ _id: oid(s.id)! }, { $set: { firstName: p.firstName.trim(), lastName: p.lastName.trim(), phone: p.phone.trim(), updatedAt: new Date() } });
  await updateSession({ shopper: { ...s, firstName: p.firstName.trim(), lastName: p.lastName.trim() } });
}
