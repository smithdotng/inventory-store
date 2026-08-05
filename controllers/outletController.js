const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const { getDb } = require('../config/db');
const { formatCurrency } = require('../utils/helpers');

// GET /create-outlet
exports.getCreateOutlet = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const outlets = await db.collection('outlets').find({ adminId: admin._id }).toArray();
    const username = req.session.admin;
    res.render('create-outlet', { error: req.session.error || null, admin, username, outlets });
    req.session.error = null;
  } catch (error) {
    console.error('Error fetching outlets:', error);
    res.render('create-outlet', { error: 'Error fetching outlets', admin: null, username: req.session.admin, outlets: [] });
  }
};

// POST /create-outlet
exports.postCreateOutlet = async (req, res) => {
  const { name, location, mobile, username, password } = req.body;
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const existingOutlet = await db.collection('outlets').findOne({ username });

    if (existingOutlet) {
      req.session.error = 'Username already exists';
      return res.redirect('/home');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.collection('outlets').insertOne({
      name, location, mobile, username,
      password: hashedPassword,
      adminId: admin._id,
      inventory: []
    });

    res.redirect('/home');
  } catch (error) {
    console.error('Error creating outlet:', error);
    req.session.error = 'An error occurred while creating outlet';
    res.redirect('/home');
  }
};

// POST /delete-outlet (form POST)
exports.postDeleteOutletForm = async (req, res) => {
  try {
    const db = getDb();
    const adminId = req.session.adminId;
    const outletId = req.body._id;

    if (!ObjectId.isValid(outletId)) {
      req.session.error = 'Invalid outlet ID';
      return res.redirect('/home');
    }

    const result = await db.collection('outlets').deleteOne({
      _id: new ObjectId(outletId),
      adminId: new ObjectId(adminId)
    });

    if (result.deletedCount === 0) {
      req.session.error = 'Outlet not found or unauthorized';
      return res.redirect('/home');
    }

    req.session.success = 'Outlet deleted successfully';
    res.redirect('/home');
  } catch (error) {
    console.error('Error deleting outlet:', error);
    req.session.error = 'Failed to delete outlet';
    res.redirect('/home');
  }
};

// POST /delete-outlet/:outletId (URL param version)
exports.postDeleteOutlet = async (req, res) => {
  const outletId = req.params.outletId;
  const db = getDb();
  await db.collection('outlets').deleteOne({ _id: new ObjectId(outletId) });
  res.redirect('/home');
};

// GET /outlet-login
exports.getOutletLogin = (req, res) => {
  res.render('outlet-login', { error: null });
};

// POST /outlet-login
exports.postOutletLogin = async (req, res) => {
  const db = getDb();
  const { usernameOrEmail, password } = req.body;
  const outlet = await db.collection('outlets').findOne({
    $or: [
      { username: usernameOrEmail },
      { email: usernameOrEmail }
    ]
  });
  if (outlet && await bcrypt.compare(password, outlet.password)) {
    req.session.outletId = outlet._id.toString();
    res.redirect(`/outlet/${outlet._id}/stock-view`);
  } else {
    res.render('outlet-login', { error: 'Invalid username/email or password' });
  }
};

// GET /outlet-details/:outletId
exports.getOutletDetails = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const outletId = req.params.outletId;
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
    if (!outlet) return res.status(404).send('Outlet not found');
    res.render('outlet-details', {
      outlet, admin, username: req.session.admin,
      error: null, success: null
    });
  } catch (err) {
    console.error('Error in /outlet-details/:outletId:', err.message, err.stack);
    res.status(500).send('Internal Server Error');
  }
};

// GET /dispense-to-outlet/:outletId
exports.getDispenseToOutlet = async (req, res) => {
  try {
    const db = getDb();
    const outletId = req.params.outletId;
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
    if (!outlet) return res.status(404).send('Outlet not found');

    const admin = await db.collection('admins').findOne({ _id: outlet.adminId });
    const adminInventory = await db.collection('inventory').find({ adminId: outlet.adminId }).toArray();
    const username = req.session.admin;

    res.render('dispense-to-outlet', {
      outlet, admin, adminInventory, username,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error('Error fetching outlet details:', error);
    res.status(500).send('Internal Server Error');
  }
};

// POST /dispense-to-outlet/:outletId
exports.postDispenseToOutlet = async (req, res) => {
  const outletId = req.params.outletId;
  const { itemId, quantity } = req.body;
  try {
    const db = getDb();
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
    if (!outlet) return res.status(404).send('Outlet not found');

    const qty = parseInt(quantity);
    const adminProduct = await db.collection('inventory').findOne({ _id: new ObjectId(itemId), adminId: outlet.adminId });
    if (!adminProduct) return res.status(404).send('Item not found');
    if (adminProduct.stock < qty) return res.status(400).send('Insufficient stock');

    await db.collection('inventory').updateOne(
      { _id: new ObjectId(itemId) },
      { $inc: { stock: -qty } }
    );

    const outletItemIndex = outlet.inventory ? outlet.inventory.findIndex(i => (i.id || i._id).toString() === itemId) : -1;

    if (outletItemIndex !== -1) {
      await db.collection('outlets').updateOne(
        { _id: new ObjectId(outletId), 'inventory.id': itemId },
        { $inc: { 'inventory.$.stock': qty } }
      );
    } else {
      await db.collection('outlets').updateOne(
        { _id: new ObjectId(outletId) },
        {
          $push: {
            inventory: {
              id: itemId,
              name: adminProduct.name,
              cost: adminProduct.cost,
              stock: qty
            }
          }
        }
      );
    }

    res.redirect(`/dispense-to-outlet/${outletId}?success=Stock dispensed successfully`);
  } catch (error) {
    console.error('Error dispensing to outlet:', error);
    res.redirect(`/dispense-to-outlet/${outletId}?error=Failed to dispense: ${encodeURIComponent(error.message)}`);
  }
};

// POST /dispense (old single-item form)
exports.postDispense = async (req, res) => {
  const { id, quantity } = req.body;
  const qty = parseInt(quantity);
  try {
    const db = getDb();
    if (isNaN(qty) || qty <= 0) return res.status(400).send('Invalid quantity');
    const item = await db.collection('inventory').findOne({ _id: new ObjectId(id) });
    if (!item || item.stock < qty) return res.status(400).send('Invalid item or insufficient stock');
    await db.collection('inventory').updateOne({ _id: new ObjectId(id) }, { $inc: { stock: -qty } });
    res.redirect('/home');
  } catch (error) {
    console.error('Error dispensing item:', error);
    res.status(500).send('Internal Server Error');
  }
};

// GET /outlet/:outletId/stock-view
exports.getOutletStockView = async (req, res) => {
  const db = getDb();
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  if (!outlet || outlet._id.toString() !== req.session.outletId) return res.redirect('/outlet-login');
  const admin = await db.collection('admins').findOne({ _id: outlet.adminId });
  res.render('outlet-stock-view', {
    outlet,
    admin: {
      logo: admin?.logo || '/images/logo.jpg',
      businessName: admin?.businessName || 'Shed',
      currency: admin?.currency || '$'
    },
    formatCurrency,
  });
};

// GET /outlet/sales-form
exports.getOutletSalesForm = async (req, res) => {
  try {
    const db = getDb();
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(req.session.outletId) });
    if (!outlet) return res.status(404).send('Outlet not found');

    const admin = await db.collection('admins').findOne({ _id: outlet.adminId });
    const inventory = outlet.inventory || [];

    res.render('outlet-sales-form', { inventory, outlet, admin, formatCurrency });
  } catch (error) {
    console.error('Error fetching outlet sales form:', error);
    res.status(500).send('Internal Server Error');
  }
};

// POST /outlet/sales-form
exports.postOutletSalesForm = async (req, res) => {
  const { customerName, phoneNumber, email, items } = req.body;
  try {
    const db = getDb();
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(req.session.outletId) });
    if (!outlet) return res.status(404).send('Outlet not found');
    if (!Array.isArray(items)) return res.status(400).send('Invalid items data');

    const admin = await db.collection('admins').findOne({ _id: outlet.adminId });
    const saleItems = [];
    let totalAmount = 0;
    let totalCommission = 0;

    for (const itemData of items) {
      const itemId = itemData.itemId;
      const qty = parseInt(itemData.quantity);
      if (!itemId || isNaN(qty)) return res.status(400).send('Invalid item ID or quantity');

      const outletItem = outlet.inventory.find(i => (i.id && i.id.toString() === itemId) || (i._id && i._id.toString() === itemId));
      if (!outletItem) return res.status(404).send(`Item ${itemId} not found in outlet inventory`);

      const adminProduct = await db.collection('inventory').findOne({ _id: new ObjectId(outletItem.id || outletItem._id), adminId: outlet.adminId });

      let commissionAmount = 0;
      let commissionRate = 0;
      if (adminProduct?.commission) {
        commissionRate = parseFloat(adminProduct.commission);
        commissionAmount = (adminProduct.cost * qty * commissionRate) / 100;
        totalCommission += commissionAmount;
      }

      saleItems.push({
        itemId: new ObjectId(outletItem.id || outletItem._id),
        itemName: outletItem.name,
        quantity: qty,
        unitCost: adminProduct?.cost || 0,
        totalCost: (adminProduct?.cost || 0) * qty,
        commissionRate,
        commissionAmount
      });
      totalAmount += (adminProduct?.cost || 0) * qty;

      await db.collection('outlets').updateOne(
        { _id: new ObjectId(req.session.outletId), 'inventory.id': itemId },
        { $inc: { 'inventory.$.stock': -qty } }
      );
    }

    totalCommission = parseFloat(totalCommission.toFixed(2));
    const sale = {
      outletId: outlet._id,
      outletName: outlet.name,
      adminId: outlet.adminId,
      customerName,
      phoneNumber: phoneNumber || 'N/A',
      email: email || 'N/A',
      items: saleItems,
      totalAmount,
      totalCommission,
      date: new Date(),
      paymentMethod: 'Cash',
      paymentStatus: 'Paid',
      source: 'outlet'
    };

    const saleResult = await db.collection('sales').insertOne(sale);

    if (totalCommission > 0) {
      for (const item of saleItems.filter(i => i.commissionAmount > 0)) {
        const commissionDoc = {
          saleId: saleResult.insertedId,
          adminId: outlet.adminId,
          outletId: outlet._id,
          outletName: outlet.name,
          itemId: item.itemId,
          itemName: item.itemName,
          quantity: parseInt(item.quantity),
          amount: parseFloat(item.commissionAmount.toFixed(2)) + 0.000001,
          rate: parseFloat(item.commissionRate.toFixed(2)) + 0.000001,
          date: new Date(),
          status: 'pending'
        };
        await db.collection('commissions').insertOne(commissionDoc);
      }
    }

    res.redirect('/outlet/sales-form?success=' + encodeURIComponent('Sale recorded successfully'));
  } catch (error) {
    console.error('Error processing outlet sale:', error);
    res.redirect('/outlet/sales-form?error=' + encodeURIComponent('Failed to complete sale: ' + error.message));
  }
};

// GET /outlet-transactions/:outletId
exports.getOutletTransactions = async (req, res) => {
  try {
    const db = getDb();
    const outletId = req.params.outletId;
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });

    if (!outlet || outlet._id.toString() !== req.session.outletId) return res.redirect('/outlet-login');

    const admin = await db.collection('admins').findOne({ _id: outlet.adminId });
    const transactions = await db.collection('sales')
      .find({ outletId: new ObjectId(outletId) })
      .sort({ date: -1 })
      .toArray();

    res.render('outlet-transactions', {
      outlet,
      transactions,
      admin: {
        logo: admin?.logo || '/images/logo.jpg',
        businessName: admin?.businessName || 'Shed',
        currency: admin?.currency || '$'
      },
      formatCurrency
    });
  } catch (error) {
    console.error('Error fetching outlet transactions:', error);
    res.status(500).send('Internal Server Error');
  }
};

// GET /outlet-customers/:outletId
exports.getOutletCustomers = async (req, res) => {
  try {
    const db = getDb();
    const outletId = req.params.outletId;
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });

    if (!outlet || outlet._id.toString() !== req.session.outletId) return res.redirect('/outlet-login');

    const sales = await db.collection('sales')
      .find({ outletId: new ObjectId(outletId) })
      .sort({ date: -1 })
      .toArray();

    const customerMap = new Map();
    sales.forEach(sale => {
      const key = `${sale.customerName}-${sale.phoneNumber}-${sale.email || 'N/A'}`;
      if (!customerMap.has(key)) {
        customerMap.set(key, { customerName: sale.customerName, phoneNumber: sale.phoneNumber, email: sale.email || 'N/A' });
      }
    });
    const customers = Array.from(customerMap.values());

    const admin = await db.collection('admins').findOne({ _id: outlet.adminId });

    res.render('outlet-customers', {
      outlet,
      customers,
      admin: {
        logo: admin?.logo || '/images/logo.jpg',
        businessName: admin?.businessName || 'Shed',
        currency: admin?.currency || '$'
      },
      formatCurrency
    });
  } catch (error) {
    console.error('Error fetching outlet customers:', error);
    res.status(500).send('Internal Server Error');
  }
};

// POST /pay-commission/:outletId
exports.postPayCommission = async (req, res) => {
  try {
    const db = getDb();
    const outletId = req.params.outletId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });

    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId), adminId: admin._id });
    if (!outlet) return res.status(404).json({ success: false, message: 'Outlet not found or unauthorized' });

    const pendingCommissions = await db.collection('commissions')
      .find({ outletId: new ObjectId(outletId), status: 'pending' })
      .toArray();

    if (pendingCommissions.length === 0) return res.status(400).json({ success: false, message: 'No pending commissions' });

    const totalAmount = pendingCommissions.reduce((sum, c) => sum + c.amount, 0);

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection('commissions').updateMany(
          { outletId: new ObjectId(outletId), status: 'pending' },
          { $set: { status: 'paid', paidAt: new Date() } },
          { session }
        );

        await db.collection('commission_payments').insertOne({
          adminId: admin._id,
          outletId: new ObjectId(outletId),
          outletName: outlet.name,
          amount: totalAmount,
          datePaid: new Date(),
          commissionIds: pendingCommissions.map(c => c._id)
        }, { session });

        await db.collection('transactions').insertOne({
          adminId: admin._id,
          type: 'commission_payment',
          amount: totalAmount,
          date: new Date(),
          description: `Commission payment to outlet: ${outlet.name}`,
          reference: `COMM-${outletId}-${Date.now()}`,
          balanceImpact: -1
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    res.json({ success: true, amount: totalAmount, outletName: outlet.name });
  } catch (error) {
    console.error('Error processing commission payment:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getOutletLogout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying outlet session:', err);
      return res.status(500).send('Error logging out');
    }
    res.redirect('/admin-login');
  });
};

exports.getOutletStorefront = async (req, res) => {
  const { getDb } = require('../config/db');
  const { ObjectId } = require('mongodb');
  const db = getDb();
  try {
    const outletUsername = req.params.outletUsername;
    const saleId = req.query.saleId;

    const outlet = await db.collection('outlets').findOne({
      username: { $regex: `^${outletUsername}$`, $options: 'i' }
    });
    if (!outlet) return res.status(404).render('404', { message: 'Outlet store not found' });

    if (outlet.username !== outletUsername) {
      return res.redirect(`/outlet/${encodeURIComponent(outlet.username)}`);
    }

    const admin = await db.collection('admins').findOne({ _id: outlet.adminId });
    if (!admin) return res.status(404).render('404', { message: 'Associated admin not found' });

    let sale = null;
    if (saleId && ObjectId.isValid(saleId)) {
      sale = await db.collection('sales').findOne({
        _id: new ObjectId(saleId),
        outletId: outlet._id,
        source: 'outlet-storefront'
      });
    }

    const inventory = outlet.inventory ? outlet.inventory.filter(item => item.stock > 0) : [];

    res.render('outlet-details', {
      outlet,
      admin,
      inventory,
      sale,
      currency: admin.currency || '₦',
      buyerProfile: req.session.buyer || null,
      error: null
    });
  } catch (err) {
    console.error('Error loading outlet storefront:', err);
    res.status(500).render('500', { message: 'Error loading outlet' });
  }
};
