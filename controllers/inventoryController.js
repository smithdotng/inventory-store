const { ObjectId } = require('mongodb');
const { getDb } = require('../config/db');
const { formatCurrency } = require('../utils/helpers');

// GET /inventory (was /update-stock)
exports.getInventory = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const { search } = req.query;

    const filter = { adminId: admin._id };

    if (search && search.trim() !== '') {
      filter.name = new RegExp(search.trim(), 'i');
    }

    const inventory = await db.collection('inventory')
      .find(filter)
      .sort({ name: 1 })
      .toArray();

    const username = req.session.admin;

    const baseUrl = process.env.BASE_URL ||
                    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;

    const storeUrl = `${baseUrl}/store/${username}`;

    res.render('inventory', {
      inventory,
      admin,
      username,
      formatCurrency,
      search: search || '',
      storeUrl,
      baseUrl,
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.render('inventory', {
      inventory: [],
      admin: null,
      username: req.session.admin,
      formatCurrency,
      search: '',
      storeUrl: '',
      baseUrl: process.env.BASE_URL || 'https://yourdomain.com',
      error: 'Failed to load inventory. Please try again.',
      success: null
    });
  }
};

// POST /inventory (was /update-stock)
exports.postInventory = async (req, res) => {
  const { _id, stock, cost, commission, description, search = '' } = req.body;
  const db = getDb();

  try {
    if (!_id) throw new Error('Item ID is required.');

    const stockNum = parseInt(stock);
    const costNum = parseFloat(cost);
    const commissionNum = commission !== undefined && commission !== '' ? parseFloat(commission) : null;

    if (isNaN(stockNum) || stockNum < 0) throw new Error('Stock must be a non-negative number.');
    if (isNaN(costNum) || costNum < 0) throw new Error('Cost must be a non-negative number.');
    if (commissionNum !== null && (commissionNum < 0 || commissionNum > 100)) throw new Error('Commission must be between 0 and 100.');

    const objectId = new ObjectId(_id);
    const updateData = { stock: stockNum, cost: costNum };
    if (commissionNum !== null) updateData.commission = commissionNum;

    if (description !== undefined) {
      updateData.description = description.trim().substring(0, 400);
    }

    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) throw new Error('Admin not found.');

    const item = await db.collection('inventory').findOne({ _id: objectId, adminId: admin._id });
    if (!item) throw new Error('Item not found or you do not have permission to update it.');

    const result = await db.collection('inventory').updateOne(
      { _id: objectId },
      { $set: updateData }
    );

    if (result.matchedCount === 0) throw new Error('Item not found.');

    res.redirect(`/inventory?success=Item updated successfully${search ? `&search=${encodeURIComponent(search)}` : ''}`);
  } catch (error) {
    console.error('Error updating item:', error);
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    let inventory = [];
    if (admin) {
      const query = { adminId: admin._id };
      if (search) query.name = { $regex: search, $options: 'i' };
      inventory = await db.collection('inventory').find(query).toArray();
    }
    res.render('inventory', {
      inventory,
      admin: admin || null,
      username: req.session.admin,
      formatCurrency,
      search: search || '',
      storeUrl: '',
      baseUrl: '',
      error: error.message,
      success: null
    });
  }
};

// POST /add-product
exports.addProduct = async (req, res) => {
  const { name, description, stock, cost, commission, isVatable } = req.body;
  const db = getDb();
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      return res.render('inventory', {
        inventory: [],
        admin: null,
        username: req.session.admin,
        formatCurrency,
        search: '',
        storeUrl: '',
        baseUrl: '',
        error: 'Admin not found.',
        success: null
      });
    }

    if (description && description.length > 400) {
      return res.render('inventory', {
        inventory: [],
        admin: null,
        username: req.session.admin,
        formatCurrency,
        search: '',
        storeUrl: '',
        baseUrl: '',
        error: 'Description cannot exceed 400 characters.',
        success: null
      });
    }

    const newProduct = {
      name,
      description: description || '',
      stock: parseInt(stock),
      cost: parseFloat(cost),
      adminId: admin._id,
      isVatable: isVatable === 'on',
      createdAt: new Date()
    };

    if (req.files && req.files.length > 0) {
      newProduct.images = req.files.map(file => `/uploads/${file.filename}`);
    } else {
      newProduct.images = [];
    }

    if (commission !== undefined && commission !== '') {
      newProduct.commission = parseFloat(commission);
    }

    await db.collection('inventory').insertOne(newProduct);
    res.redirect('/inventory');
  } catch (error) {
    console.error('Error adding product:', error);
    res.render('inventory', {
      inventory: [],
      admin: null,
      username: req.session.admin,
      formatCurrency,
      search: '',
      storeUrl: '',
      baseUrl: '',
      error: 'Error adding product.',
      success: null
    });
  }
};

// POST /delete-stock
exports.deleteStock = async (req, res) => {
  const { _id } = req.body;
  const db = getDb();
  try {
    const objectId = new ObjectId(_id);
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) throw new Error('Admin not found.');
    const result = await db.collection('inventory').deleteOne({ _id: objectId, adminId: admin._id });
    if (result.deletedCount === 0) throw new Error('Item not found or you do not have permission.');
    res.redirect('/inventory?success=Item deleted successfully');
  } catch (error) {
    console.error('Error deleting item:', error);
    const db2 = getDb();
    const admin = await db2.collection('admins').findOne({ username: req.session.admin });
    const inventory = admin ? await db2.collection('inventory').find({ adminId: admin._id }).toArray() : [];
    res.render('inventory', {
      inventory,
      admin: admin || null,
      username: req.session.admin,
      formatCurrency,
      search: '',
      storeUrl: '',
      baseUrl: '',
      error: error.message,
      success: null
    });
  }
};

// GET /store-view
exports.getStoreView = async (req, res) => {
  const db = getDb();
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();
  const username = req.session.admin;
  res.render('store-view', { inventory, admin, username });
};

// POST /update-description
exports.updateDescription = async (req, res) => {
  try {
    const db = getDb();
    const { _id, description, search } = req.body;

    if (!_id || !ObjectId.isValid(_id)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    if (description && description.length > 400) {
      return res.status(400).json({ error: 'Description too long' });
    }

    const result = await db.collection('inventory').updateOne(
      { _id: new ObjectId(_id) },
      { $set: { description: description || '' } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Item not found or no changes made' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating description:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
