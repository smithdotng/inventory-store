const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../config/db');
const { buildPublicStore, publicProduct, findStoreByUsername, generatePDFInvoice } = require('./storeController');
const { uploadProductImages, uploadLogo } = require('../config/multer');

// Rate limiter for subscribe
exports.subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many subscription attempts from this IP, please try again later'
});

// Helper: resolve admin from session (supports both admin and business_user sessions)
async function getSessionAdmin(req) {
  const db = getDb();
  if (req.session.admin) {
    return db.collection('admins').findOne({ username: req.session.admin });
  }
  if (req.session.adminId) {
    return db.collection('admins').findOne({ _id: new ObjectId(req.session.adminId) });
  }
  return null;
}

function dashboardRedirect(role) {
  if (role === 'admin' || role === 'superadmin') return '/dashboard';
  if (role === 'cashier') return '/pos';
  if (role === 'stock_clerk') return '/inventory';
  return '/dashboard';
}

// POST /api/subscribe
exports.postSubscribe = async (req, res) => {
  try {
    const db = getDb();
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }
    const existing = await db.collection('subscriptions').findOne({ email });
    if (existing) return res.status(409).json({ message: 'This email is already subscribed' });
    await db.collection('subscriptions').insertOne({ email, subscribedAt: new Date(), source: 'landing_page', active: true });
    res.status(201).json({ message: 'Subscription successful' });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/auth/login
exports.postAuthLogin = async (req, res) => {
  try {
    const db = getDb();
    const { usernameOrEmail, password } = req.body || {};
    if (!usernameOrEmail || !password) return res.status(400).json({ error: 'Username/email and password are required' });

    const admin = await db.collection('admins').findOne({
      $or: [
        { username: { $regex: `^${usernameOrEmail}$`, $options: 'i' } },
        { email: usernameOrEmail }
      ]
    });

    let businessUser = null;
    if (!admin) {
      businessUser = await db.collection('business_users').findOne({
        $or: [
          { username: { $regex: `^${usernameOrEmail}$`, $options: 'i' } },
          { email: { $regex: `^${usernameOrEmail}$`, $options: 'i' } }
        ],
        status: 'active'
      });
    }

    const user = admin || businessUser;
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    req.session.regenerate(async (err) => {
      if (err) return res.status(500).json({ error: 'Session error' });

      if (admin) {
        req.session.admin = admin.username;
        req.session.adminId = admin._id.toString();
        req.session.role = admin.role;
        req.session.username = admin.username;
        req.session.userType = 'admin';
      } else {
        req.session.userId = businessUser._id.toString();
        req.session.adminId = businessUser.adminId.toString();
        req.session.role = businessUser.role;
        req.session.username = businessUser.username;
        req.session.firstName = businessUser.firstName;
        req.session.userType = 'business_user';
        await db.collection('business_users').updateOne({ _id: businessUser._id }, { $set: { lastLogin: new Date() } });
      }

      req.session.save((saveErr) => {
        if (saveErr) return res.status(500).json({ error: 'Session error' });
        res.json({ success: true, role: user.role, username: user.username, redirect: dashboardRedirect(user.role) });
      });
    });
  } catch (error) {
    console.error('API login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// POST /api/auth/logout
exports.postAuthLogout = (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
};

// GET /api/auth/me
exports.getAuthMe = async (req, res) => {
  try {
    const admin = await getSessionAdmin(req);
    res.json({
      user: {
        username: req.session.username || req.session.admin,
        role: req.session.role || null,
        userType: req.session.userType || (req.session.admin ? 'admin' : 'business_user'),
        firstName: req.session.firstName || null
      },
      business: admin ? {
        adminId: admin._id,
        username: admin.username,
        businessName: admin.businessName || admin.username,
        logo: admin.logo || null,
        currency: admin.currency || '₦'
      } : null
    });
  } catch (error) {
    console.error('API /me error:', error);
    res.status(500).json({ error: 'Error loading session' });
  }
};

// GET /api/admin/overview
exports.getAdminOverview = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });

    const [inventory, sales, outlets, customerCount] = await Promise.all([
      db.collection('inventory').find({ adminId: admin._id }).toArray(),
      db.collection('sales').find({ adminId: admin._id }).toArray(),
      db.collection('outlets').find({ adminId: admin._id }).toArray(),
      db.collection('customers').countDocuments({ adminId: admin._id })
    ]);

    const outletsWithCommission = await Promise.all(outlets.map(async (outlet) => {
      const pending = await db.collection('commissions').aggregate([
        { $match: { outletId: outlet._id, status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).toArray();
      return { _id: outlet._id, name: outlet.name, username: outlet.username || null, totalCommissionDue: pending[0]?.total || 0 };
    }));

    const totalRevenue = sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const lowStock = inventory.filter(i => (i.stock || 0) <= 5).length;
    const pendingPayments = sales.filter(s => s.paymentStatus === 'Pending').length;

    res.json({
      business: { businessName: admin.businessName || admin.username, currency: admin.currency || '₦', logo: admin.logo || null, username: admin.username },
      kpis: { revenue: totalRevenue, sales: sales.length, products: inventory.length, customers: customerCount, lowStock, pendingPayments, outlets: outlets.length },
      outlets: outletsWithCommission
    });
  } catch (error) {
    console.error('API overview error:', error);
    res.status(500).json({ error: 'Error loading dashboard' });
  }
};

// GET /api/admin/products
exports.getAdminProducts = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });
    const search = (req.query.search || '').trim();
    const query = { adminId: admin._id };
    if (search) query.name = { $regex: search, $options: 'i' };
    const items = await db.collection('inventory').find(query).sort({ name: 1 }).toArray();
    res.json({ currency: admin.currency || '₦', products: items });
  } catch (error) {
    console.error('API products error:', error);
    res.status(500).json({ error: 'Error loading products' });
  }
};

// POST /api/admin/products (uses uploadProductImages middleware - applied in route)
exports.postAdminProduct = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });
    const { name, description, stock, cost, commission, isVatable } = req.body;
    if (!name || stock === undefined || cost === undefined) return res.status(400).json({ error: 'Name, stock and cost are required' });
    const product = {
      name,
      description: (description || '').slice(0, 400),
      stock: parseInt(stock, 10) || 0,
      cost: parseFloat(cost) || 0,
      adminId: admin._id,
      isVatable: isVatable === 'on' || isVatable === 'true' || isVatable === true,
      images: req.files && req.files.length ? req.files.map(f => `/uploads/${f.filename}`) : [],
      createdAt: new Date()
    };
    if (commission !== undefined && commission !== '') product.commission = parseFloat(commission);
    const result = await db.collection('inventory').insertOne(product);
    res.status(201).json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error('API add product error:', error);
    res.status(500).json({ error: 'Error adding product' });
  }
};

// PATCH /api/admin/products/:id
exports.patchAdminProduct = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const { stock, cost, commission, description } = req.body;
    const update = {};
    if (stock !== undefined) update.stock = parseInt(stock, 10) || 0;
    if (cost !== undefined) update.cost = parseFloat(cost) || 0;
    if (commission !== undefined && commission !== '') update.commission = parseFloat(commission);
    if (description !== undefined) update.description = String(description).slice(0, 400);
    const result = await db.collection('inventory').updateOne({ _id: new ObjectId(req.params.id), adminId: admin._id }, { $set: update });
    if (!result.matchedCount) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('API update product error:', error);
    res.status(500).json({ error: 'Error updating product' });
  }
};

// DELETE /api/admin/products/:id
exports.deleteAdminProduct = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const result = await db.collection('inventory').deleteOne({ _id: new ObjectId(req.params.id), adminId: admin._id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('API delete product error:', error);
    res.status(500).json({ error: 'Error deleting product' });
  }
};

// GET /api/admin/transactions
exports.getAdminTransactions = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });
    const { startDate, endDate, search } = req.query;
    const ownership = { $or: [{ adminId: admin._id }, { 'outlet.adminId': admin._id }] };
    const match = { ...ownership };
    if (startDate && endDate) match.date = { $gte: new Date(startDate), $lte: new Date(`${endDate}T23:59:59.999Z`) };
    if (search && search.trim()) {
      const rx = new RegExp(search.trim(), 'i');
      match.$and = [{ $or: [{ customerName: rx }, { 'items.itemName': rx }, { itemName: rx }] }, ownership];
      delete match.$or;
    }
    const transactions = await db.collection('sales').aggregate([
      { $match: match },
      { $lookup: { from: 'outlets', localField: 'outletId', foreignField: '_id', as: 'outlet' } },
      { $unwind: { path: '$outlet', preserveNullAndEmptyArrays: true } },
      { $sort: { date: -1 } }
    ]).toArray();
    res.json({
      currency: admin.currency || '₦',
      transactions: transactions.map(s => ({ _id: s._id, customerName: s.customerName || null, items: s.items || [], totalAmount: s.totalAmount || 0, paymentMethod: s.paymentMethod || null, paymentStatus: s.paymentStatus || null, source: s.source || null, date: s.date || s.createdAt || null, outletName: s.outlet ? s.outlet.name : null }))
    });
  } catch (error) {
    console.error('API transactions error:', error);
    res.status(500).json({ error: 'Error loading transactions' });
  }
};

// POST /api/admin/transactions/:saleId/mark-paid
exports.postAdminMarkPaid = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });
    if (!ObjectId.isValid(req.params.saleId)) return res.status(400).json({ error: 'Invalid id' });
    await db.collection('sales').updateOne({ _id: new ObjectId(req.params.saleId), adminId: admin._id }, { $set: { paymentStatus: 'Paid' } });
    res.json({ success: true });
  } catch (error) {
    console.error('API mark-paid error:', error);
    res.status(500).json({ error: 'Error updating transaction' });
  }
};

// GET /api/admin/customers
exports.getAdminCustomers = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });
    const customers = await db.collection('customers').find({ adminId: admin._id }).sort({ createdAt: -1 }).toArray();
    res.json({ customers });
  } catch (error) {
    console.error('API customers error:', error);
    res.status(500).json({ error: 'Error loading customers' });
  }
};

// POST /api/admin/customers
exports.postAdminCustomer = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });
    const { name, phone, email } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = await db.collection('customers').insertOne({ adminId: admin._id, name, phone: phone || 'N/A', email: email || 'N/A', createdAt: new Date() });
    res.status(201).json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error('API add customer error:', error);
    res.status(500).json({ error: 'Error adding customer' });
  }
};

// GET /api/admin/invoices
exports.getAdminInvoices = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });
    const [sales, customers, inventory] = await Promise.all([
      db.collection('sales').find({ adminId: admin._id }).sort({ date: -1 }).toArray(),
      db.collection('customers').find({ adminId: admin._id }).toArray(),
      db.collection('inventory').find({ adminId: admin._id }).toArray()
    ]);
    res.json({
      currency: admin.currency || '₦',
      invoices: sales.map(s => ({ _id: s._id, customerName: s.customerName || null, items: s.items || [], totalAmount: typeof s.totalAmount === 'number' ? s.totalAmount : 0, paymentMethod: s.paymentMethod || null, paymentStatus: s.paymentStatus || null, date: s.date || s.createdAt || null })),
      customers,
      inventory: inventory.map(i => ({ _id: i._id, name: i.name, cost: i.cost, stock: i.stock }))
    });
  } catch (error) {
    console.error('API invoices error:', error);
    res.status(500).json({ error: 'Error loading invoices' });
  }
};

// POST /api/admin/invoices
exports.postAdminInvoice = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });

    const { customerId, newCustomer, items, paymentMethod, paymentStatus } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });

    let customerName = 'Walk-in customer';
    let customerRef = null;
    if (customerId && ObjectId.isValid(customerId)) {
      const cust = await db.collection('customers').findOne({ _id: new ObjectId(customerId), adminId: admin._id });
      if (cust) { customerRef = cust._id; customerName = cust.name; }
    } else if (newCustomer && newCustomer.name) {
      const inserted = await db.collection('customers').insertOne({ adminId: admin._id, name: newCustomer.name, phone: newCustomer.phone || 'N/A', email: newCustomer.email || 'N/A', createdAt: new Date() });
      customerRef = inserted.insertedId;
      customerName = newCustomer.name;
    }

    const saleItems = [];
    let totalAmount = 0;
    for (const line of items) {
      if (!line.itemId || !ObjectId.isValid(line.itemId)) continue;
      const qty = parseInt(line.quantity, 10) || 0;
      if (qty <= 0) continue;
      const item = await db.collection('inventory').findOne({ _id: new ObjectId(line.itemId), adminId: admin._id });
      if (!item) return res.status(400).json({ error: 'Item not found' });
      if ((item.stock || 0) < qty) return res.status(400).json({ error: `Insufficient stock for ${item.name}` });
      const unitCost = line.unitCost !== undefined && line.unitCost !== '' ? parseFloat(line.unitCost) : Number(item.cost) || 0;
      const totalCost = unitCost * qty;
      saleItems.push({ itemId: item._id, itemName: item.name, quantity: qty, unitCost, totalCost });
      totalAmount += totalCost;
    }
    if (saleItems.length === 0) return res.status(400).json({ error: 'No valid items' });

    const sale = { adminId: admin._id, customerId: customerRef, customerName, items: saleItems, totalAmount, paymentMethod: paymentMethod || 'Cash', paymentStatus: paymentStatus || 'Paid', date: new Date(), source: 'invoice', status: 'completed' };
    const result = await db.collection('sales').insertOne(sale);

    for (const li of saleItems) {
      await db.collection('inventory').updateOne({ _id: li.itemId }, { $inc: { stock: -li.quantity } });
    }

    await db.collection('transactions').insertOne({ adminId: admin._id, type: 'sale', amount: totalAmount, date: new Date(), description: `Invoice #${result.insertedId}`, reference: `INV-${result.insertedId}`, balanceImpact: 1 });

    res.status(201).json({ success: true, id: result.insertedId, totalAmount });
  } catch (error) {
    console.error('API create invoice error:', error);
    res.status(500).json({ error: 'Error creating invoice' });
  }
};

// GET /api/admin/profile
exports.getAdminProfile = async (req, res) => {
  try {
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });
    const { password, ...safe } = admin;
    res.json({ profile: safe });
  } catch (error) {
    console.error('API profile error:', error);
    res.status(500).json({ error: 'Error loading profile' });
  }
};

// POST /api/admin/profile (uses uploadLogo middleware - applied in route)
exports.postAdminProfile = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });

    const allowed = ['firstName', 'lastName', 'businessName', 'currency', 'phone', 'email', 'address', 'country', 'facebook', 'instagram', 'twitter', 'publicPhone', 'publicEmail', 'publicAddress', 'paymentInstructions', 'description', 'primaryBankAccountName', 'primaryAccountNumber', 'primaryBankName', 'secondaryBankAccountName', 'secondaryAccountNumber', 'secondaryBankName'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (req.body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) return res.status(400).json({ error: 'Please enter a valid email address' });
    if (req.file) update.logo = `/uploads/${req.file.filename}`;

    await db.collection('admins').updateOne({ _id: admin._id }, { $set: update });
    res.json({ success: true, logo: update.logo || admin.logo || null });
  } catch (error) {
    console.error('API update profile error:', error);
    res.status(500).json({ error: 'Error updating profile' });
  }
};

// GET /api/admin/team
exports.getAdminTeam = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });
    const users = await db.collection('business_users').find({ adminId: admin._id }).project({ password: 0, tempPassword: 0 }).sort({ createdAt: -1 }).toArray();
    res.json({ users });
  } catch (error) {
    console.error('API team error:', error);
    res.status(500).json({ error: 'Error loading team' });
  }
};

// POST /api/admin/team/:id/:action
exports.postAdminTeamAction = async (req, res) => {
  try {
    const db = getDb();
    const admin = await getSessionAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Business not found' });
    const { id, action } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    if (!['activate', 'deactivate'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
    await db.collection('business_users').updateOne({ _id: new ObjectId(id), adminId: admin._id }, { $set: { status: action === 'activate' ? 'active' : 'inactive' } });
    res.json({ success: true });
  } catch (error) {
    console.error('API team action error:', error);
    res.status(500).json({ error: 'Error updating team member' });
  }
};

// GET /api/public/store/:username
exports.getPublicStore = async (req, res) => {
  try {
    const admin = await findStoreByUsername(req.params.username);
    if (!admin) return res.status(404).json({ error: 'Store not found' });
    const db = getDb();
    const inventory = await db.collection('inventory').find({ adminId: admin._id, stock: { $gt: 0 } }).toArray();
    res.json({ store: buildPublicStore(admin), products: inventory.map(publicProduct) });
  } catch (error) {
    console.error('Public store API error:', error);
    res.status(500).json({ error: 'Error loading store' });
  }
};

// GET /api/public/store/:username/product/:id
exports.getPublicStoreProduct = async (req, res) => {
  try {
    const db = getDb();
    const { username, id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(404).json({ error: 'Product not found' });
    const admin = await findStoreByUsername(username);
    if (!admin) return res.status(404).json({ error: 'Store not found' });
    const product = await db.collection('inventory').findOne({ _id: new ObjectId(id), adminId: admin._id });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ store: buildPublicStore(admin), product: publicProduct(product) });
  } catch (error) {
    console.error('Public product API error:', error);
    res.status(500).json({ error: 'Error loading product' });
  }
};

// GET /api/public/store/:username/order/:saleId
exports.getPublicOrder = async (req, res) => {
  try {
    const db = getDb();
    const { username, saleId } = req.params;
    const { token } = req.query;
    if (!ObjectId.isValid(saleId)) return res.status(400).json({ error: 'Invalid sale ID' });

    const tokenEntry = await db.collection('invoice_tokens').findOne({ saleId: new ObjectId(saleId), token });
    if (!tokenEntry || tokenEntry.expires < Date.now()) return res.status(403).json({ error: 'This confirmation link is invalid or has expired' });

    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), source: 'storefront' });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const admin = await findStoreByUsername(username);
    if (!admin) return res.status(404).json({ error: 'Store not found' });

    res.json({
      store: buildPublicStore(admin),
      sale: { _id: sale._id, customerName: sale.customerName || '', phoneNumber: sale.phoneNumber || '', email: sale.email || '', items: sale.items || [], totalAmount: sale.totalAmount || 0, paymentStatus: sale.paymentStatus || 'Pending', createdAt: sale.date || sale.createdAt || null },
      pdfUrl: `/api/public/store/${username}/order/${sale._id}/invoice.pdf?token=${token}`
    });
  } catch (error) {
    console.error('Public order API error:', error);
    res.status(500).json({ error: 'Error loading order' });
  }
};

// GET /api/public/store/:username/order/:saleId/invoice.pdf
exports.getPublicOrderInvoicePdf = async (req, res) => {
  try {
    const db = getDb();
    const { username, saleId } = req.params;
    const { token } = req.query;
    if (!ObjectId.isValid(saleId)) return res.status(400).json({ error: 'Invalid sale ID' });

    const tokenEntry = await db.collection('invoice_tokens').findOne({ saleId: new ObjectId(saleId), token });
    if (!tokenEntry || tokenEntry.expires < Date.now()) return res.status(403).json({ error: 'This invoice link is invalid or has expired' });

    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), source: 'storefront' });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const admin = await findStoreByUsername(username);
    if (!admin) return res.status(404).json({ error: 'Store not found' });

    return generatePDFInvoice(res, sale, admin);
  } catch (error) {
    console.error('Public invoice PDF error:', error);
    res.status(500).json({ error: 'Error generating invoice' });
  }
};

// GET /api/inventory
exports.getApiInventory = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    const query = { adminId: admin._id };
    if (req.query.search) query.name = { $regex: req.query.search, $options: 'i' };

    const items = await db.collection('inventory').find(query).sort({ name: 1 }).toArray();
    res.json({ items });
  } catch (err) {
    console.error('Error in /api/inventory:', err);
    res.status(500).json({ error: 'Server error while loading inventory' });
  }
};

// GET /api/search/suggestions
exports.getSearchSuggestions = async (req, res) => {
  try {
    const db = getDb();
    const query = (req.query && req.query.q) ? String(req.query.q).trim() : '';
    const type = (req.query && req.query.type) ? String(req.query.type) : 'all';

    if (!query || query.length < 2) return res.json([]);

    let suggestions = [];

    if (type === 'all' || type === 'stores') {
      try {
        const stores = await db.collection('admins').find({
          $or: [{ businessName: { $regex: query, $options: 'i' } }, { username: { $regex: query, $options: 'i' } }]
        }).project({ _id: 1, businessName: 1, username: 1, logo: 1 }).limit(5).toArray();

        stores.forEach(store => {
          suggestions.push({ type: 'store', id: store._id.toString(), name: store.businessName, username: store.username, logo: store.logo, url: `/store/${store.username}` });
        });
      } catch (storeError) {
        console.error('Error fetching store suggestions:', storeError.message);
      }
    }

    if (type === 'all' || type === 'products') {
      try {
        const products = await db.collection('inventory').aggregate([
          { $match: { $or: [{ name: { $regex: query, $options: 'i' } }, { description: { $regex: query, $options: 'i' } }] } },
          { $lookup: { from: 'admins', localField: 'adminId', foreignField: '_id', as: 'store' } },
          { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 1, name: 1, cost: 1, image: 1, storeName: '$store.businessName', storeUsername: '$store.username', storeLogo: '$store.logo' } },
          { $limit: 5 }
        ]).toArray();

        products.forEach(product => {
          suggestions.push({ type: 'product', id: product._id.toString(), name: product.name, price: product.cost, image: product.image, storeName: product.storeName, storeUsername: product.storeUsername, storeLogo: product.storeLogo, url: `/store/${product.storeUsername}?product=${product._id.toString()}` });
        });
      } catch (productError) {
        console.error('Error fetching product suggestions:', productError.message);
      }
    }

    suggestions = suggestions.slice(0, 8);
    res.json(suggestions);
  } catch (error) {
    console.error('Error in suggestions API:', error.message);
    res.status(500).json([]);
  }
};

// GET /api/debug/search-test
exports.getDebugSearchTest = async (req, res) => {
  try {
    const db = getDb();
    const { query } = req.query;
    if (!query) return res.json({ error: 'Please provide a query parameter' });

    const directSearch = await db.collection('admins').find({
      $or: [{ businessName: { $regex: query, $options: 'i' } }, { username: { $regex: query, $options: 'i' } }]
    }).project({ businessName: 1, username: 1, active: 1 }).limit(10).toArray();

    const fieldStats = {
      hasActiveField: await db.collection('admins').countDocuments({ active: { $exists: true } }),
      activeTrue: await db.collection('admins').countDocuments({ active: true }),
      activeFalse: await db.collection('admins').countDocuments({ active: false }),
      activeNull: await db.collection('admins').countDocuments({ active: null }),
      totalStores: await db.collection('admins').countDocuments({})
    };

    res.json({ success: true, query, directSearch, fieldStats, directSearchCount: directSearch.length });
  } catch (error) {
    console.error('Debug search test error:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/debug/stores
exports.getDebugStores = async (req, res) => {
  try {
    const db = getDb();
    const stores = await db.collection('admins').find({}).project({ _id: 1, businessName: 1, username: 1, active: 1, email: 1, createdAt: 1 }).limit(20).toArray();
    res.json({ success: true, count: stores.length, stores: stores.map(s => ({ id: s._id.toString(), businessName: s.businessName, username: s.username, active: s.active, email: s.email, createdAt: s.createdAt })) });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/debug/products
exports.getDebugProducts = async (req, res) => {
  try {
    const db = getDb();
    const products = await db.collection('inventory').find({}).project({ _id: 1, name: 1, cost: 1, stock: 1, adminId: 1, createdAt: 1 }).limit(20).toArray();
    res.json({ success: true, count: products.length, products: products.map(p => ({ id: p._id.toString(), name: p.name, cost: p.cost, stock: p.stock, adminId: p.adminId ? p.adminId.toString() : null, createdAt: p.createdAt })) });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/fix/activate-stores (superadmin only - middleware applied in route)
exports.getFixActivateStores = async (req, res) => {
  try {
    const db = getDb();
    const result = await db.collection('admins').updateMany({ active: { $exists: false } }, { $set: { active: true } });
    res.json({ success: true, message: `Updated ${result.modifiedCount} stores with active: true`, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error('Error activating stores:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/products/search
exports.getProductsSearch = async (req, res) => {
  try {
    const db = getDb();
    const query = req.query.q ? req.query.q.trim() : '';
    const type = req.query.type || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    if (!query || query.length < 1) return res.json({ success: true, results: [], total: 0, page: 1, pages: 0 });

    const searchQuery = { $or: [{ name: { $regex: query, $options: 'i' } }, { description: { $regex: query, $options: 'i' } }, { category: { $regex: query, $options: 'i' } }] };
    const total = await db.collection('inventory').countDocuments(searchQuery);

    const products = await db.collection('inventory').aggregate([
      { $match: searchQuery },
      { $lookup: { from: 'admins', localField: 'adminId', foreignField: '_id', as: 'store' } },
      { $unwind: { path: '$store', preserveNullAndEmptyArrays: false } },
      { $match: { 'store.active': true } },
      { $project: { _id: 1, name: 1, description: 1, cost: 1, image: { $ifNull: ['$images', []] }, stock: 1, category: 1, commission: 1, createdAt: 1, storeName: '$store.businessName', storeUsername: '$store.username', storeLogo: '$store.logo', storeLocation: '$store.location', storeEmail: '$store.email', storePhone: '$store.phone' } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]).toArray();

    const results = products.map(product => ({
      id: product._id.toString(),
      name: product.name,
      description: product.description || '',
      price: product.cost || 0,
      image: Array.isArray(product.image) && product.image.length > 0 ? product.image[0] : '/images/default-product.png',
      stock: product.stock || 0,
      category: product.category || '',
      store: { id: product._id.toString(), name: product.storeName, username: product.storeUsername, logo: product.storeLogo || '/images/logo.png', location: product.storeLocation || '', email: product.storeEmail || '', phone: product.storePhone || '' }
    }));

    res.json({ success: true, results, total, page, pages: Math.ceil(total / limit), limit });
  } catch (error) {
    console.error('Error in product search API:', error);
    res.status(500).json({ success: false, error: 'Internal server error', results: [], total: 0 });
  }
};

// GET /api/stores/search
exports.getStoresSearch = async (req, res) => {
  try {
    const db = getDb();
    const query = req.query.q ? req.query.q.trim() : '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!query || query.length < 1) return res.json({ success: true, results: [], total: 0, page: 1, pages: 0 });

    const searchQuery = { $or: [{ businessName: { $regex: query, $options: 'i' } }, { username: { $regex: query, $options: 'i' } }, { description: { $regex: query, $options: 'i' } }], active: true };
    const total = await db.collection('admins').countDocuments(searchQuery);

    const stores = await db.collection('admins').find(searchQuery).project({ _id: 1, businessName: 1, username: 1, logo: 1, description: 1, createdAt: 1, location: 1, phone: 1, email: 1, currency: 1, country: 1 }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();

    const results = await Promise.all(stores.map(async (store) => {
      const productCount = await db.collection('inventory').countDocuments({ adminId: store._id, stock: { $gt: 0 } });
      return { id: store._id.toString(), name: store.businessName, username: store.username, logo: store.logo || '/images/logo.png', description: store.description || '', location: store.location || '', phone: store.phone || '', email: store.email || '', currency: store.currency || '₦', country: store.country || '', productCount, createdAt: store.createdAt, url: `/store/${store.username}` };
    }));

    res.json({ success: true, results, total, page, pages: Math.ceil(total / limit), limit });
  } catch (error) {
    console.error('Error in store search API:', error);
    res.status(500).json({ success: false, error: 'Internal server error', results: [], total: 0 });
  }
};
