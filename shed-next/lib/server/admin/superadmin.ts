import 'server-only';
import crypto from 'crypto';
import { getDb, oid, ci, escapeRegex, serialize } from '../db';
import type { SellerContext } from '../auth';
import { BUSINESS_CATEGORIES } from '../categories';
import { sendMailSafe, transporter } from '../mailer';
import { env } from '../env';
import { escapeHtml } from '../store';
import { isAccountLocked } from '../subscription';

/* Platform administration (port of superadminController.js + blog admin). */

export class AdminError extends Error {
  status = 400;
}

const slugify = (t: string) => String(t || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/* ─────────────── Stores ─────────────── */

export async function platformStats() {
  const db = await getDb();
  const since = new Date(Date.now() - 30 * 86400000);
  const [stores, shoppers, affiliates, outlets, sales30, newStores30, flags, contact] = await Promise.all([
    db.collection('admins').countDocuments({ role: { $ne: 'superadmin' } }),
    db.collection('shoppers').countDocuments({}),
    db.collection('affiliates').countDocuments({}),
    db.collection('outlets').countDocuments({}),
    db.collection('sales').aggregate([{ $match: { date: { $gte: since } } }, { $group: { _id: null, n: { $sum: 1 }, amount: { $sum: '$totalAmount' } } }]).toArray(),
    db.collection('admins').countDocuments({ role: { $ne: 'superadmin' }, createdAt: { $gte: since } }),
    db.collection('reconciliation_flags').countDocuments({ resolved: { $ne: true } }),
    db.collection('contact_messages').countDocuments({ read: { $ne: true } }),
  ]);
  return { stores, shoppers, affiliates, outlets, sales30: sales30[0]?.n || 0, gmv30: sales30[0]?.amount || 0, newStores30, flags, contact };
}

export async function listStores(q = '', filter = '') {
  const db = await getDb();
  const match: any = { role: { $ne: 'superadmin' }, username: { $ne: 'System' } };
  if (q.trim()) {
    const rx = { $regex: escapeRegex(q.trim()), $options: 'i' };
    match.$or = [{ username: rx }, { businessName: rx }, { email: rx }];
  }
  if (filter === 'trial') match['subscription.status'] = 'trial';
  if (filter === 'paying') match['subscription.status'] = 'active';
  if (filter === 'unverified') { match.clusterId = { $ne: null }; match.isVerified = { $ne: true }; }
  const admins = await db.collection('admins').find(match).project({ password: 0, resetToken: 0 }).sort({ createdAt: -1 }).limit(500).toArray();
  const ids = admins.map((a) => a._id);
  const [logins, sales, products] = await Promise.all([
    db.collection('login_logs').aggregate([{ $match: { adminId: { $in: ids } } }, { $group: { _id: '$adminId', last: { $max: '$loginTime' }, n: { $sum: 1 } } }]).toArray(),
    db.collection('sales').aggregate([{ $match: { adminId: { $in: ids } } }, { $group: { _id: '$adminId', n: { $sum: 1 }, amount: { $sum: '$totalAmount' }, online: { $sum: { $cond: [{ $eq: ['$source', 'storefront'] }, 1, 0] } } } }]).toArray(),
    db.collection('inventory').aggregate([{ $match: { adminId: { $in: ids } } }, { $group: { _id: '$adminId', n: { $sum: 1 } } }]).toArray(),
  ]);
  const L = new Map(logins.map((x) => [String(x._id), x]));
  const S = new Map(sales.map((x) => [String(x._id), x]));
  const P = new Map(products.map((x) => [String(x._id), x.n]));
  let rows = admins.map((a) => ({
    ...a,
    lastLogin: L.get(String(a._id))?.last || null,
    logins: L.get(String(a._id))?.n || 0,
    salesCount: S.get(String(a._id))?.n || 0,
    salesAmount: S.get(String(a._id))?.amount || 0,
    onlineOrders: S.get(String(a._id))?.online || 0,
    products: P.get(String(a._id)) || 0,
    locked: isAccountLocked(a),
    subStatus: a.subscription ? (a.subscription.legacyAccount ? 'legacy' : a.subscription.status) : 'legacy',
  }));
  if (filter === 'unverified') rows = rows.filter((r: any) => !r.isVerified);
  if (filter === 'locked') rows = rows.filter((r: any) => r.locked);
  return serialize(rows);
}

export async function getStoreDetail(username: string) {
  const db = await getDb();
  const admin = await db.collection('admins').findOne({ username: ci(username) }, { projection: { password: 0, resetToken: 0 } });
  if (!admin) return null;
  const [sales, products, team, outlets, charges, cluster] = await Promise.all([
    db.collection('sales').find({ adminId: admin._id }).sort({ date: -1 }).limit(20).toArray(),
    db.collection('inventory').countDocuments({ adminId: admin._id }),
    db.collection('business_users').find({ adminId: admin._id }).project({ password: 0, tempPassword: 0, invitationToken: 0 }).toArray(),
    db.collection('outlets').find({ adminId: admin._id }).project({ password: 0 }).toArray(),
    db.collection('subscription_charges').find({ adminId: admin._id }).sort({ createdAt: -1 }).limit(10).toArray(),
    admin.clusterId ? db.collection('market_clusters').findOne({ _id: admin.clusterId }) : null,
  ]);
  return serialize({ admin, sales, products, team, outlets, charges, cluster, locked: isAccountLocked(admin) });
}

async function storeById(id: string) {
  const _id = oid(id);
  const db = await getDb();
  const a = _id && (await db.collection('admins').findOne({ _id }));
  if (!a) throw new AdminError('Store not found.');
  return a;
}

export async function storeAction(ctx: SellerContext, id: string, action: 'verify' | 'unverify' | 'comp' | 'uncomp' | 'extendTrial' | 'deactivate' | 'activate' | 'resetPassword' | 'delete') {
  const a = await storeById(id);
  const db = await getDb();
  switch (action) {
    case 'verify':
    case 'unverify':
      await db.collection('admins').updateOne({ _id: a._id }, { $set: { isVerified: action === 'verify', verifiedAt: action === 'verify' ? new Date() : null } });
      return action === 'verify' ? `${a.businessName || a.username} is verified.` : 'Verification removed.';
    case 'comp':
    case 'uncomp':
      if (!a.subscription || a.subscription.legacyAccount) throw new AdminError('This store is on a legacy (free) plan already.');
      await db.collection('admins').updateOne({ _id: a._id }, { $set: { 'subscription.status': action === 'comp' ? 'comped' : 'expired' } });
      return action === 'comp' ? 'Free access granted.' : 'Free access removed.';
    case 'extendTrial': {
      if (!a.subscription || a.subscription.legacyAccount) throw new AdminError('This store is not on the subscription system.');
      const base = Math.max(Date.now(), new Date(a.subscription.trialEndsAt || Date.now()).getTime());
      await db.collection('admins').updateOne({ _id: a._id }, { $set: { 'subscription.status': 'trial', 'subscription.trialEndsAt': new Date(base + 14 * 86400000), 'subscription.trialReminderSentAt': null } });
      return 'Trial extended by 14 days.';
    }
    case 'deactivate':
    case 'activate':
      await db.collection('admins').updateOne({ _id: a._id }, { $set: { active: action === 'activate' } });
      return action === 'activate' ? 'Store is visible on the marketplace.' : 'Store hidden from the marketplace.';
    case 'resetPassword': {
      if (!a.email) throw new AdminError('This store has no email address.');
      const token = crypto.randomBytes(20).toString('hex');
      await db.collection('admins').updateOne({ _id: a._id }, { $set: { resetToken: token, resetTokenExpiry: Date.now() + 3600000 } });
      sendMailSafe({ to: a.email, subject: 'Reset your Shed password', html: `<p>Hello ${escapeHtml(a.username)},</p><p>Shed support started a password reset for your account. <a href="${env.baseUrl}/reset-password/${token}">Choose a new password</a> (link expires in 1 hour).</p>` });
      return `Password reset email sent to ${a.email}.`;
    }
    case 'delete':
      if (String(a._id) === String(ctx.admin._id)) throw new AdminError("You can't delete your own account.");
      await db.collection('admins').deleteOne({ _id: a._id });
      return 'Store account deleted.';
  }
}

export async function updateStore(id: string, d: { businessName: string; username: string; email: string; phone: string; currency: string; role: string; category: string }) {
  const a = await storeById(id);
  if (!d.username.trim()) throw new AdminError('Username is required.');
  if (!['admin', 'superadmin'].includes(d.role)) throw new AdminError('Role must be admin or superadmin.');
  const db = await getDb();
  if (await db.collection('admins').findOne({ username: ci(d.username.trim()), _id: { $ne: a._id } })) throw new AdminError('That username is taken.');
  await db.collection('admins').updateOne(
    { _id: a._id },
    { $set: { businessName: d.businessName.trim(), username: d.username.trim(), email: d.email.trim(), phone: d.phone.trim(), currency: d.currency || a.currency, role: d.role, category: BUSINESS_CATEGORIES.includes(d.category) ? d.category : a.category || null } },
  );
  return d.username.trim();
}

/** One-off maintenance (was GET /api/fix/activate-stores). */
export async function activateLegacyStores() {
  const db = await getDb();
  const r = await db.collection('admins').updateMany({ active: { $exists: false } }, { $set: { active: true } });
  return r.modifiedCount;
}

/* ─────────────── Messages & broadcast ─────────────── */

export async function sendMessage(ctx: SellerContext, d: { recipientId?: string; subject: string; content: string }) {
  if (!d.content.trim()) throw new AdminError('Write a message first.');
  const db = await getDb();
  const rid = d.recipientId ? oid(d.recipientId) : null;
  if (d.recipientId && !rid) throw new AdminError('Choose a valid store.');
  await db.collection('messages').insertOne({ sender: ctx.admin.username, senderId: ctx.admin._id, recipientId: rid, subject: d.subject.trim() || 'Message from Shed', content: d.content.trim(), createdAt: new Date(), read: false, readAt: null });
}

export async function sentMessages(ctx: SellerContext) {
  const db = await getDb();
  const rows = await db
    .collection('messages')
    .aggregate([
      { $match: { senderId: ctx.admin._id } },
      { $sort: { createdAt: -1 } },
      { $limit: 100 },
      { $lookup: { from: 'admins', localField: 'recipientId', foreignField: '_id', as: 'r' } },
      { $project: { subject: 1, content: 1, createdAt: 1, read: 1, readAt: 1, recipient: { $ifNull: [{ $arrayElemAt: ['$r.businessName', 0] }, 'All stores'] } } },
    ])
    .toArray();
  return serialize(rows);
}

/** Email every store owner (batched). Returns counts. */
export async function broadcastEmail(ctx: SellerContext, subject: string, html: string) {
  if (!subject.trim() || !html.trim()) throw new AdminError('Subject and message are required.');
  const db = await getDb();
  const users = await db.collection('admins').find({ email: { $exists: true, $nin: ['', null] }, status: { $ne: 'test' }, role: { $ne: 'superadmin' } }).project({ email: 1, username: 1, firstName: 1 }).toArray();
  const log = await db.collection('broadcast_logs').insertOne({ type: 'custom', subject, initiatedBy: ctx.admin._id, startTime: new Date(), totalRecipients: users.length, status: 'processing' });
  let ok = 0;
  const failed: string[] = [];
  for (let i = 0; i < users.length; i += 5) {
    await Promise.all(
      users.slice(i, i + 5).map(async (u) => {
        try {
          await transporter.sendMail({ from: `"Shed" <${env.emailUser}>`, to: u.email, subject, html: html.replace(/\{\{name\}\}/g, escapeHtml(u.firstName || u.username)) });
          ok++;
        } catch {
          failed.push(u.email);
        }
      }),
    );
    if (i + 5 < users.length) await new Promise((r) => setTimeout(r, 1500));
  }
  await db.collection('broadcast_logs').updateOne({ _id: log.insertedId }, { $set: { endTime: new Date(), status: 'completed', successCount: ok, failCount: failed.length, failedEmails: failed } });
  return { ok, failed: failed.length, total: users.length };
}

/* ─────────────── Affiliates / outlets / shoppers ─────────────── */

export async function listAffiliates() {
  const db = await getDb();
  const affs = await db.collection('affiliates').find({}).project({ password: 0, resetToken: 0 }).sort({ createdAt: -1 }).toArray();
  const counts = await db.collection('referral_activities').aggregate([{ $group: { _id: { a: '$affiliateId', t: '$action' }, n: { $sum: 1 } } }]).toArray();
  const get = (id: any, t: string) => counts.find((c) => String(c._id.a) === String(id) && c._id.t === t)?.n || 0;
  return serialize(affs.map((a) => ({ ...a, clicks: get(a._id, 'Referral Link Clicked'), signups: get(a._id, 'New Admin Signup') })));
}

export async function listAllOutlets() {
  const db = await getDb();
  const rows = await db
    .collection('outlets')
    .aggregate([
      { $lookup: { from: 'admins', localField: 'adminId', foreignField: '_id', as: 'a' } },
      { $project: { name: 1, username: 1, location: 1, mobile: 1, createdAt: 1, inventory: 1, storeName: { $arrayElemAt: ['$a.businessName', 0] }, storeUsername: { $arrayElemAt: ['$a.username', 0] } } },
      { $sort: { name: 1 } },
    ])
    .toArray();
  return serialize(rows.map((o: any) => ({ ...o, units: (o.inventory || []).reduce((n: number, i: any) => n + Math.max(0, i.stock || 0), 0), inventory: undefined })));
}

/* ─────────────── Clusters ─────────────── */

async function uniqueSlug(name: string, excludeId?: any) {
  const db = await getDb();
  const base = slugify(name) || 'market';
  let slug = base;
  for (let n = 2; ; n++) {
    const q: any = { slug };
    if (excludeId) q._id = { $ne: excludeId };
    if (!(await db.collection('market_clusters').findOne(q))) return slug;
    slug = `${base}-${n}`;
  }
}

export async function adminClusters() {
  const db = await getDb();
  const clusters = await db.collection('market_clusters').find({}).sort({ createdAt: -1 }).toArray();
  const counts = await db.collection('admins').aggregate([{ $match: { clusterId: { $in: clusters.map((c) => c._id) } } }, { $group: { _id: '$clusterId', n: { $sum: 1 }, v: { $sum: { $cond: [{ $eq: ['$isVerified', true] }, 1, 0] } } } }]).toArray();
  const pending = await db.collection('admins').find({ clusterId: { $in: clusters.map((c) => c._id) }, isVerified: { $ne: true } }).project({ username: 1, businessName: 1, clusterId: 1 }).toArray();
  return serialize(clusters.map((c) => {
    const x = counts.find((k) => String(k._id) === String(c._id));
    return { ...c, storeCount: x?.n || 0, verifiedCount: x?.v || 0, pending: pending.filter((p) => String(p.clusterId) === String(c._id)) };
  }));
}

export async function saveCluster(d: { id?: string; name: string; description: string; image: string; city: string; focusCategories: string[] }) {
  if (!d.name.trim()) throw new AdminError('Market name is required.');
  const db = await getDb();
  const doc = { name: d.name.trim(), description: d.description.trim(), image: d.image.trim(), city: d.city.trim(), focusCategories: d.focusCategories.filter((c) => BUSINESS_CATEGORIES.includes(c)) };
  const _id = oid(d.id);
  if (_id) {
    const existing = await db.collection('market_clusters').findOne({ _id });
    if (!existing) throw new AdminError('Market not found.');
    const $set: any = { ...doc, updatedAt: new Date() };
    // Only re-slug when the name changes, so shared links keep working.
    if (doc.name !== existing.name) $set.slug = await uniqueSlug(doc.name, _id);
    await db.collection('market_clusters').updateOne({ _id }, { $set });
  } else {
    await db.collection('market_clusters').insertOne({ ...doc, slug: await uniqueSlug(doc.name), isActive: true, createdAt: new Date() });
  }
}

export async function clusterAction(id: string, action: 'toggle' | 'delete') {
  const _id = oid(id);
  const db = await getDb();
  const c = _id && (await db.collection('market_clusters').findOne({ _id }));
  if (!c) throw new AdminError('Market not found.');
  if (action === 'toggle') await db.collection('market_clusters').updateOne({ _id: c._id }, { $set: { isActive: !c.isActive } });
  else {
    await db.collection('admins').updateMany({ clusterId: c._id }, { $unset: { clusterId: '' } });
    await db.collection('market_clusters').deleteOne({ _id: c._id });
  }
}

/* ─────────────── Featured ads ─────────────── */

export async function listAds() {
  const db = await getDb();
  return serialize(await db.collection('featured_ads').find({}).sort({ createdAt: -1 }).toArray());
}

export async function activeAds(limit = 8) {
  const db = await getDb();
  return serialize(await db.collection('featured_ads').find({ isActive: true }).sort({ createdAt: -1 }).limit(limit).toArray());
}

export async function saveAd(d: { productName: string; description: string; imageUrl: string; price: string; currency: string; storeUrl: string; businessName: string; position: string }) {
  if (!d.productName.trim() || !d.storeUrl.trim()) throw new AdminError('Product name and link are required.');
  if (!/^(https?:\/\/|\/)/.test(d.storeUrl.trim())) throw new AdminError('The link must start with https:// or /');
  const db = await getDb();
  await db.collection('featured_ads').insertOne({ productName: d.productName.trim(), description: d.description.trim(), imageUrl: d.imageUrl.trim(), price: parseFloat(d.price) || 0, currency: d.currency.trim() || '₦', storeUrl: d.storeUrl.trim(), businessName: d.businessName.trim(), position: d.position || 'both', isActive: true, createdAt: new Date() });
}

export async function adAction(id: string, action: 'toggle' | 'delete') {
  const _id = oid(id);
  const db = await getDb();
  const ad = _id && (await db.collection('featured_ads').findOne({ _id }));
  if (!ad) throw new AdminError('Ad not found.');
  if (action === 'toggle') await db.collection('featured_ads').updateOne({ _id: ad._id }, { $set: { isActive: !ad.isActive } });
  else await db.collection('featured_ads').deleteOne({ _id: ad._id });
}

/* ─────────────── Blog ─────────────── */

export async function adminPosts() {
  const db = await getDb();
  return serialize(await db.collection('blog_posts').find({}).project({ content: 0 }).sort({ createdAt: -1 }).toArray());
}

export async function adminPost(id: string) {
  const _id = oid(id);
  if (!_id) return null;
  const db = await getDb();
  return serialize(await db.collection('blog_posts').findOne({ _id }));
}

export async function savePost(ctx: SellerContext, d: { id?: string; title: string; excerpt: string; content: string; tags: string; published: boolean; coverImage?: string | null }) {
  if (!d.title.trim() || !d.content.trim()) throw new AdminError('Title and content are required.');
  const db = await getDb();
  const doc: any = { title: d.title.trim(), excerpt: d.excerpt.trim(), content: d.content, tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean), published: d.published, updatedAt: new Date() };
  if (d.coverImage) doc.coverImage = d.coverImage;
  const _id = oid(d.id);
  if (_id) {
    await db.collection('blog_posts').updateOne({ _id }, { $set: doc });
    return String(_id);
  }
  const r = await db.collection('blog_posts').insertOne({ ...doc, slug: `${slugify(d.title)}-${Date.now().toString(36)}`, coverImage: d.coverImage || null, views: 0, author: ctx.displayName || 'Shed Team', createdAt: new Date() });
  return String(r.insertedId);
}

export async function postAction(id: string, action: 'toggle' | 'delete') {
  const _id = oid(id);
  const db = await getDb();
  const p = _id && (await db.collection('blog_posts').findOne({ _id }));
  if (!p) throw new AdminError('Post not found.');
  if (action === 'toggle') await db.collection('blog_posts').updateOne({ _id: p._id }, { $set: { published: !p.published, updatedAt: new Date() } });
  else await db.collection('blog_posts').deleteOne({ _id: p._id });
}

/* ─────────────── Inbox: contact form + payment flags ─────────────── */

export async function supportInbox() {
  const db = await getDb();
  const [contact, flags] = await Promise.all([
    db.collection('contact_messages').find({}).sort({ createdAt: -1 }).limit(200).toArray(),
    db.collection('reconciliation_flags').find({}).sort({ createdAt: -1 }).limit(200).toArray(),
  ]);
  return serialize({ contact, flags });
}

export async function supportAction(kind: 'contact' | 'flag', id: string) {
  const _id = oid(id);
  if (!_id) throw new AdminError('Invalid item.');
  const db = await getDb();
  if (kind === 'contact') await db.collection('contact_messages').updateOne({ _id }, { $set: { read: true } });
  else await db.collection('reconciliation_flags').updateOne({ _id }, { $set: { resolved: true, resolvedAt: new Date() } });
}
