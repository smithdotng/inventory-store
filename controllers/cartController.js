const { ObjectId } = require('mongodb');
const { getDb } = require('../config/db');
const { transporter } = require('../config/mailer');
const flutterwave = require('../config/flutterwave');
const { isAccountLocked } = require('../utils/subscription');

const BASE_URL = process.env.BASE_URL ? process.env.BASE_URL.trim() : 'http://localhost:3000';
const CHECKOUT_CURRENCY = process.env.FLW_CURRENCY || 'NGN';

async function getOrCreateCart(db, shopperId) {
  let cart = await db.collection('carts').findOne({ shopperId });
  if (!cart) {
    cart = { shopperId, items: [], updatedAt: new Date() };
    await db.collection('carts').insertOne(cart);
  }
  return cart;
}

// Re-hydrate cart items against live inventory/store data — never trust
// quantities/prices cached from when the item was added.
async function enrichCart(db, cart) {
  const itemIds = [...new Set(cart.items.map(i => i.itemId.toString()))].filter(id => ObjectId.isValid(id));
  const adminIds = [...new Set(cart.items.map(i => i.adminId.toString()))].filter(id => ObjectId.isValid(id));

  const [products, admins] = await Promise.all([
    itemIds.length ? db.collection('inventory').find({ _id: { $in: itemIds.map(id => new ObjectId(id)) } }).toArray() : [],
    adminIds.length ? db.collection('admins').find({ _id: { $in: adminIds.map(id => new ObjectId(id)) } }).toArray() : []
  ]);

  const productMap = {};
  products.forEach(p => { productMap[p._id.toString()] = p; });
  const adminMap = {};
  admins.forEach(a => { adminMap[a._id.toString()] = a; });

  const storeGroups = {};
  let removedUnavailable = false;

  for (const item of cart.items) {
    const product = productMap[item.itemId.toString()];
    const admin = adminMap[item.adminId.toString()];
    if (!product || !admin) { removedUnavailable = true; continue; }

    const adminId = admin._id.toString();
    if (!storeGroups[adminId]) {
      storeGroups[adminId] = {
        adminId,
        storeName: admin.businessName || admin.username,
        storeUsername: admin.username,
        currency: admin.currency || '₦',
        locked: isAccountLocked(admin),
        items: [],
        subtotal: 0
      };
    }

    const quantity = Math.min(item.quantity, product.stock || 0);
    if (quantity <= 0) { removedUnavailable = true; continue; }

    const lineTotal = Number(product.cost || 0) * quantity;
    storeGroups[adminId].items.push({
      itemId: product._id.toString(),
      name: product.name,
      cost: Number(product.cost) || 0,
      quantity,
      requestedQuantity: item.quantity,
      maxStock: product.stock || 0,
      image: Array.isArray(product.images) && product.images[0] ? product.images[0] : null,
      lineTotal
    });
    storeGroups[adminId].subtotal += lineTotal;
  }

  const groups = Object.values(storeGroups);
  const grandTotal = groups.reduce((sum, g) => sum + g.subtotal, 0);
  const itemCount = groups.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.quantity, 0), 0);

  return { groups, grandTotal, itemCount, removedUnavailable };
}

// ── GET /cart ────────────────────────────────────────────────────────────────
exports.getCart = async (req, res) => {
  try {
    const db = getDb();
    const shopperId = new ObjectId(req.session.shopper.id);
    const cart = await getOrCreateCart(db, shopperId);
    const { groups, grandTotal, itemCount, removedUnavailable } = await enrichCart(db, cart);

    res.render('cart', {
      groups,
      grandTotal,
      itemCount,
      removedUnavailable,
      flwPublicKey: require('../config/flutterwave').FLW_PUBLIC_KEY
    });
  } catch (err) {
    console.error('Cart view error:', err);
    res.status(500).render('500', { message: 'Error loading your cart' });
  }
};

// ── GET /cart/count — small json helper for header badges ──────────────────
exports.getCount = async (req, res) => {
  try {
    if (!req.session.shopper) return res.json({ count: 0 });
    const db = getDb();
    const cart = await db.collection('carts').findOne({ shopperId: new ObjectId(req.session.shopper.id) });
    const count = cart ? cart.items.reduce((s, i) => s + (i.quantity || 0), 0) : 0;
    res.json({ count, loggedIn: true });
  } catch (err) {
    res.json({ count: 0 });
  }
};

// ── POST /cart/add ───────────────────────────────────────────────────────────
exports.postAdd = async (req, res) => {
  try {
    const db = getDb();
    const { adminId, itemId } = req.body;
    const quantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);

    if (!ObjectId.isValid(adminId) || !ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'Invalid product reference' });
    }

    const [admin, product] = await Promise.all([
      db.collection('admins').findOne({ _id: new ObjectId(adminId) }),
      db.collection('inventory').findOne({ _id: new ObjectId(itemId), adminId: new ObjectId(adminId) })
    ]);
    if (!admin || !product) return res.status(404).json({ error: 'Product not found' });
    if (isAccountLocked(admin)) return res.status(403).json({ error: 'This store is temporarily unavailable' });
    if ((product.stock || 0) < 1) return res.status(400).json({ error: 'This item is out of stock' });

    const shopperId = new ObjectId(req.session.shopper.id);
    const cart = await getOrCreateCart(db, shopperId);
    const existingIndex = cart.items.findIndex(i => i.itemId.toString() === itemId && i.adminId.toString() === adminId);

    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity = Math.min(cart.items[existingIndex].quantity + quantity, product.stock);
    } else {
      cart.items.push({ adminId: new ObjectId(adminId), itemId: new ObjectId(itemId), quantity: Math.min(quantity, product.stock), addedAt: new Date() });
    }

    await db.collection('carts').updateOne(
      { shopperId },
      { $set: { items: cart.items, updatedAt: new Date() } },
      { upsert: true }
    );

    const count = cart.items.reduce((s, i) => s + i.quantity, 0);
    res.json({ success: true, count });
  } catch (err) {
    console.error('Cart add error:', err);
    res.status(500).json({ error: 'Could not add item to cart' });
  }
};

// ── POST /cart/update ────────────────────────────────────────────────────────
exports.postUpdate = async (req, res) => {
  try {
    const db = getDb();
    const { adminId, itemId } = req.body;
    const quantity = parseInt(req.body.quantity, 10);
    const shopperId = new ObjectId(req.session.shopper.id);

    if (!ObjectId.isValid(adminId) || !ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'Invalid product reference' });
    }

    const cart = await getOrCreateCart(db, shopperId);
    let items = cart.items.filter(i => !(i.itemId.toString() === itemId && i.adminId.toString() === adminId));

    if (quantity > 0) {
      const product = await db.collection('inventory').findOne({ _id: new ObjectId(itemId) });
      const capped = product ? Math.min(quantity, product.stock || 0) : quantity;
      if (capped > 0) items.push({ adminId: new ObjectId(adminId), itemId: new ObjectId(itemId), quantity: capped, addedAt: new Date() });
    }

    await db.collection('carts').updateOne({ shopperId }, { $set: { items, updatedAt: new Date() } }, { upsert: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Cart update error:', err);
    res.status(500).json({ error: 'Could not update cart' });
  }
};

// ── POST /cart/remove ────────────────────────────────────────────────────────
exports.postRemove = async (req, res) => {
  try {
    const db = getDb();
    const { adminId, itemId } = req.body;
    const shopperId = new ObjectId(req.session.shopper.id);
    await db.collection('carts').updateOne(
      { shopperId },
      { $pull: { items: { adminId: new ObjectId(adminId), itemId: new ObjectId(itemId) } }, $set: { updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Cart remove error:', err);
    res.status(500).json({ error: 'Could not remove item' });
  }
};

// ── POST /cart/checkout — start a single Flutterwave payment for the whole
// (possibly multi-store) cart. Store owners are paid out later from the
// platform account — see per-store `sales`/`transactions` records created
// once payment is verified in getCheckoutCallback. ─────────────────────────
exports.postCheckout = async (req, res) => {
  try {
    const db = getDb();
    const shopperId = new ObjectId(req.session.shopper.id);
    const shopper = await db.collection('shoppers').findOne({ _id: shopperId });
    if (!shopper) return res.status(401).json({ error: 'Please log in again.' });

    const cart = await getOrCreateCart(db, shopperId);
    const { groups, grandTotal } = await enrichCart(db, cart);

    const payableGroups = groups.filter(g => !g.locked);
    if (!payableGroups.length) {
      return res.status(400).json({ error: 'Your cart is empty or every store in it is temporarily unavailable.' });
    }
    const payableTotal = payableGroups.reduce((sum, g) => sum + g.subtotal, 0);
    if (payableTotal <= 0) {
      return res.status(400).json({ error: 'Your cart total must be greater than zero to checkout.' });
    }

    const txRef = `CART-${shopperId.toString()}-${Date.now()}`;

    await db.collection('pending_cart_orders').insertOne({
      txRef,
      shopperId,
      groups: payableGroups,
      grandTotal: payableTotal,
      status: 'pending',
      createdAt: new Date()
    });

    const link = await flutterwave.initializeStandardPayment({
      amount: payableTotal,
      currency: CHECKOUT_CURRENCY,
      email: shopper.email,
      name: `${shopper.firstName} ${shopper.lastName}`,
      phone: shopper.phone,
      tx_ref: txRef,
      redirect_url: `${BASE_URL}/cart/checkout/callback`,
      title: 'Shed Cart Checkout',
      description: `Order across ${payableGroups.length} store(s)`,
      meta: { shopperId: shopperId.toString(), type: 'cart_checkout' }
    });

    res.json({ success: true, link });
  } catch (err) {
    console.error('Cart checkout init error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
};

// ── GET /cart/checkout/callback — Flutterwave redirects here after payment ─
exports.getCheckoutCallback = async (req, res) => {
  const db = getDb();
  const { status, tx_ref, transaction_id } = req.query;

  try {
    if (!tx_ref) return res.redirect('/cart?error=' + encodeURIComponent('Missing payment reference.'));

    const pendingOrder = await db.collection('pending_cart_orders').findOne({ txRef: tx_ref });
    if (!pendingOrder) return res.redirect('/cart?error=' + encodeURIComponent('We could not find that order.'));

    if (pendingOrder.status === 'completed') {
      return res.render('cart-confirmation', { saleIds: pendingOrder.saleIds || [], total: pendingOrder.grandTotal, storeCount: pendingOrder.groups.length });
    }

    if (status !== 'successful' || !transaction_id) {
      await db.collection('pending_cart_orders').updateOne({ _id: pendingOrder._id }, { $set: { status: 'failed' } });
      return res.redirect('/cart?error=' + encodeURIComponent('Payment was not completed.'));
    }

    const verified = await flutterwave.verifyTransactionById(transaction_id);
    const amountOk = Number(verified.amount) >= Number(pendingOrder.grandTotal) - 1; // allow rounding
    const refOk = verified.tx_ref === tx_ref;
    const statusOk = verified.status === 'successful';

    if (!statusOk || !refOk || !amountOk) {
      await db.collection('pending_cart_orders').updateOne({ _id: pendingOrder._id }, { $set: { status: 'failed', verification: verified } });
      return res.redirect('/cart?error=' + encodeURIComponent('We could not verify your payment. If you were charged, contact support.'));
    }

    // Payment is confirmed at this point — from here on we must not lose track
    // of the money even if a DB write fails, so failures fall through to a
    // manual-reconciliation flag rather than a raw error page.
    const shopper = await db.collection('shoppers').findOne({ _id: pendingOrder.shopperId });
    const saleIds = [];

    for (const group of pendingOrder.groups) {
      try {
        const adminId = new ObjectId(group.adminId);
        const admin = await db.collection('admins').findOne({ _id: adminId });
        if (!admin || isAccountLocked(admin)) continue; // store went unavailable between checkout + payment

        const saleItemsArray = [];
        let totalAmount = 0;
        for (const item of group.items) {
          const product = await db.collection('inventory').findOne({ _id: new ObjectId(item.itemId), adminId });
          if (!product) continue;
          const quantity = Math.min(item.quantity, product.stock || 0);
          if (quantity <= 0) continue;
          const totalCost = Number(product.cost || 0) * quantity;
          saleItemsArray.push({ itemId: product._id, itemName: product.name, quantity, unitCost: Number(product.cost) || 0, totalCost });
          totalAmount += totalCost;
          await db.collection('inventory').updateOne({ _id: product._id }, { $inc: { stock: -quantity } });
        }
        if (!saleItemsArray.length) continue;

        const sale = {
          adminId,
          shopperId: pendingOrder.shopperId,
          customerName: `${shopper.firstName} ${shopper.lastName}`,
          phoneNumber: shopper.phone,
          email: shopper.email,
          items: saleItemsArray,
          totalAmount,
          paymentMethod: 'Flutterwave',
          paymentStatus: 'Paid',
          flwTxRef: tx_ref,
          flwTransactionId: transaction_id,
          date: new Date(),
          source: 'storefront',
          status: 'completed'
        };
        const saleResult = await db.collection('sales').insertOne(sale);
        saleIds.push(saleResult.insertedId);

        await db.collection('transactions').insertOne({
          adminId,
          type: 'sale',
          amount: totalAmount,
          date: new Date(),
          description: `Shopper checkout — Sale #${saleResult.insertedId}`,
          reference: `SALE-${saleResult.insertedId}`,
          balanceImpact: 1
        });

        await db.collection('carts').updateOne(
          { shopperId: pendingOrder.shopperId },
          { $pull: { items: { adminId } } }
        );

        let systemAdmin = await db.collection('admins').findOne({ username: 'System', role: 'superadmin' });
        if (!systemAdmin) {
          const saResult = await db.collection('admins').insertOne({ username: 'System', email: 'system@shed.ng', password: 'N/A', role: 'superadmin', createdAt: new Date() });
          systemAdmin = { _id: saResult.insertedId };
        }
        await db.collection('messages').insertOne({
          senderId: systemAdmin._id,
          subject: `New Transaction: Sale #${saleResult.insertedId}`,
          content: `<pre>New order from a Shed shopper.\nCustomer: ${sale.customerName}\nTotal: ${admin.currency || '₦'}${totalAmount.toFixed(2)}\nPayment: Paid via Flutterwave</pre>`,
          recipientId: adminId,
          createdAt: new Date(),
          read: false,
          readAt: null,
          isHtml: true
        });

        if (admin.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email)) {
          transporter.sendMail({
            from: process.env.BUSINESS_USER || 'stanley@shed.ng',
            to: admin.email,
            subject: `New Transaction on Your Store: Sale #${saleResult.insertedId}`,
            html: `<h1>New Order</h1><p>Dear ${admin.username || 'Store Owner'},</p><p>You have a new paid order (Sale #${saleResult.insertedId}) for ${admin.currency || '₦'}${totalAmount.toFixed(2)}.</p>`
          }).catch(e => console.error('Order notification email failed:', e.message));
        }
      } catch (groupErr) {
        console.error(`Cart checkout fulfillment error for store ${group.adminId}:`, groupErr);
        // Flag for manual follow-up — payment already captured, don't lose it.
        await db.collection('messages').insertOne({
          subject: `⚠️ Manual reconciliation needed — tx_ref ${tx_ref}`,
          content: `<pre>Payment captured but order fulfillment failed for store ${group.adminId}.\nError: ${groupErr.message}</pre>`,
          recipientId: null,
          isSystemFlag: true,
          createdAt: new Date(),
          read: false
        }).catch(() => {});
      }
    }

    await db.collection('pending_cart_orders').updateOne(
      { _id: pendingOrder._id },
      { $set: { status: 'completed', saleIds, completedAt: new Date() } }
    );

    res.render('cart-confirmation', { saleIds, total: pendingOrder.grandTotal, storeCount: pendingOrder.groups.length });
  } catch (err) {
    console.error('Cart checkout callback error:', err.response?.data || err.message);
    res.render('cart-confirmation', {
      saleIds: [],
      total: null,
      storeCount: 0,
      note: 'We received your payment but ran into an issue finalizing your order. Our team has been notified and will confirm your order shortly — no action needed from you.'
    });
  }
};

exports.getOrCreateCart = getOrCreateCart;
exports.enrichCart = enrichCart;
