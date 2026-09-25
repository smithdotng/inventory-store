import 'server-only';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { getDb, ci, oid } from './db';
import { createSession, removeFromSession, SELLER_KEYS, SHOPPER_KEYS } from './session';
import { dashboardUrl } from './auth';
import { sendMailSafe } from './mailer';
import { env } from './env';
import { newTrialSubscription } from './subscription';
import { BUSINESS_CATEGORIES } from './categories';
import { escapeHtml } from './store';

/* Business logic for seller authentication (port of authController.js).
 * Called by Server Actions (forms) and by /api/auth/* route handlers. */

export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const PASSWORD_HINT = 'At least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.';

export async function signIn(usernameOrEmail: string, password: string): Promise<{ ok: true; redirect: string; role: string; username: string } | { ok: false; error: string }> {
  const id = (usernameOrEmail || '').trim();
  if (!id || !password) return { ok: false, error: 'Enter your username or email and password.' };
  const db = await getDb();
  const admin = await db.collection('admins').findOne({ $or: [{ username: ci(id) }, { email: ci(id) }] });
  const businessUser = admin ? null : await db.collection('business_users').findOne({ $or: [{ username: ci(id) }, { email: ci(id) }], status: 'active' });
  const user: any = admin || businessUser;
  if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
    return { ok: false, error: 'Invalid username/email or password' };
  }

  if (admin) {
    await createSession({ admin: admin.username, adminId: String(admin._id), role: admin.role, username: admin.username, userType: 'admin' }, { keep: [...SHOPPER_KEYS, 'affiliate'] });
  } else {
    await createSession({
      userId: String(user._id),
      adminId: String(user.adminId),
      role: user.role,
      username: user.username,
      firstName: user.firstName,
      userType: 'business_user',
    }, { keep: [...SHOPPER_KEYS, 'affiliate'] });
    await db.collection('business_users').updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
  }

  const h = headers();
  await db.collection('login_logs').insertOne({
    userId: user._id,
    username: user.username,
    role: user.role,
    adminId: user.adminId || user._id,
    loginTime: new Date(),
    ipAddress: h.get('x-forwarded-for') || h.get('x-real-ip') || null,
    userAgent: h.get('user-agent'),
  });
  return { ok: true, redirect: dashboardUrl(user.role), role: user.role, username: user.username };
}

/** Seller sign-out. Keeps a shopper / affiliate sign-in in the same browser. */
export async function signOut() {
  await removeFromSession(SELLER_KEYS);
}

/* ─────────────── Registration with email OTP ─────────────── */

export interface RegisterInput {
  businessName: string;
  email: string;
  currency: string;
  username: string;
  password: string;
  country: string;
  firstName: string;
  lastName: string;
  category?: string;
  clusterId?: string;
  referralCode?: string | null;
  logo?: string | null;
}

const otp = () => crypto.randomInt(100000, 1000000).toString();

function otpEmail(title: string, intro: string, code: string) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;"><h2 style="color:#141414;">${title}</h2><p>${intro}</p><div style="font-size:2.2rem;font-weight:700;letter-spacing:.3em;color:#FF9800;padding:20px 0;">${code}</div><p style="color:#888;font-size:0.85rem;">This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p></div>`;
}

export async function startRegistration(input: RegisterInput): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const email = (input.email || '').trim().toLowerCase();
  const username = (input.username || '').trim();
  if (!input.firstName?.trim() || !input.lastName?.trim()) return { ok: false, error: 'First name and last name are required.' };
  if (!input.businessName?.trim()) return { ok: false, error: 'Business name is required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Please enter a valid email address.' };
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) return { ok: false, error: 'Username must be 3–30 characters: letters, numbers, dots, dashes or underscores (no spaces).' };
  if (!PASSWORD_RULE.test(input.password || '')) return { ok: false, error: `Password must be: ${PASSWORD_HINT}` };

  const db = await getDb();
  const exists = await db.collection('admins').findOne({ $or: [{ username: ci(username) }, { email: ci(email) }] });
  if (exists) return { ok: false, error: 'Username or email already exists.' };

  const category = input.category && BUSINESS_CATEGORIES.includes(input.category) ? input.category : null;
  let clusterId = null;
  const cid = oid(input.clusterId);
  if (cid) {
    const cluster = await db.collection('market_clusters').findOne({ _id: cid, isActive: true });
    if (cluster) clusterId = cluster._id;
  }

  const code = otp();
  await db.collection('email_verifications').updateOne(
    { email },
    {
      $set: {
        otp: code,
        pendingAdmin: {
          businessName: input.businessName.trim(),
          email,
          currency: input.currency || '₦',
          country: input.country || 'NG',
          username,
          password: await bcrypt.hash(input.password, 10),
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          logo: input.logo || '/images/logo.png',
          role: 'admin',
          active: true,
          category,
          clusterId,
          createdAt: new Date(),
        },
        referralCode: input.referralCode || null,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    },
    { upsert: true },
  );
  sendMailSafe({ to: email, subject: 'Verify your Shed account', html: otpEmail('Verify your email', `Hi ${escapeHtml(input.firstName)}, thanks for signing up for Shed! Enter this code to complete your registration:`, code) });
  return { ok: true, email };
}

export async function resendRegistrationCode(emailRaw: string) {
  const email = (emailRaw || '').trim().toLowerCase();
  const db = await getDb();
  const record = await db.collection('email_verifications').findOne({ email });
  if (!record) return { ok: false as const, error: 'No pending registration found. Please register again.' };
  const code = otp();
  await db.collection('email_verifications').updateOne({ email }, { $set: { otp: code, expiresAt: new Date(Date.now() + 15 * 60 * 1000) } });
  sendMailSafe({ to: email, subject: 'Your new Shed verification code', html: otpEmail('New verification code', 'Here is your new code:', code) });
  return { ok: true as const };
}

export async function completeRegistration(emailRaw: string, code: string) {
  const email = (emailRaw || '').trim().toLowerCase();
  const db = await getDb();
  const record = await db.collection('email_verifications').findOne({ email });
  if (!record) return { ok: false as const, error: 'No pending registration found for this email.' };
  if (new Date() > new Date(record.expiresAt)) {
    await db.collection('email_verifications').deleteOne({ email });
    return { ok: false as const, error: 'Verification code has expired. Please register again.' };
  }
  if (String(record.otp) !== String(code || '').trim()) return { ok: false as const, error: 'Incorrect code. Please try again.' };

  const newAdmin = { ...record.pendingAdmin, subscription: newTrialSubscription() };
  const clash = await db.collection('admins').findOne({ $or: [{ username: ci(newAdmin.username) }, { email: ci(newAdmin.email) }] });
  if (clash) {
    await db.collection('email_verifications').deleteOne({ email });
    return { ok: false as const, error: 'That username or email was registered in the meantime. Please register again.' };
  }
  await db.collection('admins').insertOne(newAdmin);
  sendWelcomeEmail(newAdmin.email, newAdmin.firstName || newAdmin.username, newAdmin.businessName);

  if (record.referralCode) {
    const referrer = await db.collection('affiliates').findOne({ referralCode: record.referralCode });
    if (referrer) await db.collection('referral_activities').insertOne({ affiliateId: referrer._id, action: 'New Admin Signup', userEmail: email, date: new Date() });
  }
  await db.collection('email_verifications').deleteOne({ email });
  return { ok: true as const };
}

export async function trackReferralClick(referralCode?: string | null) {
  if (!referralCode) return;
  const db = await getDb();
  const referrer = await db.collection('affiliates').findOne({ referralCode });
  if (referrer) await db.collection('referral_activities').insertOne({ affiliateId: referrer._id, action: 'Referral Link Clicked', date: new Date() });
}

export async function activeClusters() {
  const db = await getDb();
  return (await db.collection('market_clusters').find({ isActive: true }).project({ name: 1 }).sort({ name: 1 }).toArray()).map((c) => ({ id: String(c._id), name: c.name as string }));
}

export function sendWelcomeEmail(email: string, firstName: string, businessName: string) {
  return sendMailSafe({
    from: `"${businessName}" <${env.emailUser}>`,
    to: email,
    subject: `Welcome to ${businessName} on Shed!`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><img src="${env.baseUrl}/images/logo.png" alt="Shed" style="width:150px;margin-bottom:20px;"><h1 style="color:#141414;">Welcome to ${escapeHtml(businessName)}, ${escapeHtml(firstName)}!</h1><p>Your account is active on Shed. You now have inventory, point of sale, customers, invoices, sales reports and an online store in one place.</p><p style="text-align:center;margin-top:30px;"><a href="${env.baseUrl}/admin-login" style="display:inline-block;padding:12px 24px;background:#FF9800;color:#141414;text-decoration:none;border-radius:8px;font-weight:bold;">Log in to Shed</a></p></div>`,
  });
}

/* ─────────────── Password reset ─────────────── */

export async function requestPasswordReset(emailRaw: string) {
  const email = (emailRaw || '').trim();
  const db = await getDb();
  const admin = await db.collection('admins').findOne({ email: ci(email) });
  // Always answer the same way so the form can't be used to discover accounts.
  if (admin) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.collection('password_resets').updateOne({ email: admin.email }, { $set: { token, expires: Date.now() + 3600000 } }, { upsert: true });
    const url = `${env.baseUrl}/reset-password?token=${token}`;
    sendMailSafe({
      to: admin.email,
      subject: 'Password Reset Request - Shed',
      html: `<h1>Password reset</h1><p>Hello ${escapeHtml(admin.username)},</p><p>We received a request to reset your Shed password. Click the link below to choose a new one:</p><p><a href="${url}">${url}</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p><p>— The Shed team</p>`,
    });
  }
  return { ok: true as const };
}

export async function checkResetToken(token: string) {
  if (!token) return null;
  const db = await getDb();
  const entry = await db.collection('password_resets').findOne({ token });
  if (entry && entry.expires > Date.now()) return { kind: 'email' as const, email: entry.email as string };
  // Superadmin-initiated reset tokens live on the admin document.
  const admin = await db.collection('admins').findOne({ resetToken: token, resetTokenExpiry: { $gt: Date.now() } });
  if (admin) return { kind: 'admin' as const, adminId: admin._id };
  return null;
}

export async function resetPassword(token: string, password: string, confirm: string) {
  if (password !== confirm) return { ok: false as const, error: 'Passwords do not match.' };
  if (!PASSWORD_RULE.test(password || '')) return { ok: false as const, error: `Password must be: ${PASSWORD_HINT}` };
  const found = await checkResetToken(token);
  if (!found) return { ok: false as const, error: 'This reset link is invalid or has expired.' };
  const db = await getDb();
  const hash = await bcrypt.hash(password, 10);
  if (found.kind === 'email') {
    await db.collection('admins').updateOne({ email: found.email }, { $set: { password: hash } });
    await db.collection('password_resets').deleteOne({ token });
  } else {
    await db.collection('admins').updateOne({ _id: found.adminId }, { $set: { password: hash }, $unset: { resetToken: '', resetTokenExpiry: '' } });
  }
  return { ok: true as const };
}
