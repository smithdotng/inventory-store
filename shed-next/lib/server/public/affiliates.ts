import 'server-only';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb, oid, ci, serialize } from '../db';
import { getSession, updateSession } from '../session';
import { sendMailSafe } from '../mailer';
import { env } from '../env';
import { escapeHtml } from '../store';

/* Affiliate / referral programme (port of referralController.js). */

export class AffiliateError extends Error {
  status = 400;
}

export const referralLink = (code: string) => `${env.baseUrl}/admin-register?ref=${code}`;

export async function currentAffiliate() {
  const s = await getSession();
  const _id = oid(s?.affiliate);
  if (!_id) return null;
  const db = await getDb();
  return db.collection('affiliates').findOne({ _id }, { projection: { password: 0, resetToken: 0 } });
}

export async function affiliateSignup(i: { firstName: string; lastName: string; email: string; country: string; countryCode: string; mobileNumber: string; password: string }) {
  const email = (i.email || '').trim().toLowerCase();
  for (const [k, v] of Object.entries(i)) if (!String(v || '').trim()) throw new AffiliateError('All fields are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AffiliateError('Enter a valid email address.');
  if (i.password.length < 8) throw new AffiliateError('Password must be at least 8 characters.');
  const db = await getDb();
  if (await db.collection('affiliates').findOne({ email: ci(email) })) throw new AffiliateError('That email is already registered as an affiliate.');
  const referralCode = crypto.randomBytes(8).toString('hex');
  const r = await db.collection('affiliates').insertOne({
    firstName: i.firstName.trim(),
    lastName: i.lastName.trim(),
    email,
    country: i.country.trim(),
    countryCode: i.countryCode.trim(),
    mobileNumber: i.mobileNumber.trim(),
    password: await bcrypt.hash(i.password, 10),
    referralCode,
    createdAt: new Date(),
  });
  sendMailSafe({
    from: `"Shed Affiliate Programme" <${env.emailUser}>`,
    to: email,
    subject: 'Welcome to the Shed Affiliate Programme',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;"><h1 style="color:#FF9800;">Welcome, ${escapeHtml(i.firstName)}!</h1><p>You're now a Shed affiliate. Share your link to earn rewards when businesses sign up:</p><p><a href="${referralLink(referralCode)}"><strong>${referralLink(referralCode)}</strong></a></p><p>Track clicks and signups on your <a href="${env.baseUrl}/referrals/dashboard">affiliate dashboard</a>.</p></div>`,
  });
  await updateSession({ affiliate: String(r.insertedId) });
}

export async function affiliateLogin(id: string, password: string) {
  const db = await getDb();
  const a = await db.collection('affiliates').findOne({ $or: [{ email: ci((id || '').trim()) }, { username: ci((id || '').trim()) }] });
  if (!a || !(await bcrypt.compare(password || '', a.password || ''))) throw new AffiliateError('Invalid email or password.');
  await updateSession({ affiliate: String(a._id) });
}

export async function affiliateLogout() {
  await updateSession({ affiliate: undefined });
}

export async function affiliateStats(affiliateId: any) {
  const db = await getDb();
  const activities = await db.collection('referral_activities').find({ affiliateId }).sort({ date: -1 }).limit(200).toArray();
  const counts = await db.collection('referral_activities').aggregate([{ $match: { affiliateId } }, { $group: { _id: '$action', n: { $sum: 1 } } }]).toArray();
  const c = Object.fromEntries(counts.map((x) => [x._id, x.n]));
  return serialize({ activities, clicks: c['Referral Link Clicked'] || 0, signups: c['New Admin Signup'] || 0 });
}

export async function affiliateForgot(emailRaw: string) {
  const db = await getDb();
  const a = await db.collection('affiliates').findOne({ email: ci((emailRaw || '').trim()) });
  if (a) {
    const token = crypto.randomBytes(20).toString('hex');
    await db.collection('affiliates').updateOne({ _id: a._id }, { $set: { resetToken: token, resetTokenExpiry: new Date(Date.now() + 3600000) } });
    const link = `${env.baseUrl}/referrals/reset-password/${token}`;
    sendMailSafe({ from: `"Shed Affiliate Programme" <${env.emailUser}>`, to: a.email, subject: 'Reset your Shed affiliate password', html: `<p>Hi ${escapeHtml(a.firstName)},</p><p><a href="${link}">Reset your password</a>. This link expires in 1 hour.</p>` });
  }
}

export async function affiliateTokenValid(token: string) {
  const db = await getDb();
  return !!(token && (await db.collection('affiliates').findOne({ resetToken: token, resetTokenExpiry: { $gt: new Date() } })));
}

export async function affiliateReset(token: string, password: string, confirm: string) {
  if (password !== confirm) throw new AffiliateError('Passwords do not match.');
  if ((password || '').length < 8) throw new AffiliateError('Password must be at least 8 characters.');
  const db = await getDb();
  const a = await db.collection('affiliates').findOne({ resetToken: token, resetTokenExpiry: { $gt: new Date() } });
  if (!a) throw new AffiliateError('This reset link is invalid or has expired.');
  await db.collection('affiliates').updateOne({ _id: a._id }, { $set: { password: await bcrypt.hash(password, 10) }, $unset: { resetToken: '', resetTokenExpiry: '' } });
}
