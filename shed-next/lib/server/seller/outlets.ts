import 'server-only';
import bcrypt from 'bcryptjs';
import { getClient, getDb, oid, ci, serialize, ObjectId } from '../db';
import type { SellerContext } from '../auth';
import { getSession, updateSession } from '../session';

/* Outlets (port of outletController.js): a store owner hands stock to an outlet
 * (e.g. a kiosk or agent), the outlet sells it through its own portal and earns
 * a commission per product, which the owner pays out. */

export class OutletError extends Error {
  status = 400;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function pendingByOutlet(adminId: ObjectId) {
  const db = await getDb();
  const rows = await db.collection('commissions').aggregate([{ $match: { adminId, status: 'pending' } }, { $group: { _id: '$outletId', total: { $sum: '$amount' } } }]).toArray();
  return new Map(rows.map((r) => [String(r._id), round2(r.total)]));
}

export async function listOutlets(ctx: SellerContext) {
  const db = await getDb();
  const outlets = await db.collection('outlets').find({ adminId: ctx.admin._id }).project({ password: 0 }).sort({ name: 1 }).toArray();
  const pending = await pendingByOutlet(ctx.admin._id);
  const sales = await db
    .collection('sales')
    .aggregate([{ $match: { adminId: ctx.admin._id, outletId: { $in: outlets.map((o) => o._id) } } }, { $group: { _id: '$outletId', amount: { $sum: '$totalAmount' }, n: { $sum: 1 } } }])
    .toArray();
  const sMap = new Map(sales.map((s) => [String(s._id), s]));
  return serialize(
    outlets.map((o) => ({
      ...o,
      stockUnits: (o.inventory || []).reduce((n: number, i: any) => n + Math.max(0, i.stock || 0), 0),
      commissionDue: pending.get(String(o._id)) || 0,
      salesAmount: sMap.get(String(o._id))?.amount || 0,
      salesCount: sMap.get(String(o._id))?.n || 0,
    })),
  );
}

export async function createOutlet(ctx: SellerContext, o: { name: string; location: string; mobile: string; username: string; password: string }) {
  const name = o.name.trim();
  const username = o.username.trim();
  if (!name) throw new OutletError('Outlet name is required.');
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) throw new OutletError('Outlet username must be 3–30 letters, numbers, dots, dashes or underscores.');
  if ((o.password || '').length < 8) throw new OutletError('Outlet password must be at least 8 characters.');
  const db = await getDb();
  if (await db.collection('outlets').findOne({ username: ci(username) })) throw new OutletError('That outlet username is taken.');
  const r = await db.collection('outlets').insertOne({ name, location: o.location.trim(), mobile: o.mobile.trim(), username, password: await bcrypt.hash(o.password, 10), adminId: ctx.admin._id, inventory: [], createdAt: new Date() });
  return String(r.insertedId);
}

async function ownOutlet(ctx: SellerContext, id: string) {
  const _id = oid(id);
  if (!_id) throw new OutletError('Invalid outlet.');
  const db = await getDb();
  const outlet = await db.collection('outlets').findOne({ _id, adminId: ctx.admin._id });
  if (!outlet) throw new OutletError('Outlet not found.');
  return outlet;
}

export async function getOutlet(ctx: SellerContext, id: string) {
  const _id = oid(id);
  if (!_id) return null;
  const db = await getDb();
  const outlet = await db.collection('outlets').findOne({ _id, adminId: ctx.admin._id }, { projection: { password: 0 } });
  if (!outlet) return null;
  const [sales, commissions, payments] = await Promise.all([
    db.collection('sales').find({ outletId: _id }).sort({ date: -1 }).limit(50).toArray(),
    db.collection('commissions').find({ outletId: _id, status: 'pending' }).sort({ date: -1 }).toArray(),
    db.collection('commission_payments').find({ outletId: _id }).sort({ datePaid: -1 }).limit(20).toArray(),
  ]);
  return serialize({ outlet, sales, commissions, payments, commissionDue: round2(commissions.reduce((n, c) => n + (c.amount || 0), 0)) });
}

export async function updateOutlet(ctx: SellerContext, id: string, o: { name: string; location: string; mobile: string; password?: string }) {
  const outlet = await ownOutlet(ctx, id);
  const $set: any = { name: o.name.trim() || outlet.name, location: o.location.trim(), mobile: o.mobile.trim(), updatedAt: new Date() };
  if (o.password) {
    if (o.password.length < 8) throw new OutletError('Outlet password must be at least 8 characters.');
    $set.password = await bcrypt.hash(o.password, 10);
  }
  const db = await getDb();
  await db.collection('outlets').updateOne({ _id: outlet._id }, { $set });
}

export async function deleteOutlet(ctx: SellerContext, id: string) {
  const outlet = await ownOutlet(ctx, id);
  const db = await getDb();
  // Return any unsold outlet stock to the main inventory.
  for (const it of outlet.inventory || []) {
    const pid = oid(it.id || it._id);
    if (pid && it.stock > 0) await db.collection('inventory').updateOne({ _id: pid, adminId: ctx.admin._id }, { $inc: { stock: it.stock } });
  }
  await db.collection('outlets').deleteOne({ _id: outlet._id });
}

/** Move stock from the main inventory to an outlet (or back, with a negative quantity). */
export async function dispense(ctx: SellerContext, outletId: string, itemId: string, quantity: number) {
  const qty = Math.trunc(Number(quantity));
  if (!qty) throw new OutletError('Enter a quantity.');
  const outlet = await ownOutlet(ctx, outletId);
  const pid = oid(itemId);
  const db = await getDb();
  const product = pid && (await db.collection('inventory').findOne({ _id: pid, adminId: ctx.admin._id }));
  if (!product) throw new OutletError('Product not found.');
  const existing = (outlet.inventory || []).find((i: any) => String(i.id || i._id) === String(pid));
  if (qty > 0) {
    const dec = await db.collection('inventory').updateOne({ _id: pid, stock: { $gte: qty } }, { $inc: { stock: -qty } });
    if (!dec.matchedCount) throw new OutletError(`Not enough stock. Only ${product.stock} ${product.name} left.`);
  } else {
    if (!existing || existing.stock < -qty) throw new OutletError(`The outlet only has ${existing?.stock || 0} of this item.`);
    await db.collection('inventory').updateOne({ _id: pid }, { $inc: { stock: -qty } });
  }
  const inventory = [...(outlet.inventory || [])];
  const idx = inventory.findIndex((i: any) => String(i.id || i._id) === String(pid));
  if (idx >= 0) inventory[idx] = { ...inventory[idx], id: String(pid), name: product.name, cost: product.cost, stock: (inventory[idx].stock || 0) + qty };
  else inventory.push({ id: String(pid), name: product.name, cost: product.cost, stock: qty });
  await db.collection('outlets').updateOne({ _id: outlet._id }, { $set: { inventory: inventory.filter((i: any) => i.stock > 0 || String(i.id) !== String(pid)) } });
}

export async function payCommission(ctx: SellerContext, outletId: string) {
  const outlet = await ownOutlet(ctx, outletId);
  const db = await getDb();
  const pending = await db.collection('commissions').find({ outletId: outlet._id, status: 'pending' }).toArray();
  if (!pending.length) throw new OutletError('There is no commission to pay.');
  const amount = round2(pending.reduce((n, c) => n + (c.amount || 0), 0));
  const client = await getClient();
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection('commissions').updateMany({ _id: { $in: pending.map((c) => c._id) } }, { $set: { status: 'paid', paidAt: new Date() } }, { session });
      await db.collection('commission_payments').insertOne({ adminId: ctx.admin._id, outletId: outlet._id, outletName: outlet.name, amount, datePaid: new Date(), commissionIds: pending.map((c) => c._id) }, { session });
      await db.collection('transactions').insertOne({ adminId: ctx.admin._id, type: 'commission_payment', amount, date: new Date(), description: `Commission payment to outlet: ${outlet.name}`, reference: `COMM-${outlet._id}-${Date.now()}`, balanceImpact: -1 }, { session });
    });
  } finally {
    await session.endSession();
  }
  return amount;
}

/* ─────────────── Outlet portal (outlet staff sign in with the outlet's username) ─────────────── */

export async function outletSignIn(usernameOrEmail: string, password: string) {
  const id = (usernameOrEmail || '').trim();
  const db = await getDb();
  const outlet = await db.collection('outlets').findOne({ $or: [{ username: ci(id) }, { email: ci(id) }] });
  if (!outlet || !(await bcrypt.compare(password || '', outlet.password || ''))) throw new OutletError('Invalid username or password.');
  await updateSession({ outletId: String(outlet._id) });
}

export async function outletSignOut() {
  await updateSession({ outletId: undefined });
}

export async function currentOutlet() {
  const s = await getSession();
  const _id = oid(s?.outletId);
  if (!_id) return null;
  const db = await getDb();
  const outlet = await db.collection('outlets').findOne({ _id }, { projection: { password: 0 } });
  if (!outlet) return null;
  const admin = await db.collection('admins').findOne({ _id: outlet.adminId }, { projection: { businessName: 1, logo: 1, currency: 1, username: 1 } });
  return { outlet, admin };
}

/** An outlet records a sale from its own stock. Prices + commission come from the owner's product. */
export async function outletSale(lines: { itemId: string; quantity: number }[], customer: { name: string; phone: string; email: string }, paymentMethod: string) {
  const cur = await currentOutlet();
  if (!cur) throw new OutletError('Please sign in again.');
  const { outlet } = cur;
  const clean = lines.map((l) => ({ itemId: String(l.itemId), quantity: Math.floor(Number(l.quantity)) })).filter((l) => l.quantity > 0);
  if (!clean.length) throw new OutletError('Add at least one item.');
  const db = await getDb();
  const client = await getClient();
  const session = client.startSession();
  let saleId: ObjectId | null = null;
  try {
    await session.withTransaction(async () => {
      const items: any[] = [];
      let total = 0;
      let commission = 0;
      for (const l of clean) {
        const fresh = await db.collection('outlets').findOne({ _id: outlet._id }, { session });
        const oi = (fresh?.inventory || []).find((i: any) => String(i.id || i._id) === l.itemId);
        if (!oi) throw new OutletError('An item is no longer stocked at this outlet.');
        if ((oi.stock || 0) < l.quantity) throw new OutletError(`Only ${oi.stock} ${oi.name} left at this outlet.`);
        const product = await db.collection('inventory').findOne({ _id: oid(l.itemId)!, adminId: outlet.adminId }, { session });
        const unit = Number(product?.cost ?? oi.cost) || 0;
        const rate = Number(product?.commission) || 0;
        const commissionAmount = round2((unit * l.quantity * rate) / 100);
        items.push({ itemId: oid(l.itemId), itemName: oi.name, quantity: l.quantity, unitCost: unit, totalCost: unit * l.quantity, commissionRate: rate, commissionAmount });
        total += unit * l.quantity;
        commission += commissionAmount;
        const inv = (fresh!.inventory || []).map((i: any) => (String(i.id || i._id) === l.itemId ? { ...i, stock: (i.stock || 0) - l.quantity } : i));
        await db.collection('outlets').updateOne({ _id: outlet._id }, { $set: { inventory: inv } }, { session });
      }
      const r = await db.collection('sales').insertOne(
        {
          outletId: outlet._id,
          outletName: outlet.name,
          adminId: outlet.adminId,
          customerName: customer.name.trim() || 'Walk-in customer',
          phoneNumber: customer.phone.trim() || 'N/A',
          email: customer.email.trim() || 'N/A',
          items,
          totalAmount: total,
          totalCommission: round2(commission),
          date: new Date(),
          paymentMethod: paymentMethod || 'Cash',
          paymentStatus: 'Paid',
          source: 'outlet',
          status: 'completed',
        },
        { session },
      );
      saleId = r.insertedId;
      for (const it of items.filter((i) => i.commissionAmount > 0)) {
        await db.collection('commissions').insertOne({ saleId: r.insertedId, adminId: outlet.adminId, outletId: outlet._id, outletName: outlet.name, itemId: it.itemId, itemName: it.itemName, quantity: it.quantity, amount: it.commissionAmount, rate: it.commissionRate, date: new Date(), status: 'pending' }, { session });
      }
    });
  } finally {
    await session.endSession();
  }
  return String(saleId);
}

export async function outletActivity(outletId: ObjectId) {
  const db = await getDb();
  const sales = await db.collection('sales').find({ outletId }).sort({ date: -1 }).limit(200).toArray();
  const pending = await db.collection('commissions').aggregate([{ $match: { outletId, status: 'pending' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]).toArray();
  const paid = await db.collection('commissions').aggregate([{ $match: { outletId, status: 'paid' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]).toArray();
  return serialize({ sales, commissionPending: round2(pending[0]?.t || 0), commissionPaid: round2(paid[0]?.t || 0) });
}

/** Public outlet page (/outlet/:username). */
export async function publicOutlet(username: string) {
  const db = await getDb();
  const outlet = await db.collection('outlets').findOne({ username: ci(username) }, { projection: { password: 0 } });
  if (!outlet) return null;
  const admin = await db.collection('admins').findOne({ _id: outlet.adminId });
  if (!admin) return null;
  const ids = (outlet.inventory || []).filter((i: any) => i.stock > 0).map((i: any) => oid(i.id || i._id)).filter(Boolean) as ObjectId[];
  const products = await db.collection('inventory').find({ _id: { $in: ids } }).toArray();
  const pMap = new Map(products.map((p) => [String(p._id), p]));
  const items = (outlet.inventory || [])
    .filter((i: any) => i.stock > 0)
    .map((i: any) => {
      const p = pMap.get(String(i.id || i._id));
      return { id: String(i.id || i._id), name: i.name, cost: Number(p?.cost ?? i.cost) || 0, stock: i.stock, image: p?.images?.[0] || null };
    });
  return serialize({ outlet: { name: outlet.name, username: outlet.username, location: outlet.location || '', mobile: outlet.mobile || '' }, store: { username: admin.username, businessName: admin.businessName || admin.username, logo: admin.logo || null, currency: admin.currency || '₦' }, items });
}
