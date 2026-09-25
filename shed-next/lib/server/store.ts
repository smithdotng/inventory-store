import 'server-only';
import crypto from 'crypto';
import countryCodes from 'country-code-lookup';
import { getClient, getDb, oid, ci, escapeRegex, serialize, ObjectId } from './db';
import { env } from './env';
import { sendMailSafe } from './mailer';
import { isAccountLocked, storeOpenFilter } from './subscription';
import type { MarketProduct, MarketStore, Paged, Product, Sale, Store } from '../types';

/* ─────────────────────────── Public shapes ─────────────────────────── */

export function buildPublicStore(admin: any): Store {
  let whatsappNumber = '';
  if (admin.publicPhone && admin.phone) {
    let phone = String(admin.phone).replace(/\D/g, '');
    let code = '+234';
    if (admin.country) {
      try {
        const c: any = countryCodes.byIso(admin.country) || countryCodes.byCountry(admin.country);
        const calling = c?.countryCallingCodes?.[0] || (c?.isoNo && null);
        if (calling) code = '+' + String(calling).replace(/\D/g, '');
      } catch {
        /* keep default */
      }
    }
    phone = phone.replace(/^0+/, '');
    whatsappNumber = code + phone;
    if (whatsappNumber.length < 10 || whatsappNumber.length > 15) whatsappNumber = '';
  }
  return serialize({
    _id: admin._id,
    username: admin.username,
    businessName: admin.businessName || admin.username,
    logo: admin.logo || null,
    currency: admin.currency || '₦',
    country: admin.country || null,
    category: admin.category || null,
    description: admin.description || '',
    paymentInstructions: admin.paymentInstructions || '',
    whatsappNumber,
    social: {
      instagram: admin.instagram || admin.social?.instagram || null,
      twitter: admin.twitter || admin.social?.twitter || null,
      facebook: admin.facebook || admin.social?.facebook || null,
      website: admin.website || admin.social?.website || null,
    },
  });
}

export function publicProduct(item: any, admin?: any): Product {
  return serialize({
    _id: item._id,
    name: item.name,
    cost: Number(item.cost) || 0,
    stock: Number(item.stock) || 0,
    images: Array.isArray(item.images) ? item.images : [],
    description: item.description || '',
    // Products don't carry a category; fall back to the store's business category.
    category: item.category || admin?.category || null,
  });
}

export async function findStoreByUsername(username: string) {
  const db = await getDb();
  return db.collection('admins').findOne({ username: ci(username) });
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
export class NotFound extends ApiError {
  constructor(message = 'Not found') {
    super(message, 404);
  }
}

/* ─────────────────────────── Store & product ─────────────────────────── */

export async function getPublicStore(username: string) {
  const admin = await findStoreByUsername(username);
  if (!admin) throw new NotFound('Store not found');
  const db = await getDb();
  const inventory = await db.collection('inventory').find({ adminId: admin._id, stock: { $gt: 0 } }).sort({ createdAt: -1, _id: -1 }).toArray();
  return { store: buildPublicStore(admin), products: inventory.map((i) => publicProduct(i, admin)), locked: isAccountLocked(admin) };
}

export async function getPublicProduct(username: string, id: string) {
  const _id = oid(id);
  if (!_id) throw new NotFound('Product not found');
  const admin = await findStoreByUsername(username);
  if (!admin) throw new NotFound('Store not found');
  const db = await getDb();
  const product = await db.collection('inventory').findOne({ _id, adminId: admin._id });
  if (!product) throw new NotFound('Product not found');
  return { store: buildPublicStore(admin), product: publicProduct(product, admin), locked: isAccountLocked(admin) };
}

/* ─────────────────────────── Marketplace ─────────────────────────── */

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'name';
const SORTS: Record<ProductSort, Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { cost: 1, _id: 1 },
  price_desc: { cost: -1, _id: -1 },
  name: { name: 1, _id: 1 },
};

/**
 * Marketplace listing: in-stock products from active, unlocked stores.
 * `category` matches the product's own category or its store's business category.
 */
export async function listProducts(opts: { q?: string; category?: string; sort?: string; page?: number; limit?: number } = {}): Promise<Paged<MarketProduct>> {
  const db = await getDb();
  const q = (opts.q || '').trim();
  const category = (opts.category || '').trim();
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(Math.max(opts.limit || 24, 1), 60);
  const sort = SORTS[(opts.sort as ProductSort) || 'newest'] || SORTS.newest;

  const match: any = { stock: { $gt: 0 } };
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    match.$or = [{ name: rx }, { description: rx }, { category: rx }];
  }
  const storeMatch: any = { 'store.active': { $ne: false }, ...storeOpenFilter() };
  const and: any[] = [storeMatch];
  if (category) {
    const exact = { $regex: `^${escapeRegex(category)}$`, $options: 'i' };
    and.push({ $or: [{ category: exact }, { 'store.category': exact }] });
  }

  const [out] = await db
    .collection('inventory')
    .aggregate([
      { $match: match },
      { $lookup: { from: 'admins', localField: 'adminId', foreignField: '_id', as: 'store' } },
      { $unwind: '$store' },
      { $match: { $and: and } },
      {
        $facet: {
          total: [{ $count: 'n' }],
          items: [
            { $sort: sort },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                name: 1, description: 1, cost: 1, stock: 1, category: 1, images: 1,
                'store.businessName': 1, 'store.username': 1, 'store.logo': 1, 'store.location': 1, 'store.currency': 1, 'store.category': 1,
              },
            },
          ],
        },
      },
    ])
    .toArray();

  const total = out?.total?.[0]?.n || 0;
  const results: MarketProduct[] = (out?.items || []).map((p: any) => ({
    id: String(p._id),
    name: p.name,
    description: p.description || '',
    price: Number(p.cost) || 0,
    image: Array.isArray(p.images) && p.images.length ? p.images[0] : '',
    stock: Number(p.stock) || 0,
    category: p.category || p.store.category || '',
    store: {
      name: p.store.businessName || p.store.username,
      username: p.store.username,
      logo: p.store.logo || '',
      location: p.store.location || '',
      currency: p.store.currency || '₦',
    },
  }));
  return { success: true, results, total, page, pages: Math.ceil(total / limit) };
}

/** Convenience aliases used by the storefront pages. */
export const getStore = (username: string) => getPublicStore(username);
export const getProduct = (username: string, id: string) => getPublicProduct(username, id);
export const getOrder = (username: string, saleId: string, token: string) => getPublicOrder(username, saleId, token);

export async function searchStores(opts: { q?: string; category?: string; page?: number; limit?: number } = {}): Promise<Paged<MarketStore>> {
  const db = await getDb();
  const q = (opts.q || '').trim();
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(Math.max(opts.limit || 12, 1), 60);
  const query: any = { active: { $ne: false }, role: { $ne: 'superadmin' }, username: { $ne: 'System' }, ...storeOpenFilter('') };
  const and: any[] = [];
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    and.push({ $or: [{ businessName: rx }, { username: rx }, { description: rx }] });
  }
  if (opts.category) and.push({ category: opts.category });
  if (and.length) query.$and = and;

  const total = await db.collection('admins').countDocuments(query);
  const stores = await db
    .collection('admins')
    .find(query)
    .project({ businessName: 1, username: 1, logo: 1, description: 1, location: 1, currency: 1, country: 1, category: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();
  const counts = await db
    .collection('inventory')
    .aggregate([{ $match: { adminId: { $in: stores.map((s) => s._id) }, stock: { $gt: 0 } } }, { $group: { _id: '$adminId', n: { $sum: 1 } } }])
    .toArray();
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  const results: MarketStore[] = stores.map((s: any) => ({
    id: String(s._id),
    name: s.businessName || s.username,
    username: s.username,
    logo: s.logo || '',
    description: s.description || '',
    location: s.location || '',
    currency: s.currency || '₦',
    country: s.country || '',
    productCount: byId.get(String(s._id)) || 0,
  }));
  return { success: true, results, total, page, pages: Math.ceil(total / limit) };
}

/** Typeahead suggestions (port of GET /api/search/suggestions). */
export async function suggestions(q: string, type = 'all') {
  const term = (q || '').trim();
  if (term.length < 2) return [];
  const db = await getDb();
  const rx = { $regex: escapeRegex(term), $options: 'i' };
  const out: any[] = [];
  if (type === 'all' || type === 'stores') {
    const stores = await db
      .collection('admins')
      .find({ active: { $ne: false }, role: { $ne: 'superadmin' }, $or: [{ businessName: rx }, { username: rx }] })
      .project({ businessName: 1, username: 1, logo: 1 })
      .limit(4)
      .toArray();
    stores.forEach((s: any) => out.push({ type: 'store', id: String(s._id), name: s.businessName || s.username, username: s.username, logo: s.logo, url: `/store/${s.username}` }));
  }
  if (type === 'all' || type === 'products') {
    const products = await db
      .collection('inventory')
      .aggregate([
        { $match: { stock: { $gt: 0 }, $or: [{ name: rx }, { description: rx }] } },
        { $lookup: { from: 'admins', localField: 'adminId', foreignField: '_id', as: 'store' } },
        { $unwind: '$store' },
        { $match: { 'store.active': { $ne: false } } },
        { $limit: 6 },
        { $project: { name: 1, cost: 1, images: 1, image: 1, 'store.businessName': 1, 'store.username': 1, 'store.logo': 1, 'store.currency': 1 } },
      ])
      .toArray();
    products.forEach((p: any) =>
      out.push({
        type: 'product',
        id: String(p._id),
        name: p.name,
        price: p.cost,
        currency: p.store.currency || '₦',
        image: p.image || (Array.isArray(p.images) ? p.images[0] : undefined),
        storeName: p.store.businessName,
        storeUsername: p.store.username,
        storeLogo: p.store.logo,
        url: `/store/${p.store.username}/products/${p._id}`,
      }),
    );
  }
  return out.slice(0, 8);
}

/* ─────────────────────────── Checkout & orders ─────────────────────────── */

export interface CheckoutInput {
  customerName: string;
  phoneNumber: string;
  email: string;
  cartItems: { id: string; name?: string; cost?: number; quantity: number }[];
}

export class CheckoutError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Guest checkout for one store (port of POST /store/:username/checkout).
 * Creates customer + sale + transaction + invoice token atomically, decrements
 * stock, notifies the seller (inbox message + email) and upserts a buyer profile.
 * Prices always come from the database, never from the client.
 */
export async function checkout(username: string, input: CheckoutInput) {
  const customerName = (input.customerName || '').trim();
  const phone = (input.phoneNumber || '').trim();
  const email = (input.email || '').trim().toLowerCase();
  const missing = [!customerName && 'customerName', !phone && 'phoneNumber', !email && 'email', !input.cartItems && 'cartItems'].filter(Boolean);
  if (missing.length) throw new CheckoutError(`Missing required fields: ${missing.join(', ')}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CheckoutError('Invalid email format');
  if (!/^\+?[\d\s-]{6,}$/.test(phone)) throw new CheckoutError('Invalid phone number format');
  const cart = Array.isArray(input.cartItems) ? input.cartItems : [];
  if (!cart.length) throw new CheckoutError('No items in cart');
  for (const it of cart) {
    if (!it.id || !oid(it.id)) throw new CheckoutError(`Invalid item ID: ${it.id}`);
    if (!Number.isInteger(Number(it.quantity)) || Number(it.quantity) <= 0) throw new CheckoutError(`Invalid quantity for ${it.name || 'item'}`);
  }

  const db = await getDb();
  const admin = await db.collection('admins').findOne({ username: ci(username) });
  if (!admin) throw new CheckoutError('Store not found', 404);
  if (isAccountLocked(admin)) throw new CheckoutError('This store is temporarily unavailable.', 503);

  const client = await getClient();
  const session = client.startSession();
  let result: { saleId: ObjectId; token: string; totalAmount: number; items: any[] } | null = null;
  try {
    await session.withTransaction(async () => {
      const customer = { adminId: admin._id, name: customerName, phone, email, createdAt: new Date() };
      const customerRes = await db.collection('customers').insertOne(customer, { session });

      const items: any[] = [];
      let totalAmount = 0;
      for (const line of cart) {
        const qty = Number(line.quantity);
        const item = await db.collection('inventory').findOne({ _id: oid(line.id)!, adminId: admin._id }, { session });
        if (!item) throw new CheckoutError(`Item not found: ${line.name || line.id}`);
        if ((item.stock || 0) < qty) throw new CheckoutError(`Insufficient stock for ${item.name}`);
        const unitCost = Number(item.cost) || 0;
        items.push({ itemId: item._id, itemName: item.name, quantity: qty, unitCost, totalCost: unitCost * qty });
        totalAmount += unitCost * qty;
        await db.collection('inventory').updateOne({ _id: item._id }, { $inc: { stock: -qty } }, { session });
      }

      const sale = {
        adminId: admin._id,
        customerId: customerRes.insertedId,
        customerName,
        phoneNumber: phone,
        email,
        items,
        totalAmount,
        paymentMethod: 'Online',
        paymentStatus: 'Pending',
        date: new Date(),
        source: 'storefront',
        status: 'completed',
      };
      const saleRes = await db.collection('sales').insertOne(sale, { session });
      await db.collection('transactions').insertOne(
        { adminId: admin._id, type: 'sale', amount: totalAmount, date: new Date(), description: `Online store sale #${saleRes.insertedId}`, reference: `SALE-${saleRes.insertedId}`, balanceImpact: 1 },
        { session },
      );
      const token = crypto.randomBytes(32).toString('hex');
      // Confirmation links stay valid for 30 days (was 1 hour, which broke links in emails).
      await db.collection('invoice_tokens').insertOne({ saleId: saleRes.insertedId, token, expires: Date.now() + 30 * 86400000 }, { session });

      let system = await db.collection('admins').findOne({ username: 'System', role: 'superadmin' }, { session });
      if (!system) {
        const r = await db.collection('admins').insertOne({ username: 'System', email: 'system@shed.ng', password: 'N/A', role: 'superadmin', createdAt: new Date() }, { session });
        system = { _id: r.insertedId } as any;
      }
      const cur = admin.currency || '₦';
      const itemsText = items.map((i) => `- ${i.itemName}: ${i.quantity} x ${cur}${i.unitCost.toFixed(2)} = ${cur}${i.totalCost.toFixed(2)}`).join('\n');
      const text = `New Transaction Notification\nA new transaction has been completed on your online store.\n\nTransaction Details:\n- Sale ID: ${saleRes.insertedId}\n- Customer Name: ${customerName}\n- Customer Email: ${email}\n- Customer Phone: ${phone}\n- Date: ${sale.date.toLocaleString()}\n- Total Amount: ${cur}${totalAmount.toFixed(2)}\n\nItems Purchased:\n${itemsText}\n\nPayment Method: Online\nPayment Status: Pending`;
      await db.collection('messages').insertOne(
        { senderId: system!._id, subject: `New Transaction: Sale #${saleRes.insertedId}`, content: `<pre>${escapeHtml(text)}</pre>`, recipientId: admin._id, createdAt: new Date(), read: false, readAt: null, isHtml: true },
        { session },
      );
      await db.collection('buyer_profiles').updateOne(
        { email },
        { $set: { name: customerName, phone, lastPurchase: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, session },
      );
      result = { saleId: saleRes.insertedId, token, totalAmount, items };
    });
  } finally {
    await session.endSession();
  }
  if (!result) throw new CheckoutError('Error processing your order', 500);
  const r = result as { saleId: ObjectId; token: string; totalAmount: number };

  if (admin.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email)) {
    sendMailSafe({
      from: env.businessUser,
      to: admin.email,
      subject: `New order on your store: #${String(r.saleId).slice(-8).toUpperCase()}`,
      html: `<h1>New order</h1><p>Dear ${escapeHtml(admin.firstName || admin.username)},</p><p>${escapeHtml(customerName)} just placed an order on your online store.</p><p>Total: ${admin.currency || '₦'}${r.totalAmount.toFixed(2)}</p><p><a href="${env.baseUrl}/dashboard/sales/${r.saleId}">View the order</a></p>`,
    });
  }
  return { saleId: String(r.saleId), token: r.token, invoiceUrl: `/store/${admin.username}/confirmation/${r.saleId}?token=${r.token}` };
}

async function verifyOrderToken(saleId: string, token: string) {
  const _id = oid(saleId);
  if (!_id) throw new NotFound('Invalid sale ID');
  const db = await getDb();
  const entry = await db.collection('invoice_tokens').findOne({ saleId: _id, token });
  if (!entry || entry.expires < Date.now()) throw new NotFound('This link is invalid or has expired');
  const sale = await db.collection('sales').findOne({ _id, source: 'storefront' });
  if (!sale) throw new NotFound('Sale not found');
  return sale;
}

export async function getPublicOrder(username: string, saleId: string, token: string) {
  const sale = await verifyOrderToken(saleId, token);
  const admin = await findStoreByUsername(username);
  if (!admin || String(admin._id) !== String(sale.adminId)) throw new NotFound('Store not found');
  return {
    store: buildPublicStore(admin),
    sale: serialize({
      _id: sale._id,
      customerName: sale.customerName || '',
      phoneNumber: sale.phoneNumber || '',
      email: sale.email || '',
      items: sale.items || [],
      totalAmount: sale.totalAmount || 0,
      paymentStatus: sale.paymentStatus || 'Pending',
      createdAt: sale.date || sale.createdAt || null,
    }) as Sale,
    pdfUrl: `/api/public/store/${admin.username}/order/${sale._id}/invoice.pdf?token=${encodeURIComponent(token)}`,
  };
}

export async function getPublicOrderForPdf(username: string, saleId: string, token: string) {
  const sale = await verifyOrderToken(saleId, token);
  const admin = await findStoreByUsername(username);
  if (!admin || String(admin._id) !== String(sale.adminId)) throw new NotFound('Store not found');
  return { sale, admin };
}

export function escapeHtml(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
