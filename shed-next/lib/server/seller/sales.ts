import 'server-only';
import { getClient, getDb, oid, escapeRegex, serialize, ObjectId } from '../db';
import type { SellerContext } from '../auth';
import { sendMailSafe } from '../mailer';
import { renderInvoicePdf } from '../pdf';
import { escapeHtml } from '../store';

/* Sales, POS and invoices (ports of salesController.js + invoiceController.js).
 * Prices are always taken from the database; the client only sends item ids and quantities. */

export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'POS', 'Mobile Payment'] as const;
export const isPaidStatus = (s?: string) => s === 'Paid' || s === 'Confirmed';

export class SaleError extends Error {
  status = 400;
}

export interface LineInput {
  itemId?: string;
  quantity: number;
  /** For invoices: create a new product on the fly */
  newProduct?: { name: string; cost: number; stock: number };
}

export interface CustomerInput {
  customerId?: string | null;
  name?: string;
  phone?: string;
  email?: string;
}

export interface CreateSaleInput {
  lines: LineInput[];
  customer: CustomerInput;
  paymentMethod: string;
  paymentStatus: 'Paid' | 'Pending';
  source: 'pos' | 'invoice';
  bankDetails?: { bankName: string; bankAccountName: string; accountNumber: string } | null;
  additionalComments?: string;
}

async function resolveCustomer(db: any, adminId: ObjectId, c: CustomerInput, session: any) {
  const id = oid(c.customerId);
  if (id) {
    const found = await db.collection('customers').findOne({ _id: id, adminId }, { session });
    if (!found) throw new SaleError('Customer not found.');
    return found;
  }
  const name = (c.name || '').trim();
  if (!name) return { _id: null, name: 'Walk-in customer', phone: 'N/A', email: 'N/A' };
  const email = (c.email || '').trim().toLowerCase();
  const phone = (c.phone || '').trim();
  // Re-use an existing customer with the same phone or email instead of creating duplicates.
  const or: any[] = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone });
  if (or.length) {
    const existing = await db.collection('customers').findOne({ adminId, $or: or }, { session });
    if (existing) return existing;
  }
  const doc = { adminId, name, phone: phone || 'N/A', email: email || 'N/A', createdAt: new Date() };
  const r = await db.collection('customers').insertOne(doc, { session });
  return { _id: r.insertedId, ...doc };
}

export async function createSale(ctx: SellerContext, input: CreateSaleInput) {
  const admin = ctx.admin;
  const lines = (input.lines || []).filter((l) => Number(l.quantity) > 0);
  if (!lines.length) throw new SaleError('Add at least one item.');
  if (!input.paymentMethod) throw new SaleError('Choose a payment method.');
  if (input.paymentMethod === 'Bank Transfer' && input.source === 'invoice') {
    const b = input.bankDetails;
    if (!b?.bankName || !b.bankAccountName || !b.accountNumber) throw new SaleError('Bank name, account name and account number are required for bank transfers.');
  }

  const db = await getDb();
  const client = await getClient();
  const session = client.startSession();
  let saleId: ObjectId | null = null;
  try {
    await session.withTransaction(async () => {
      const items: any[] = [];
      let subtotal = 0;
      let vatTotal = 0;
      for (const line of lines) {
        const qty = Math.floor(Number(line.quantity));
        if (!Number.isFinite(qty) || qty <= 0) throw new SaleError('Quantities must be whole numbers above zero.');
        let item: any;
        if (line.newProduct) {
          const np = line.newProduct;
          if (!np.name?.trim() || !(Number(np.cost) > 0)) throw new SaleError('New products need a name and a price.');
          if (Number(np.stock) < qty) throw new SaleError(`Opening stock for "${np.name}" must be at least the quantity sold.`);
          item = { adminId: admin._id, name: np.name.trim(), cost: Number(np.cost), stock: Number(np.stock), isVatable: !!admin.applyVat, images: [], description: '', createdAt: new Date() };
          const r = await db.collection('inventory').insertOne(item, { session });
          item._id = r.insertedId;
        } else {
          const id = oid(line.itemId);
          if (!id) throw new SaleError('Invalid product.');
          item = await db.collection('inventory').findOne({ _id: id, adminId: admin._id }, { session });
          if (!item) throw new SaleError('A product in this sale no longer exists.');
        }
        // Atomic conditional decrement — never lets stock go negative.
        const dec = await db.collection('inventory').updateOne({ _id: item._id, stock: { $gte: qty } }, { $inc: { stock: -qty } }, { session });
        if (!dec.matchedCount) throw new SaleError(`Not enough stock for ${item.name}. Only ${item.stock ?? 0} left.`);

        const unitCost = Number(item.cost) || 0;
        const totalCost = unitCost * qty;
        const vatable = !!(admin.applyVat && item.isVatable);
        const vatRate = vatable ? Number(admin.vatRate) || 0 : 0;
        const vatAmount = vatable ? (totalCost * vatRate) / 100 : 0;
        items.push({ itemId: item._id, itemName: item.name, quantity: qty, unitCost, totalCost, isVatable: vatable, vatRate, vatAmount, itemTotalWithVat: totalCost + vatAmount });
        subtotal += totalCost;
        vatTotal += vatAmount;
      }

      const customer = await resolveCustomer(db, admin._id, input.customer || {}, session);
      const total = subtotal + vatTotal;
      const sale: any = {
        adminId: admin._id,
        customerId: customer._id,
        customerName: customer.name,
        phoneNumber: customer.phone || 'N/A',
        email: customer.email || 'N/A',
        items,
        subtotalAmount: subtotal,
        totalVatAmount: vatTotal,
        totalAmount: total,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus,
        date: new Date(),
        source: input.source,
        status: 'completed',
        vatApplied: !!admin.applyVat,
        vatRate: Number(admin.vatRate) || 0,
        additionalComments: (input.additionalComments || '').trim().slice(0, 1000),
        formattedTotal: total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        createdBy: { id: ctx.user._id, username: ctx.user.username, role: ctx.role },
      };
      if (input.paymentMethod === 'Bank Transfer' && input.bankDetails) sale.bankDetails = input.bankDetails;
      if (input.paymentStatus === 'Paid') sale.paidAt = new Date();
      const r = await db.collection('sales').insertOne(sale, { session });
      saleId = r.insertedId;
      await db.collection('transactions').insertOne(
        { adminId: admin._id, type: 'sale', amount: total, date: new Date(), description: `${input.source === 'pos' ? 'POS sale' : 'Invoice'} #${r.insertedId}`, reference: `${input.source === 'pos' ? 'POS' : 'INV'}-${r.insertedId}`, balanceImpact: 1 },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return String(saleId);
}

export interface SalesFilter {
  q?: string;
  from?: string;
  to?: string;
  status?: 'paid' | 'pending' | '';
  source?: string;
  page?: number;
  limit?: number;
}

export async function listSales(ctx: SellerContext, f: SalesFilter = {}) {
  const db = await getDb();
  const adminId = ctx.admin._id;
  const and: any[] = [{ $or: [{ adminId }, { 'outlet.adminId': adminId }] }];
  if (f.from || f.to) {
    const range: any = {};
    if (f.from) range.$gte = new Date(`${f.from}T00:00:00.000Z`);
    if (f.to) range.$lte = new Date(`${f.to}T23:59:59.999Z`);
    and.push({ date: range });
  }
  if (f.q?.trim()) {
    const rx = { $regex: escapeRegex(f.q.trim()), $options: 'i' };
    and.push({ $or: [{ customerName: rx }, { 'items.itemName': rx }, { itemName: rx }, { email: rx }, { phoneNumber: rx }] });
  }
  if (f.status === 'paid') and.push({ paymentStatus: { $in: ['Paid', 'Confirmed'] } });
  if (f.status === 'pending') and.push({ paymentStatus: { $nin: ['Paid', 'Confirmed'] } });
  if (f.source) and.push(f.source === 'outlet' ? { outletId: { $exists: true, $ne: null } } : { source: f.source });

  const limit = Math.min(f.limit || 25, 100);
  const page = Math.max(1, f.page || 1);
  const [out] = await db
    .collection('sales')
    .aggregate([
      { $match: { $and: and } },
      {
        $facet: {
          total: [{ $count: 'n' }],
          sums: [{ $group: { _id: null, amount: { $sum: '$totalAmount' }, pending: { $sum: { $cond: [{ $in: ['$paymentStatus', ['Paid', 'Confirmed']] }, 0, '$totalAmount'] } } } }],
          rows: [
            { $sort: { date: -1, _id: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $lookup: { from: 'outlets', localField: 'outletId', foreignField: '_id', as: 'outletDoc' } },
            { $project: { customerName: 1, items: 1, itemName: 1, quantity: 1, totalAmount: 1, paymentMethod: 1, paymentStatus: 1, source: 1, date: 1, createdAt: 1, outletName: { $arrayElemAt: ['$outletDoc.name', 0] } } },
          ],
        },
      },
    ])
    .toArray();
  const total = out?.total?.[0]?.n || 0;
  return {
    rows: serialize(
      (out?.rows || []).map((s: any) => ({
        ...s,
        items: s.items?.length ? s.items : s.itemName ? [{ itemName: s.itemName, quantity: s.quantity || 1 }] : [],
        date: s.date || s.createdAt || null,
      })),
    ),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    amount: out?.sums?.[0]?.amount || 0,
    pendingAmount: out?.sums?.[0]?.pending || 0,
  };
}

export async function getSale(ctx: SellerContext, id: string) {
  const _id = oid(id);
  if (!_id) return null;
  const db = await getDb();
  const sale = await db.collection('sales').findOne({ _id, $or: [{ adminId: ctx.admin._id }, { 'outlet.adminId': ctx.admin._id }] });
  return sale;
}

export async function markPaid(ctx: SellerContext, id: string) {
  const _id = oid(id);
  if (!_id) throw new SaleError('Invalid sale.');
  const db = await getDb();
  const r = await db.collection('sales').updateOne({ _id, adminId: ctx.admin._id }, { $set: { paymentStatus: 'Paid', paidAt: new Date() } });
  if (!r.matchedCount) throw new SaleError('Sale not found.');
}

/** Edit an invoice's details/lines (port of POST /invoices/update/:saleId). Marks it as a revision. Stock isn't changed. */
export async function updateInvoice(
  ctx: SellerContext,
  id: string,
  data: { customerName: string; phoneNumber: string; email: string; paymentMethod: string; bankDetails?: any; additionalComments?: string; lines: { itemName: string; unitCost: number; quantity: number }[] },
) {
  const _id = oid(id);
  const db = await getDb();
  const existing = _id && (await db.collection('sales').findOne({ _id, adminId: ctx.admin._id }));
  if (!existing) throw new SaleError('Invoice not found.');
  const lines = data.lines.filter((l) => l.itemName?.trim());
  if (!lines.length) throw new SaleError('At least one item is required.');
  const admin = ctx.admin;
  let subtotal = 0;
  let vat = 0;
  const items = lines.map((l, i) => {
    const unitCost = Math.max(0, Number(l.unitCost) || 0);
    const quantity = Math.max(1, Math.floor(Number(l.quantity) || 1));
    const totalCost = unitCost * quantity;
    const prev = existing.items?.[i];
    const vatable = !!admin.applyVat && (prev ? !!prev.isVatable : true);
    const vatRate = vatable ? Number(admin.vatRate) || 0 : 0;
    const vatAmount = (totalCost * vatRate) / 100;
    subtotal += totalCost;
    vat += vatAmount;
    return { itemId: prev && prev.itemName === l.itemName.trim() ? prev.itemId || null : null, itemName: l.itemName.trim(), quantity, unitCost, totalCost, isVatable: vatable, vatRate, vatAmount, itemTotalWithVat: totalCost + vatAmount };
  });
  const total = subtotal + vat;
  const $set: any = {
    customerName: data.customerName.trim() || existing.customerName,
    phoneNumber: data.phoneNumber.trim(),
    email: data.email.trim(),
    items,
    subtotalAmount: subtotal,
    totalVatAmount: vat,
    totalAmount: total,
    paymentMethod: data.paymentMethod || existing.paymentMethod,
    additionalComments: (data.additionalComments || '').trim().slice(0, 1000),
    isUpdated: true,
    updatedAt: new Date(),
    updateCount: (existing.updateCount || 0) + 1,
    formattedTotal: total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
  if (data.paymentMethod === 'Bank Transfer' && data.bankDetails) $set.bankDetails = data.bankDetails;
  await db.collection('sales').updateOne({ _id: existing._id }, { $set });
}

export async function emailReceipt(ctx: SellerContext, id: string, to: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to || '')) throw new SaleError('Enter a valid email address.');
  const sale = await getSale(ctx, id);
  if (!sale) throw new SaleError('Sale not found.');
  const pdf = await renderInvoicePdf(sale, ctx.admin);
  const cur = ctx.admin.currency || '₦';
  const res = await sendMailSafe({
    to,
    subject: `${pdf.title} from ${ctx.admin.businessName || 'Shed'}`,
    html: `<p>Dear ${escapeHtml(sale.customerName || 'Customer')},</p><p>Thank you for your purchase. Your ${pdf.title.toLowerCase()} is attached.</p><p>Total: ${cur}${Number(sale.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p><p>— ${escapeHtml(ctx.admin.businessName || 'Shed')}</p>`,
    attachments: [{ filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' }],
  });
  if (!res) throw new SaleError('We could not send the email right now. Please try again.');
  if (!sale.email || sale.email === 'N/A') {
    const db = await getDb();
    await db.collection('sales').updateOne({ _id: sale._id }, { $set: { email: to } });
  }
}

/** Overview numbers for the dashboard home. */
export async function overview(ctx: SellerContext) {
  const db = await getDb();
  const adminId = ctx.admin._id;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const start30 = new Date(now.getTime() - 29 * 86400000);
  start30.setHours(0, 0, 0, 0);
  const own = { $or: [{ adminId }, { 'outlet.adminId': adminId }] };

  const [agg] = await db
    .collection('sales')
    .aggregate([
      { $match: own },
      {
        $facet: {
          today: [{ $match: { date: { $gte: startToday } } }, { $group: { _id: null, amount: { $sum: '$totalAmount' }, n: { $sum: 1 } } }],
          month: [{ $match: { date: { $gte: startMonth } } }, { $group: { _id: null, amount: { $sum: '$totalAmount' }, n: { $sum: 1 } } }],
          pending: [{ $match: { paymentStatus: { $nin: ['Paid', 'Confirmed'] } } }, { $group: { _id: null, amount: { $sum: '$totalAmount' }, n: { $sum: 1 } } }],
          daily: [
            { $match: { date: { $gte: start30 } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, amount: { $sum: '$totalAmount' }, n: { $sum: 1 } } },
          ],
          recent: [{ $sort: { date: -1 } }, { $limit: 6 }, { $project: { customerName: 1, totalAmount: 1, paymentStatus: 1, source: 1, date: 1, items: 1 } }],
        },
      },
    ])
    .toArray();

  const [products, lowStock, customers, unread] = await Promise.all([
    db.collection('inventory').countDocuments({ adminId }),
    db.collection('inventory').find({ adminId, stock: { $lte: 5 } }).sort({ stock: 1 }).limit(6).project({ name: 1, stock: 1 }).toArray(),
    db.collection('customers').countDocuments({ adminId }),
    db.collection('messages').countDocuments({ $or: [{ recipientId: adminId }, { recipientId: null }], read: { $ne: true }, deleted: { $ne: true } }),
  ]);
  const lowStockCount = await db.collection('inventory').countDocuments({ adminId, stock: { $lte: 5 } });

  const byDay = new Map((agg?.daily || []).map((d: any) => [d._id, d]));
  const series = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(start30.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const row: any = byDay.get(key);
    return { date: key, amount: row?.amount || 0, count: row?.n || 0 };
  });

  return serialize({
    today: { amount: agg?.today?.[0]?.amount || 0, count: agg?.today?.[0]?.n || 0 },
    month: { amount: agg?.month?.[0]?.amount || 0, count: agg?.month?.[0]?.n || 0 },
    pending: { amount: agg?.pending?.[0]?.amount || 0, count: agg?.pending?.[0]?.n || 0 },
    series,
    recent: agg?.recent || [],
    products,
    lowStock,
    lowStockCount,
    customers,
    unread,
  });
}
