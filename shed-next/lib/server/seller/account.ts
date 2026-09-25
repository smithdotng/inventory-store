import 'server-only';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb, oid, ci, escapeRegex, serialize } from '../db';
import type { SellerContext } from '../auth';
import { BUSINESS_CATEGORIES } from '../categories';
import { sendMailSafe } from '../mailer';
import { env } from '../env';
import { escapeHtml } from '../store';
import { PASSWORD_HINT, PASSWORD_RULE, sendWelcomeEmail } from '../auth-actions';

export class AccountError extends Error {
  status = 400;
}

/* ─────────────── Business settings (port of profileController.postProfileUpdate) ─────────────── */

export interface SettingsInput {
  firstName: string;
  lastName: string;
  businessName: string;
  description: string;
  currency: string;
  country: string;
  phone: string;
  email: string;
  address: string;
  facebook: string;
  instagram: string;
  twitter: string;
  website: string;
  publicPhone: boolean;
  publicEmail: boolean;
  publicAddress: boolean;
  applyVat: boolean;
  vatRate: string;
  paymentInstructions: string;
  category: string;
  clusterId: string;
  primaryAccount: { bankName: string; bankAccountName: string; accountNumber: string };
  secondaryAccount: { bankName: string; bankAccountName: string; accountNumber: string };
  logo?: string | null;
}

const validUrl = (u: string) => {
  if (!u) return true;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:';
  } catch {
    return false;
  }
};

export async function updateSettings(ctx: SellerContext, s: SettingsInput) {
  if (!s.businessName.trim()) throw new AccountError('Business name is required.');
  if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) throw new AccountError('Please enter a valid email address.');
  for (const [k, v] of [['Facebook', s.facebook], ['Instagram', s.instagram], ['X / Twitter', s.twitter], ['Website', s.website]] as const) {
    if (!validUrl(v)) throw new AccountError(`Please enter a full ${k} link, starting with https://`);
  }
  let vatRate = Number(ctx.admin.vatRate) || 0;
  if (s.applyVat) {
    vatRate = parseFloat(s.vatRate);
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) throw new AccountError('VAT rate must be between 0 and 100.');
  }
  const db = await getDb();
  if (s.email && s.email.toLowerCase() !== String(ctx.admin.email || '').toLowerCase()) {
    const clash = await db.collection('admins').findOne({ email: ci(s.email), _id: { $ne: ctx.admin._id } });
    if (clash) throw new AccountError('That email is already used by another account.');
  }
  let clusterId = null;
  const cid = oid(s.clusterId);
  if (cid && (await db.collection('market_clusters').findOne({ _id: cid, isActive: true }))) clusterId = cid;

  const clean = (a: SettingsInput['primaryAccount']) => ({ bankName: a.bankName.trim(), bankAccountName: a.bankAccountName.trim(), accountNumber: a.accountNumber.trim() });
  const $set: any = {
    firstName: s.firstName.trim(),
    lastName: s.lastName.trim(),
    businessName: s.businessName.trim(),
    description: s.description.trim().slice(0, 600),
    currency: s.currency || ctx.admin.currency || '₦',
    country: s.country || ctx.admin.country,
    phone: s.phone.trim(),
    email: s.email.trim() || ctx.admin.email,
    address: s.address.trim(),
    facebook: s.facebook.trim() || null,
    instagram: s.instagram.trim() || null,
    twitter: s.twitter.trim() || null,
    website: s.website.trim() || null,
    publicPhone: s.publicPhone,
    publicEmail: s.publicEmail,
    publicAddress: s.publicAddress,
    applyVat: s.applyVat,
    vatRate,
    paymentInstructions: s.paymentInstructions.trim().slice(0, 1000),
    category: BUSINESS_CATEGORIES.includes(s.category) ? s.category : null,
    clusterId,
    primaryAccount: clean(s.primaryAccount),
    secondaryAccount: clean(s.secondaryAccount),
    updatedAt: new Date(),
  };
  if (s.logo) $set.logo = s.logo;
  await db.collection('admins').updateOne({ _id: ctx.admin._id }, { $set });
}

export async function changePassword(ctx: SellerContext, current: string, next: string, confirm: string) {
  if (next !== confirm) throw new AccountError('New passwords do not match.');
  if (!PASSWORD_RULE.test(next)) throw new AccountError(`Password must be: ${PASSWORD_HINT}`);
  if (!(await bcrypt.compare(current || '', ctx.user.password || ''))) throw new AccountError('Your current password is incorrect.');
  const db = await getDb();
  const col = ctx.userType === 'admin' ? 'admins' : 'business_users';
  await db.collection(col).updateOne({ _id: ctx.user._id }, { $set: { password: await bcrypt.hash(next, 10), passwordChangedAt: new Date() } });
}

/* ─────────────── Team (business users) ─────────────── */

export const TEAM_ROLES = [
  { value: 'cashier', label: 'Cashier', hint: 'Can use the point of sale' },
  { value: 'stock_clerk', label: 'Stock clerk', hint: 'Can manage inventory and use the point of sale' },
  { value: 'admin', label: 'Manager', hint: 'Full access except billing' },
];

export async function listTeam(ctx: SellerContext) {
  const db = await getDb();
  const users = await db.collection('business_users').find({ adminId: ctx.admin._id }).project({ password: 0, tempPassword: 0, invitationToken: 0 }).sort({ createdAt: -1 }).toArray();
  return serialize(users);
}

function inviteEmail(to: string, firstName: string, businessName: string, token: string) {
  const link = `${env.baseUrl}/setup-account/${token}`;
  return sendMailSafe({
    from: `"${businessName}" <${env.emailUser}>`,
    to,
    subject: `You're invited to join ${businessName} on Shed`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><h2>Join ${escapeHtml(businessName)} on Shed</h2><p>Hello ${escapeHtml(firstName)},</p><p>You've been invited to help run <strong>${escapeHtml(businessName)}</strong> on Shed.</p><p style="margin:28px 0;"><a href="${link}" style="background:#FF9800;color:#141414;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">Set up your account</a></p><p style="color:#666;font-size:13px;">This link expires in 7 days. If you weren't expecting this, you can ignore this email.</p></div>`,
  });
}

export async function inviteMember(ctx: SellerContext, m: { firstName: string; lastName: string; email: string; role: string }) {
  const firstName = m.firstName.trim();
  const lastName = m.lastName.trim();
  const email = m.email.trim().toLowerCase();
  if (firstName.length < 2 || lastName.length < 2) throw new AccountError('First and last name are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError('Enter a valid email address.');
  if (!TEAM_ROLES.some((r) => r.value === m.role)) throw new AccountError('Choose a role.');
  const db = await getDb();
  if (await db.collection('business_users').findOne({ email: ci(email) })) throw new AccountError('Someone with that email is already on a Shed team.');
  if (await db.collection('admins').findOne({ email: ci(email) })) throw new AccountError('That email belongs to a store owner account.');
  const token = crypto.randomBytes(32).toString('hex');
  await db.collection('business_users').insertOne({
    adminId: ctx.admin._id,
    businessName: ctx.admin.businessName,
    firstName,
    lastName,
    email,
    username: `${email.split('@')[0].replace(/[^\w.-]/g, '')}_${Date.now().toString().slice(-6)}`,
    // Random unusable password until they accept the invite and choose their own.
    password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
    role: m.role,
    permissions: [],
    status: 'pending',
    invitationToken: token,
    invitationExpires: Date.now() + 7 * 86400000,
    createdAt: new Date(),
    createdBy: ctx.user._id,
  });
  inviteEmail(email, firstName, ctx.admin.businessName, token);
}

export async function teamAction(ctx: SellerContext, id: string, action: 'activate' | 'deactivate' | 'resend' | 'remove' | 'role', role?: string) {
  const _id = oid(id);
  if (!_id) throw new AccountError('Invalid team member.');
  const db = await getDb();
  const user = await db.collection('business_users').findOne({ _id, adminId: ctx.admin._id });
  if (!user) throw new AccountError('Team member not found.');
  if (action === 'activate') await db.collection('business_users').updateOne({ _id }, { $set: { status: 'active' } });
  if (action === 'deactivate') await db.collection('business_users').updateOne({ _id }, { $set: { status: 'inactive' } });
  if (action === 'remove') await db.collection('business_users').deleteOne({ _id });
  if (action === 'role') {
    if (!TEAM_ROLES.some((r) => r.value === role)) throw new AccountError('Choose a valid role.');
    await db.collection('business_users').updateOne({ _id }, { $set: { role } });
  }
  if (action === 'resend') {
    if (user.status !== 'pending') throw new AccountError('This person has already set up their account.');
    const token = crypto.randomBytes(32).toString('hex');
    await db.collection('business_users').updateOne({ _id }, { $set: { invitationToken: token, invitationExpires: Date.now() + 7 * 86400000 }, $unset: { tempPassword: '' } });
    inviteEmail(user.email, user.firstName, ctx.admin.businessName, token);
  }
}

export async function findInvitation(token: string) {
  if (!token) return null;
  const db = await getDb();
  const user = await db.collection('business_users').findOne({ invitationToken: token, invitationExpires: { $gt: Date.now() }, status: 'pending' });
  return user ? { email: user.email as string, firstName: user.firstName as string, businessName: user.businessName as string } : null;
}

export async function acceptInvitation(token: string, password: string, confirm: string) {
  if (password !== confirm) throw new AccountError('Passwords do not match.');
  if (!PASSWORD_RULE.test(password)) throw new AccountError(`Password must be: ${PASSWORD_HINT}`);
  const db = await getDb();
  const user = await db.collection('business_users').findOne({ invitationToken: token, invitationExpires: { $gt: Date.now() }, status: 'pending' });
  if (!user) throw new AccountError('This invitation link is invalid or has expired.');
  await db.collection('business_users').updateOne(
    { _id: user._id },
    { $set: { password: await bcrypt.hash(password, 10), status: 'active', activatedAt: new Date() }, $unset: { invitationToken: '', invitationExpires: '', tempPassword: '' } },
  );
  sendWelcomeEmail(user.email, user.firstName, user.businessName);
}

/* ─────────────── Inbox (port of the admin-messages routes) ─────────────── */

const mine = (ctx: SellerContext) => ({ $or: [{ recipientId: ctx.admin._id }, { recipientId: null }] });

export async function listMessages(ctx: SellerContext, opts: { trash?: boolean; q?: string } = {}) {
  const db = await getDb();
  const and: any[] = [mine(ctx), opts.trash ? { deleted: true } : { deleted: { $ne: true } }];
  if (opts.q?.trim()) {
    const rx = { $regex: escapeRegex(opts.q.trim()), $options: 'i' };
    and.push({ $or: [{ subject: rx }, { content: rx }] });
  }
  const rows = await db
    .collection('messages')
    .aggregate([
      { $match: { $and: and } },
      { $lookup: { from: 'admins', localField: 'senderId', foreignField: '_id', as: 's' } },
      { $project: { subject: 1, content: 1, createdAt: 1, read: 1, isHtml: 1, deletedAt: 1, sender: { $ifNull: [{ $arrayElemAt: ['$s.businessName', 0] }, { $arrayElemAt: ['$s.username', 0] }] } } },
      { $sort: { createdAt: -1 } },
      { $limit: 300 },
    ])
    .toArray();
  const trashCount = await db.collection('messages').countDocuments({ $and: [mine(ctx), { deleted: true }] });
  return serialize({ rows, trashCount });
}

export async function messageAction(ctx: SellerContext, id: string, action: 'read' | 'unread' | 'trash' | 'restore' | 'delete') {
  const _id = oid(id);
  if (!_id) throw new AccountError('Invalid message.');
  const db = await getDb();
  const filter = { _id, ...mine(ctx) };
  if (action === 'read' || action === 'unread') await db.collection('messages').updateOne(filter, { $set: { read: action === 'read', readAt: action === 'read' ? new Date() : null } });
  if (action === 'trash') await db.collection('messages').updateOne(filter, { $set: { deleted: true, deletedAt: new Date(), deletedBy: ctx.admin._id } });
  if (action === 'restore') await db.collection('messages').updateOne(filter, { $unset: { deleted: '', deletedAt: '', deletedBy: '' } });
  if (action === 'delete') await db.collection('messages').deleteOne({ ...filter, deleted: true });
}
