const { ObjectId } = require('mongodb');
const { getDb } = require('../config/db');
const { formatCurrency } = require('../utils/helpers');

// GET /customers
exports.getCustomers = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const { search } = req.query;

    const filter = { adminId: admin._id };
    if (search && search.trim() !== '') {
      filter.name = new RegExp(search.trim(), 'i');
    }

    const customers = await db.collection('customers')
      .find(filter)
      .sort({ name: 1 })
      .toArray();

    for (let customer of customers) {
      const sales = await db.collection('sales')
        .find({
          $or: [
            { adminId: admin._id, customerId: customer._id },
            { 'outlet.adminId': admin._id, customerId: customer._id }
          ]
        }).toArray();

      customer.totalValue = sales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
      customer.lastPurchaseDate = sales.length > 0
        ? Math.max(...sales.map(sale => new Date(sale.date).getTime()))
        : null;
    }

    res.render('customers', {
      customers,
      admin,
      username: req.session.admin,
      formatCurrency,
      search: search || ''
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).send('Internal Server Error');
  }
};

// GET /customer-details/:customerId
exports.getCustomerDetails = async (req, res) => {
  try {
    const db = getDb();
    const customerId = req.params.customerId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const customer = await db.collection('customers').findOne({ _id: new ObjectId(customerId), adminId: admin._id });
    if (!customer) return res.status(404).send('Customer not found.');
    res.render('customer-details', { customer, admin, username: req.session.admin, formatCurrency });
  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).send('Internal Server Error');
  }
};

// GET /edit-customer/:customerId
exports.getEditCustomer = async (req, res) => {
  try {
    const db = getDb();
    const customerId = req.params.customerId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const customer = await db.collection('customers').findOne({ _id: new ObjectId(customerId), adminId: admin._id });
    if (!customer) return res.status(404).send('Customer not found.');
    res.render('edit-customer', { customer, admin, username: req.session.admin });
  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).send('Internal Server Error');
  }
};

// POST /update-customer/:customerId
exports.postUpdateCustomer = async (req, res) => {
  try {
    const db = getDb();
    const customerId = req.params.customerId;
    const { name, phone, email } = req.body;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    await db.collection('customers').updateOne(
      { _id: new ObjectId(customerId), adminId: admin._id },
      { $set: { name, phone, email } }
    );
    res.redirect('/customers');
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).send('Internal Server Error');
  }
};

// POST /add-customer
exports.postAddCustomer = async (req, res) => {
  const { name, phone, email } = req.body;
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    await db.collection('customers').insertOne({
      adminId: admin._id,
      name,
      phone: phone || 'N/A',
      email: email || 'N/A',
      createdAt: new Date()
    });
    res.redirect('/customers');
  } catch (error) {
    console.error('Error adding customer:', error);
    res.status(500).send('Internal Server Error');
  }
};

// POST /delete-customer/:customerId
exports.postDeleteCustomer = async (req, res) => {
  try {
    const db = getDb();
    const customerId = req.params.customerId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    await db.collection('customers').deleteOne({ _id: new ObjectId(customerId), adminId: admin._id });
    res.redirect('/customers');
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).send('Internal Server Error');
  }
};
