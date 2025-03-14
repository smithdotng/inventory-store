const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const session = require('express-session');
require('dotenv').config();
const app = express();
const port = 3000;
const MongoStore = require('connect-mongo');


// MongoDB connection details from .env
const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME;
let db;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Session middleware for admin authentication
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: { secure: false } // Set to true if using HTTPS
}));




// Connect to MongoDB
async function connectToMongo() {
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    console.log('Attempting to connect to MongoDB with URI:', uri.replace(/\/\/.*@/, '//[REDACTED]@')); // Redact credentials for logging
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db(dbName);
    console.log('Using database:', dbName);

    const inventoryCollection = db.collection('inventory');
    const count = await inventoryCollection.countDocuments();
    if (count === 0) {
      const initialInventory = [
        { id: 1, name: 'Hoodies', stock: 10 },
        { id: 2, name: 'T-shirt', stock: 15 },
        { id: 3, name: 'Sweatshirt', stock: 8 },
        { id: 4, name: 'Cap', stock: 20 },
        { id: 5, name: 'Phone case', stock: 25 },
        { id: 6, name: 'Mugs', stock: 12 },
        { id: 7, name: 'Felt Product', stock: 5 },
      ];
      await inventoryCollection.insertMany(initialInventory);
      console.log('Initial inventory seeded');
    }
  } catch (err) {
    console.error('MongoDB connection error:', err.message, err.stack);
    // Optionally, you can retry connecting
    setTimeout(connectToMongo, 5000); // Retry after 5 seconds
  }
}



// Middleware to check if admin is logged in
function isAuthenticated(req, res, next) {
  if (req.session.admin) {
    return next();
  }
  res.redirect('/admin-login');
}

const winston = require('winston');
const logger = winston.createLogger({
  level: 'error',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.Console()
  ]
});




// Admin Login Routes
app.get('/admin-login', (req, res) => {
  res.render('admin-login', { error: null });
});

app.get('/health', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ status: 'error', message: 'Database not initialized' });
    }
    await db.collection('outlets').findOne({});
    res.json({ status: 'ok', message: 'Database connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  const adminUsername = 'admin';
  const adminPassword = 'password123';
  if (username === adminUsername && password === adminPassword) {
    req.session.admin = true;
    res.redirect('/home');
  } else {
    res.render('admin-login', { error: 'Invalid username or password' });
  }
});

app.get('/admin-logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin-login');
});

// Home Page Route
app.get('/home', isAuthenticated, async (req, res) => {
  const outlets = await db.collection('outlets').find().toArray();
  res.render('home', { outlets });
});

// Create Outlet Route
app.get('/create-outlet', isAuthenticated, (req, res) => {
  res.render('create-outlet', { error: null });
});

app.post('/create-outlet', isAuthenticated, async (req, res) => {
  const { name, location, mobile, username, password } = req.body;
  const existingOutlet = await db.collection('outlets').findOne({ username });
  if (existingOutlet) {
    return res.render('create-outlet', { error: 'Username already exists' });
  }
  await db.collection('outlets').insertOne({
    name,
    location,
    mobile,
    username,
    password,
    inventory: []
  });
  res.redirect('/home');
});

// Dispense to Outlet Route
app.get('/dispense-to-outlet/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  const inventory = await db.collection('inventory').find().toArray();
  res.render('dispense-to-outlet', { outlet, inventory });
});

app.post('/dispense-to-outlet/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const { itemId, quantity } = req.body;
  const qty = parseInt(quantity);
  const item = await db.collection('inventory').findOne({ id: parseInt(itemId) });
  if (item && item.stock >= qty && qty > 0) {
    await db.collection('inventory').updateOne(
      { id: parseInt(itemId) },
      { $inc: { stock: -qty } }
    );
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
    const outletItem = outlet.inventory.find(i => i.id === parseInt(itemId));
    if (outletItem) {
      await db.collection('outlets').updateOne(
        { _id: new ObjectId(outletId), 'inventory.id': parseInt(itemId) },
        { $inc: { 'inventory.$.stock': qty } }
      );
    } else {
      await db.collection('outlets').updateOne(
        { _id: new ObjectId(outletId) },
        { $push: { inventory: { id: parseInt(itemId), name: item.name, stock: qty } } }
      );
    }
  }
  res.redirect(`/dispense-to-outlet/${outletId}`);
});

// Delete Outlet Route
app.post('/delete-outlet/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  await db.collection('outlets').deleteOne({ _id: new ObjectId(outletId) });
  res.redirect('/home');
});

// Update Stock Page
app.get('/update-stock', isAuthenticated, async (req, res) => {
  const inventory = await db.collection('inventory').find().toArray();
  res.render('update-stock', { inventory });
});

app.post('/update-stock', isAuthenticated, async (req, res) => {
  const { id, stock } = req.body;
  await db.collection('inventory').updateOne(
    { id: parseInt(id) },
    { $set: { stock: parseInt(stock) } }
  );
  res.redirect('/update-stock');
});

// Store View Page
app.get('/store-view', isAuthenticated, async (req, res) => {
  const inventory = await db.collection('inventory').find().toArray();
  res.render('store-view', { inventory });
});

app.post('/dispense', isAuthenticated, async (req, res) => {
  const { id, quantity } = req.body;
  const qty = parseInt(quantity);
  const item = await db.collection('inventory').findOne({ id: parseInt(id) });
  if (item && item.stock >= qty && qty > 0) {
    await db.collection('inventory').updateOne(
      { id: parseInt(id) },
      { $inc: { stock: -qty } }
    );
  }
  res.redirect('/store-view');
});

// Outlet Login Routes
app.get('/outlet-login', (req, res) => {
  res.render('outlet-login', { error: null });
});

app.post('/outlet-login', async (req, res) => {
  const { username, password } = req.body;
  const outlet = await db.collection('outlets').findOne({ username, password });
  if (outlet) {
    req.session.outletId = outlet._id.toString();
    res.redirect(`/outlet/${outlet._id}/stock-view`);
  } else {
    res.render('outlet-login', { error: 'Invalid username or password' });
  }
});

// Middleware to check if outlet is logged in
function isOutletAuthenticated(req, res, next) {
  if (req.session.outletId) {
    return next();
  }
  res.redirect('/outlet-login');
}

// Outlet Stock View
app.get('/outlet/:outletId/stock-view', isOutletAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  if (!outlet || outlet._id.toString() !== req.session.outletId) {
    return res.redirect('/outlet-login');
  }
  res.render('outlet-stock-view', { outlet });
});

// Outlet Sales Form
app.get('/outlet/:outletId/sales-form', isOutletAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  if (!outlet || outlet._id.toString() !== req.session.outletId) {
    return res.redirect('/outlet-login');
  }
  res.render('outlet-sales-form', { outlet });
});

app.post('/outlet/:outletId/sales-form', isOutletAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const { customerName, phoneNumber, email, itemId, quantity } = req.body;
  const qty = parseInt(quantity);
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  if (!outlet || outlet._id.toString() !== req.session.outletId) {
    return res.redirect('/outlet-login');
  }
  const item = outlet.inventory.find(i => i.id === parseInt(itemId));
  if (item && item.stock >= qty && qty > 0) {
    await db.collection('outlets').updateOne(
      { _id: new ObjectId(outletId), 'inventory.id': parseInt(itemId) },
      { $inc: { 'inventory.$.stock': -qty } }
    );
    await db.collection('sales').insertOne({
      outletId,
      customerName,
      phoneNumber,
      email,
      itemId: parseInt(itemId),
      itemName: item.name,
      quantity: qty,
      date: new Date()
    });
  }
  res.redirect(`/outlet/${outletId}/sales-form`);
});

// Outlet Details Route
app.get('/outlet-details/:outletId', isAuthenticated, async (req, res) => {
  try {
    console.log('Accessing /outlet-details/:outletId with outletId:', req.params.outletId);
    if (!db) {
      console.error('Database not initialized');
      return res.status(500).send('Database not initialized');
    }
    const outletId = req.params.outletId;
    let objectId;
    try {
      objectId = new ObjectId(outletId);
    } catch (err) {
      console.error('Invalid ObjectId:', outletId, err.message);
      return res.status(400).send('Invalid outlet ID');
    }
    console.log('Querying outlet with _id:', objectId);
    const outlet = await db.collection('outlets').findOne({ _id: objectId });
    if (!outlet) {
      console.log('Outlet not found for _id:', objectId);
      return res.status(404).send('Outlet not found');
    }
    console.log('Outlet found:', outlet);
    res.render('outlet-details', { outlet });
  } catch (err) {
    console.error('Error in /outlet-details/:outletId:', err.message, err.stack);
    res.status(500).send('Internal Server Error');
  }
});

// Outlet Transactions Route
app.get('/outlet-transactions/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  if (!outlet) {
    return res.status(404).send('Outlet not found');
  }
  const transactions = await db.collection('sales').find({ outletId: outletId }).toArray();
  res.render('outlet-transactions', { outlet, transactions });
});

// Outlet Customers Route
app.get('/outlet-customers/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  if (!outlet) {
    return res.status(404).send('Outlet not found');
  }
  // Fetch sales and aggregate unique customers
  const sales = await db.collection('sales').find({ outletId: outletId }).toArray();
  const customerMap = new Map();
  sales.forEach(sale => {
    const key = `${sale.customerName}-${sale.phoneNumber}-${sale.email || 'N/A'}`;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        customerName: sale.customerName,
        phoneNumber: sale.phoneNumber,
        email: sale.email || 'N/A'
      });
    }
  });
  const customers = Array.from(customerMap.values());
  res.render('outlet-customers', { outlet, customers });
});

// Start server and connect to MongoDB
async function startServer() {
  await connectToMongo();
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();