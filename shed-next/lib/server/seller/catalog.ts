import 'server-only';
import { getDb, oid, escapeRegex, serialize } from '../db';
import type { SellerContext } from '../auth';

/* Inventory + customers (ports of inventoryController.js and customerController.js). */

export class CatalogError extends Error {
  status = 400;
}

export interface ProductInput {
  name: string;
  description?: string;
  stock: number;
  cost: number;
  commission?: number | null;
  isVatable?: boolean;
  images?: string[];
}

function validateProduct(p: Partial<ProductInput>, partial = false) {
  if (!partial || p.name !== undefined) {
    if (!p.name?.trim()) throw new CatalogError('Product name is required.');
    if (p.name.trim().length > 120) throw new CatalogError('Product name is too long (max 120 characters).');
  }
  if (!partial || p.stock !== undefined) {
    if (!Number.isInteger(p.stock) || (p.stock as number) < 0) throw new CatalogError('Stock must be a whole number of 0 or more.');
  }
  if (!partial || p.cost !== undefined) {
    if (!Number.isFinite(p.cost) || (p.cost as number) < 0) throw new CatalogError('Price must be 0 or more.');
  }
  if (p.commission !== undefined && p.commission !== null) {
    if (!Number.isFinite(p.commission) || p.commission < 0 || p.commission > 100) throw new CatalogError('Commission must be between 0 and 100 (%).');
  }
  if (p.description && p.description.length > 400) throw new CatalogError('Description cannot exceed 400 characters.');
}

export async function listProducts(ctx: SellerContext, opts: { q?: string; filter?: 'low' | 'out' | '' } = {}) {
  const db = await getDb();
  const query: any = { adminId: ctx.admin._id };
  if (opts.q?.trim()) query.name = { $regex: escapeRegex(opts.q.trim()), $options: 'i' };
  if (opts.filter === 'low') query.stock = { $gt: 0, $lte: 5 };
  if (opts.filter === 'out') query.stock = { $lte: 0 };
  const items = await db.collection('inventory').find(query).sort({ name: 1 }).toArray();
  const counts = await db
    .collection('inventory')
    .aggregate([{ $match: { adminId: ctx.admin._id } }, { $group: { _id: null, all: { $sum: 1 }, low: { $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', 5] }] }, 1, 0] } }, out: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } }, value: { $sum: { $multiply: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$cost', 0] }] } } } }])
    .toArray();
  return serialize({ items, counts: counts[0] || { all: 0, low: 0, out: 0, value: 0 } });
}

export async function addProduct(ctx: SellerContext, p: ProductInput) {
  validateProduct(p);
  const db = await getDb();
  const doc: any = {
    name: p.name.trim(),
    description: (p.description || '').trim(),
    stock: p.stock,
    cost: p.cost,
    adminId: ctx.admin._id,
    isVatable: !!p.isVatable,
    images: (p.images || []).slice(0, 4),
    createdAt: new Date(),
  };
  if (p.commission !== undefined && p.commission !== null) doc.commission = p.commission;
  const r = await db.collection('inventory').insertOne(doc);
  return String(r.insertedId);
}

export async function updateProduct(ctx: SellerContext, id: string, p: Partial<ProductInput> & { removeImages?: string[]; addImages?: string[] }) {
  validateProduct(p, true);
  const _id = oid(id);
  if (!_id) throw new CatalogError('Invalid product.');
  const db = await getDb();
  const existing = await db.collection('inventory').findOne({ _id, adminId: ctx.admin._id });
  if (!existing) throw new CatalogError('Product not found.');
  const $set: any = { updatedAt: new Date() };
  if (p.name !== undefined) $set.name = p.name.trim();
  if (p.description !== undefined) $set.description = p.description.trim();
  if (p.stock !== undefined) $set.stock = p.stock;
  if (p.cost !== undefined) $set.cost = p.cost;
  if (p.isVatable !== undefined) $set.isVatable = p.isVatable;
  const update: any = { $set };
  if (p.commission === null) update.$unset = { commission: '' };
  else if (p.commission !== undefined) $set.commission = p.commission;
  if (p.removeImages?.length || p.addImages?.length) {
    const images = (existing.images || []).filter((i: string) => !p.removeImages?.includes(i)).concat(p.addImages || []);
    if (images.length > 4) throw new CatalogError('A product can have up to 4 photos.');
    $set.images = images;
  }
  await db.collection('inventory').updateOne({ _id }, update);
}

export async function deleteProduct(ctx: SellerContext, id: string) {
  const _id = oid(id);
  if (!_id) throw new CatalogError('Invalid product.');
  const db = await getDb();
  const r = await db.collection('inventory').deleteOne({ _id, adminId: ctx.admin._id });
  if (!r.deletedCount) throw new CatalogError('Product not found.');
}

/** Products available to sell (POS / invoices). */
export async function sellableProducts(ctx: SellerContext) {
  const db = await getDb();
  const items = await db.collection('inventory').find({ adminId: ctx.admin._id }).project({ name: 1, cost: 1, stock: 1, images: 1, isVatable: 1 }).sort({ name: 1 }).toArray();
  return serialize(items) as { _id: string; name: string; cost: number; stock: number; images?: string[]; isVatable?: boolean }[];
}

/* ─────────────── Customers ─────────────── */

export async function listCustomers(ctx: SellerContext, q = '') {
  const db = await getDb();
  const match: any = { adminId: ctx.admin._id };
  if (q.trim()) {
    const rx = { $regex: escapeRegex(q.trim()), $options: 'i' };
    match.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  const rows = await db
    .collection('customers')
    .aggregate([
      { $match: match },
      { $lookup: { from: 'sales', localField: '_id', foreignField: 'customerId', as: 'sales' } },
      {
        $project: {
          name: 1, phone: 1, email: 1, createdAt: 1,
          orders: { $size: '$sales' },
          totalValue: { $sum: '$sales.totalAmount' },
          lastPurchase: { $max: '$sales.date' },
        },
      },
      { $sort: { name: 1 } },
    ])
    .toArray();
  return serialize(rows);
}

export async function getCustomer(ctx: SellerContext, id: string) {
  const _id = oid(id);
  if (!_id) return null;
  const db = await getDb();
  const customer = await db.collection('customers').findOne({ _id, adminId: ctx.admin._id });
  if (!customer) return null;
  const sales = await db.collection('sales').find({ customerId: _id, adminId: ctx.admin._id }).sort({ date: -1 }).limit(100).toArray();
  return serialize({ customer, sales });
}

function cleanCustomer(c: { name: string; phone?: string; email?: string }) {
  const name = (c.name || '').trim();
  if (!name) throw new CatalogError('Customer name is required.');
  const email = (c.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CatalogError('Enter a valid email address.');
  return { name, phone: (c.phone || '').trim() || 'N/A', email: email || 'N/A' };
}

export async function addCustomer(ctx: SellerContext, c: { name: string; phone?: string; email?: string }) {
  const db = await getDb();
  const r = await db.collection('customers').insertOne({ adminId: ctx.admin._id, ...cleanCustomer(c), createdAt: new Date() });
  return String(r.insertedId);
}

export async function updateCustomer(ctx: SellerContext, id: string, c: { name: string; phone?: string; email?: string }) {
  const _id = oid(id);
  if (!_id) throw new CatalogError('Invalid customer.');
  const db = await getDb();
  const r = await db.collection('customers').updateOne({ _id, adminId: ctx.admin._id }, { $set: { ...cleanCustomer(c), updatedAt: new Date() } });
  if (!r.matchedCount) throw new CatalogError('Customer not found.');
}

export async function deleteCustomer(ctx: SellerContext, id: string) {
  const _id = oid(id);
  if (!_id) throw new CatalogError('Invalid customer.');
  const db = await getDb();
  await db.collection('customers').deleteOne({ _id, adminId: ctx.admin._id });
}

export async function customerOptions(ctx: SellerContext) {
  const db = await getDb();
  const rows = await db.collection('customers').find({ adminId: ctx.admin._id }).project({ name: 1, phone: 1, email: 1 }).sort({ name: 1 }).limit(2000).toArray();
  return serialize(rows) as { _id: string; name: string; phone?: string; email?: string }[];
}
