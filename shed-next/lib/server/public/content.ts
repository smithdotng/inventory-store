import 'server-only';
import sanitizeHtml from 'sanitize-html';
import { getDb, oid, ci, escapeRegex, serialize } from '../db';
import { sendMailSafe } from '../mailer';
import { env } from '../env';
import { escapeHtml } from '../store';
import { isAccountLocked } from '../subscription';

/* Blog, contact form and market clusters (ports of blogController.js + clusterController.js). */

export class ContentError extends Error {
  status = 400;
}

/** Blog posts are written as HTML by superadmins — sanitise before rendering. */
export function safeHtml(html: string) {
  return sanitizeHtml(html || '', {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'figure', 'figcaption']),
    allowedAttributes: { a: ['href', 'name', 'target', 'rel'], img: ['src', 'alt', 'title', 'width', 'height', 'loading'], '*': ['class'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
  });
}

export async function listPosts(opts: { page?: number; tag?: string; limit?: number } = {}) {
  const db = await getDb();
  const limit = opts.limit || 9;
  const page = Math.max(1, opts.page || 1);
  const filter: any = { published: true };
  if (opts.tag) filter.tags = opts.tag;
  const [posts, total, tags] = await Promise.all([
    db.collection('blog_posts').find(filter).project({ content: 0 }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
    db.collection('blog_posts').countDocuments(filter),
    db.collection('blog_posts').distinct('tags', { published: true }),
  ]);
  return serialize({ posts, total, page, pages: Math.max(1, Math.ceil(total / limit)), tags: (tags as string[]).filter(Boolean) });
}

export async function getPost(slug: string, countView = true) {
  const db = await getDb();
  const post = await db.collection('blog_posts').findOne({ slug, published: true });
  if (!post) return null;
  const related = await db.collection('blog_posts').find({ published: true, tags: { $in: post.tags || [] }, _id: { $ne: post._id } }).project({ content: 0 }).sort({ createdAt: -1 }).limit(3).toArray();
  if (countView) await db.collection('blog_posts').updateOne({ _id: post._id }, { $inc: { views: 1 } });
  return serialize({ post: { ...post, content: safeHtml(post.content) }, related });
}

export async function submitContact(m: { name: string; email: string; phone: string; subject: string; message: string }) {
  if (!m.name.trim() || !m.email.trim() || !m.message.trim()) throw new ContentError('Please fill in your name, email and message.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email.trim())) throw new ContentError('Please enter a valid email address.');
  if (m.message.length > 5000) throw new ContentError('Your message is too long.');
  const db = await getDb();
  await db.collection('contact_messages').insertOne({ name: m.name.trim(), email: m.email.trim(), phone: m.phone.trim(), subject: m.subject || 'General Inquiry', message: m.message.trim(), read: false, createdAt: new Date() });
  sendMailSafe({
    to: process.env.CONTACT_INBOX || 'hello@shed.ng',
    replyTo: m.email,
    subject: `[Shed Contact] ${m.subject || 'New message'} — from ${m.name}`,
    html: `<p><strong>${escapeHtml(m.name)}</strong> (${escapeHtml(m.email)}${m.phone ? `, ${escapeHtml(m.phone)}` : ''})</p><p><strong>${escapeHtml(m.subject || 'General Inquiry')}</strong></p><p style="white-space:pre-line">${escapeHtml(m.message)}</p>`,
  });
}

/* ─────────────── Market clusters ─────────────── */

export async function listClusters() {
  const db = await getDb();
  const clusters = await db.collection('market_clusters').find({ isActive: true }).sort({ name: 1 }).toArray();
  const counts = await db.collection('admins').aggregate([{ $match: { clusterId: { $in: clusters.map((c) => c._id) }, isVerified: true } }, { $group: { _id: '$clusterId', n: { $sum: 1 } } }]).toArray();
  const m = new Map(counts.map((c) => [String(c._id), c.n]));
  return serialize(clusters.map((c) => ({ ...c, storeCount: m.get(String(c._id)) || 0 })));
}

export async function getCluster(slug: string, q = '', page = 1) {
  const db = await getDb();
  const cluster = await db.collection('market_clusters').findOne({ slug: ci(slug), isActive: true });
  if (!cluster) return null;
  // Only superadmin-verified stores appear publicly in a cluster; locked stores are hidden.
  const stores = (await db.collection('admins').find({ clusterId: cluster._id, isVerified: true }).project({ username: 1, businessName: 1, logo: 1, description: 1, category: 1, subscription: 1, currency: 1 }).toArray()).filter((s) => !isAccountLocked(s));
  const limit = 24;
  const match: any = { adminId: { $in: stores.map((s) => s._id) }, stock: { $gt: 0 } };
  if (q.trim()) {
    const rx = { $regex: escapeRegex(q.trim()), $options: 'i' };
    match.$or = [{ name: rx }, { description: rx }];
  }
  const total = stores.length ? await db.collection('inventory').countDocuments(match) : 0;
  const products = stores.length ? await db.collection('inventory').find(match).sort({ name: 1 }).skip((Math.max(1, page) - 1) * limit).limit(limit).toArray() : [];
  const sMap = new Map(stores.map((s) => [String(s._id), s]));
  return serialize({
    cluster,
    stores: stores.map(({ subscription, ...s }) => s),
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    page: Math.max(1, page),
    products: products.map((p) => {
      const s: any = sMap.get(String(p.adminId));
      return { id: String(p._id), name: p.name, price: Number(p.cost) || 0, stock: p.stock, image: p.images?.[0] || '', storeUsername: s?.username, storeName: s?.businessName || s?.username, currency: s?.currency || '₦' };
    }),
  });
}

export const featuredClusters = async () => (await listClusters()).sort((a: any, b: any) => b.storeCount - a.storeCount).slice(0, 6);
