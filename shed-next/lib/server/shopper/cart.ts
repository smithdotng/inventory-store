import 'server-only';
import { getDb, oid, ObjectId } from '../db';
import { env } from '../env';
import { sendMailSafe } from '../mailer';
import * as flw from '../flutterwave';
import { isAccountLocked } from '../subscription';
import { escapeHtml } from '../store';
import type { ShopperSession } from './account';
import type { CartItem } from '../../types';

/* Signed-in shopper cart (persisted across devices) + online card payment
 * through Flutterwave for the whole, possibly multi-store, cart.
 * Port of cartController.js. Everything is re-priced from the database. */

const CURRENCY = process.env.FLW_CURRENCY || 'NGN';
export class CartError extends Error {
  status = 400;
}

type Line = { itemId: string; quantity: number };

/** Live view of cart lines as CartItem[] (drops missing / sold-out items, caps to stock). */
export async function hydrate(lines: Line[]): Promise<CartItem[]> {
  const ids = lines.map((l) => oid(l.itemId)).filter(Boolean) as ObjectId[];
  if (!ids.length) return [];
  const db = await getDb();
  const products = await db.collection('inventory').find({ _id: { $in: ids } }).toArray();
  const adminIds = [...new Set(products.map((p) => String(p.adminId)))].map((i) => oid(i)!).filter(Boolean);
  const admins = await db.collection('admins').find({ _id: { $in: adminIds } }).toArray();
  const pMap = new Map(products.map((p) => [String(p._id), p]));
  const aMap = new Map(admins.map((a) => [String(a._id), a]));
  const out: CartItem[] = [];
  for (const l of lines) {
    const p = pMap.get(String(l.itemId));
    const a = p && aMap.get(String(p.adminId));
    if (!p || !a || (p.stock || 0) <= 0) continue;
    out.push({
      id: String(p._id),
      name: p.name,
      cost: Number(p.cost) || 0,
      stock: p.stock || 0,
      image: Array.isArray(p.images) ? p.images[0] : undefined,
      quantity: Math.max(1, Math.min(Math.floor(Number(l.quantity) || 1), p.stock || 0)),
      storeUsername: a.username,
      storeName: a.businessName || a.username,
      currency: a.currency || '₦',
    });
  }
  return out;
}

export async function getServerCart(s: ShopperSession) {
  const db = await getDb();
  const cart = await db.collection('carts').findOne({ shopperId: oid(s.id)! });
  return hydrate((cart?.items || []).map((i: any) => ({ itemId: String(i.itemId), quantity: i.quantity })));
}

/** Replace the saved cart (the browser sends its merged cart). */
export async function saveServerCart(s: ShopperSession, lines: Line[]) {
  const items = await hydrate(lines.slice(0, 100));
  const db = await getDb();
  const idToAdmin = new Map<string, ObjectId>();
  const prods = await db.collection('inventory').find({ _id: { $in: items.map((i) => oid(i.id)!) } }).project({ adminId: 1 }).toArray();
  prods.forEach((p) => idToAdmin.set(String(p._id), p.adminId));
  await db.collection('carts').updateOne(
    { shopperId: oid(s.id)! },
    { $set: { items: items.map((i) => ({ adminId: idToAdmin.get(i.id), itemId: oid(i.id), quantity: i.quantity, addedAt: new Date() })), updatedAt: new Date() } },
    { upsert: true },
  );
  return items;
}

/** Start one Flutterwave payment for the given lines. Returns the hosted checkout URL. */
export async function startOnlineCheckout(s: ShopperSession, lines: Line[]) {
  if (!flw.flutterwaveConfigured) throw new CartError('Online payment is not available right now. Please use "Pay the seller directly".');
  const items = await hydrate(lines);
  const db = await getDb();
  const shopper = await db.collection('shoppers').findOne({ _id: oid(s.id)! });
  if (!shopper) throw new CartError('Please sign in again.');
  const admins = await db.collection('admins').find({ username: { $in: [...new Set(items.map((i) => i.storeUsername))] } }).toArray();
  const groups = admins
    .filter((a) => !isAccountLocked(a))
    .map((a) => {
      const its = items.filter((i) => i.storeUsername === a.username);
      return { adminId: String(a._id), storeName: a.businessName || a.username, items: its.map((i) => ({ itemId: i.id, name: i.name, cost: i.cost, quantity: i.quantity })), subtotal: its.reduce((n, i) => n + i.cost * i.quantity, 0) };
    })
    .filter((g) => g.items.length);
  const total = groups.reduce((n, g) => n + g.subtotal, 0);
  if (!groups.length || total <= 0) throw new CartError('Nothing in your cart can be paid for right now.');

  const txRef = `CART-${s.id}-${Date.now()}`;
  await db.collection('pending_cart_orders').insertOne({ txRef, shopperId: shopper._id, groups, grandTotal: total, status: 'pending', createdAt: new Date() });
  return flw.initializeStandardPayment({
    amount: total,
    currency: CURRENCY,
    email: shopper.email,
    name: `${shopper.firstName || ''} ${shopper.lastName || ''}`.trim() || shopper.email,
    phone: shopper.phone,
    tx_ref: txRef,
    redirect_url: `${env.baseUrl}/cart/checkout/callback`,
    title: 'Shed checkout',
    description: `Order from ${groups.length} store${groups.length === 1 ? '' : 's'}`,
    meta: { shopperId: s.id, type: 'cart_checkout' },
  });
}

/** Redirect handler. Returns where to send the shopper. */
export async function handleCheckoutCallback(q: { status?: string | null; tx_ref?: string | null; transaction_id?: string | null }) {
  const txRef = q.tx_ref || '';
  const db = await getDb();
  const order = await db.collection('pending_cart_orders').findOne({ txRef });
  if (!order) return `/shopper/account?error=${encodeURIComponent('We could not find that order.')}`;
  if (order.status === 'completed') return `/shopper/account?paid=${encodeURIComponent(txRef)}`;
  if (q.status !== 'successful' || !q.transaction_id) {
    await db.collection('pending_cart_orders').updateOne({ _id: order._id, status: 'pending' }, { $set: { status: 'failed' } });
    return `/shopper/account?error=${encodeURIComponent('Payment was not completed. Your cart has been kept.')}`;
  }
  try {
    const v = await flw.verifyTransactionById(q.transaction_id);
    if (v.status !== 'successful' || v.tx_ref !== txRef || Number(v.amount) < Number(order.grandTotal) - 1) {
      await db.collection('pending_cart_orders').updateOne({ _id: order._id }, { $set: { status: 'failed', verification: v } });
      return `/shopper/account?error=${encodeURIComponent('We could not verify your payment. If you were charged, contact support.')}`;
    }
    await fulfil(order._id, String(q.transaction_id));
    return `/shopper/account?paid=${encodeURIComponent(txRef)}`;
  } catch (e: any) {
    console.error('Cart callback error:', e?.message);
    return `/shopper/account?error=${encodeURIComponent("We received your payment but couldn't finish your order automatically. Our team has been notified and will confirm it shortly.")}`;
  }
}

/** Webhook path for cart payments (in case the shopper never returns from Flutterwave). */
export async function handleCartWebhook(event: any) {
  if (event?.event !== 'charge.completed' || event?.data?.status !== 'successful') return;
  const txRef = String(event.data.tx_ref || '');
  if (!txRef.startsWith('CART-')) return;
  const db = await getDb();
  const order = await db.collection('pending_cart_orders').findOne({ txRef });
  if (!order || order.status === 'completed') return;
  const v = await flw.verifyTransactionById(event.data.id);
  if (v.status === 'successful' && v.tx_ref === txRef && Number(v.amount) >= Number(order.grandTotal) - 1) await fulfil(order._id, String(event.data.id));
}

/** Create one paid sale per store. Claims the order atomically so it can only be fulfilled once. */
async function fulfil(orderId: ObjectId, transactionId: string) {
  const db = await getDb();
  const claimed = await db.collection('pending_cart_orders').findOneAndUpdate({ _id: orderId, status: { $in: ['pending', 'failed'] } }, { $set: { status: 'processing', transactionId } }, { returnDocument: 'after' });
  const order: any = (claimed as any)?.value !== undefined ? (claimed as any).value : claimed;
  if (!order) return;
  const shopper = await db.collection('shoppers').findOne({ _id: order.shopperId });
  const saleIds: ObjectId[] = [];
  let system = await db.collection('admins').findOne({ username: 'System', role: 'superadmin' });
  if (!system) {
    const r = await db.collection('admins').insertOne({ username: 'System', email: 'system@shed.ng', password: 'N/A', role: 'superadmin', createdAt: new Date() });
    system = { _id: r.insertedId } as any;
  }

  for (const g of order.groups) {
    try {
      const adminId = oid(g.adminId)!;
      const admin = await db.collection('admins').findOne({ _id: adminId });
      if (!admin) throw new Error('Store not found');
      const items: any[] = [];
      let total = 0;
      for (const it of g.items) {
        const p = await db.collection('inventory').findOne({ _id: oid(it.itemId)!, adminId });
        if (!p) continue;
        const qty = Math.min(it.quantity, p.stock || 0);
        if (qty <= 0) continue;
        const dec = await db.collection('inventory').updateOne({ _id: p._id, stock: { $gte: qty } }, { $inc: { stock: -qty } });
        if (!dec.matchedCount) continue;
        // Customers pay the price they saw at checkout.
        const unit = Number(it.cost) || Number(p.cost) || 0;
        items.push({ itemId: p._id, itemName: p.name, quantity: qty, unitCost: unit, totalCost: unit * qty });
        total += unit * qty;
      }
      if (!items.length) throw new Error('Items no longer in stock');
      const name = `${shopper?.firstName || ''} ${shopper?.lastName || ''}`.trim() || shopper?.email || 'Shed shopper';
      const sale = { adminId, shopperId: order.shopperId, customerName: name, phoneNumber: shopper?.phone || 'N/A', email: shopper?.email || 'N/A', items, totalAmount: total, paymentMethod: 'Flutterwave', paymentStatus: 'Paid', paidAt: new Date(), flwTxRef: order.txRef, flwTransactionId: transactionId, date: new Date(), source: 'storefront', status: 'completed' };
      const r = await db.collection('sales').insertOne(sale);
      saleIds.push(r.insertedId);
      await db.collection('transactions').insertOne({ adminId, type: 'sale', amount: total, date: new Date(), description: `Shopper checkout — Sale #${r.insertedId}`, reference: `SALE-${r.insertedId}`, balanceImpact: 1 });
      await db.collection('carts').updateOne({ shopperId: order.shopperId }, { $pull: { items: { adminId } } } as any);
      await db.collection('messages').insertOne({ senderId: system!._id, subject: `New paid order: Sale #${r.insertedId}`, content: `<pre>New paid order from a Shed shopper.\nCustomer: ${escapeHtml(name)}\nTotal: ${admin.currency || '₦'}${total.toFixed(2)}\nPayment: Paid online (Flutterwave)</pre>`, recipientId: adminId, createdAt: new Date(), read: false, readAt: null, isHtml: true });
      if (admin.email) sendMailSafe({ from: env.businessUser, to: admin.email, subject: `New paid order on your store`, html: `<p>Hi ${escapeHtml(admin.firstName || admin.username)},</p><p>You have a new <strong>paid</strong> order for ${admin.currency || '₦'}${total.toFixed(2)}.</p><p><a href="${env.baseUrl}/dashboard/sales/${r.insertedId}">View the order</a></p>` });
    } catch (e: any) {
      console.error(`Cart fulfilment failed for store ${g.adminId}:`, e?.message);
      // Payment captured — flag for manual follow-up (visible to superadmins only).
      await db.collection('reconciliation_flags').insertOne({ txRef: order.txRef, adminId: g.adminId, error: e?.message, amount: g.subtotal, createdAt: new Date(), resolved: false }).catch(() => {});
    }
  }
  await db.collection('pending_cart_orders').updateOne({ _id: orderId }, { $set: { status: 'completed', saleIds, completedAt: new Date() } });
}
