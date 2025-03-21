require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const session = require('express-session');
const bcrypt = require('bcrypt');
const winston = require('winston');
const MongoStore = require('connect-mongo');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const app = express();
const port = 3000;

// MongoDB connection details from .env
const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME;
let db;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

const nodemailer = require('nodemailer');

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com', // Replace with your IMAP server host
  port: 465, // IMAP over SSL port
  secure: true, // Use SSL
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS  // Your email password or app-specific password
  },
  tls: {
    rejectUnauthorized: false // Use this if you encounter self-signed certificate issues
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP connection error:', error);
  } else {
    console.log('SMTP connection successful:', success);
  }
});

async function sendWelcomeEmail(email, username, businessName) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Welcome to Shed - !',
    html: `
      <h1>Welcome, ${username}!</h1>
      <p>Thank you for registering your business, ${businessName}, on <strong>Shed</strong>.</p>
      <p>Tired of juggling spreadsheets, writing transactions on notebook you worry you might lose, 
      losing track of stock, or wasting hours on manual updates?</p>

      <p> Say hello to Shed, the ultimate small and medium business solution designed to simplify your business operations 
      and boost your bottom line!</p>

      <p>We are excited to have you on board and look forward to helping you manage your inventory efficiently.</p>
      
      <p>Stanley,</p>

      <p>Chief Relationship Officer, Shedfactory</p>
      <a href="https://shedfactory.co">shedfactory.co</a>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Welcome email sent to:', email);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
}

// Session middleware for admin authentication
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: uri }),
  cookie: { 
    secure: process.env.NODE_ENV === 'production', 
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

// Debug session
app.use((req, res, next) => {
  console.log("Session Data:", req.session);
  next();
});

// Logger configuration
const logger = winston.createLogger({
  level: 'error',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.Console()
  ]
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Uploads directory created:', uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Connect to MongoDB
async function connectToMongo() {
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    console.log('Attempting to connect to MongoDB with URI:', uri.replace(/\/\/.*@/, '//[REDACTED]@'));
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db(dbName);
    console.log('Using database:', dbName);

    // Ensure admin collection exists
    const adminCollection = db.collection('admins');
    const adminCount = await adminCollection.countDocuments();
    if (adminCount === 0) {
      const hashedPassword = await bcrypt.hash('superadmin123', 10);
      await adminCollection.insertOne({
        username: 'superadmin',
        password: hashedPassword,
        role: 'admin',
        logo: '/images/logo.png',
        createdAt: new Date()
      });
      console.log('Initial superadmin account seeded');
    }

    // Ensure inventory collection exists
    const inventoryCollection = db.collection('inventory');
    const count = await inventoryCollection.countDocuments();
    if (count === 0) {
      const initialInventory = [];
      await inventoryCollection.insertMany(initialInventory);
      console.log('Initial inventory seeded');
    }
  } catch (err) {
    console.error('MongoDB connection error:', err.message, err.stack);
    setTimeout(connectToMongo, 5000); // Retry after 5 seconds
  }
}

function formatCurrency(amount) {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Middleware to check if admin is logged in
function isAuthenticated(req, res, next) {
  if (req.session.admin) {
    return next();
  }
  res.redirect('/admin-login');
}

// Middleware to check if user is superadmin
function isSuperAdmin(req, res, next) {
  if (req.session.admin) {
    db.collection('admins').findOne({ username: req.session.admin }, (err, admin) => {
      if (err || !admin || admin.role !== 'superadmin') {
        return res.status(403).send('Access denied. Only super admins can access this page.');
      }
      next();
    });
  } else {
    res.redirect('/admin-login');
  }
}

// Admin Login Routes
app.get('/admin-login', (req, res) => {
  res.render('admin-login', { error: null });
});

app.post('/admin-login', async (req, res) => {
  const { username, password } = req.body;
  const admin = await db.collection('admins').findOne({ username });
  if (admin && await bcrypt.compare(password, admin.password)) {
    req.session.admin = admin.username;
    req.session.adminId = admin._id; // Store admin's _id in session
    console.log('Sign-in successful');
    res.redirect('/update-stock');
  } else {
    res.render('admin-login', { error: 'Invalid username or password' });
  }
});

app.use(async (req, res, next) => {
  if (req.session.admin && req.method === 'POST' && req.path === '/admin-login') {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (admin) {
      await db.collection('login_logs').insertOne({
        adminId: admin._id,
        username: req.session.admin,
        loginTime: new Date(),
      });
    }
  }
  next();
});

// Superadmin Dashboard (Updated)
app.get('/superadmin/dashboard', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const admins = await db.collection('admins').find().toArray();
    
    // Fetch login logs for each admin
    const adminIds = admins.map(admin => admin._id);
    const loginLogs = await db.collection('login_logs')
      .aggregate([
        { $match: { adminId: { $in: adminIds } } },
        { $group: {
            _id: '$adminId',
            lastLogin: { $max: '$loginTime' },
            loginCount: { $sum: 1 }
          }
        }
      ])
      .toArray();

    // Merge login data with admin data
    const enrichedAdmins = admins.map(admin => {
      const loginData = loginLogs.find(log => log._id.toString() === admin._id.toString()) || {};
      return {
        ...admin,
        lastLogin: loginData.lastLogin || null,
        loginCount: loginData.loginCount || 0
      };
    });

    res.render('superadmin-dashboard', { admins: enrichedAdmins });
  } catch (err) {
    console.error('Error fetching admins:', err.message, err.stack);
    res.status(500).send('Internal Server Error');
  }
});

// Admin Registration Routes
app.get('/', (req, res) => {
  res.render('admin-register', { error: null });
});

app.get('/admin-register', (req, res) => {
  res.render('admin-register', { error: null });
});

app.get('/transactions', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const { startDate, endDate } = req.query;
    const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();

    const filter = { adminId: admin._id };
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const transactions = await db.collection('sales').find(filter).toArray();

    // Ensure all transactions have required fields
    const validTransactions = transactions.map(sale => ({
      ...sale,
      totalAmount: sale.totalAmount || 0,
     items: sale.items || []
    }));
    const username = req.session.admin;

    // Log the transactions data for debugging
    console.log('Transactions Data:', transactions);

    res.render('transactions', { transactions: validTransactions, admin, username, inventory });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Mark Transaction as Paid
app.post('/transactions/mark-paid/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });

    // Update the payment status to "Paid"
    await db.collection('sales').updateOne(
      { _id: new ObjectId(saleId), adminId: admin._id },
      { $set: { paymentStatus: 'Paid' } }
    );

    res.redirect('/transactions');
  } catch (error) {
    console.error('Error marking transaction as paid:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/admin-register', upload.single('logo'), async (req, res) => {
  const { businessName, email, currency, username, password } = req.body;
  const logoPath = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    // Check if the username or email already exists
    const existingAdmin = await db.collection('admins').findOne({
      $or: [{ username }, { email }]
    });

    if (existingAdmin) {
      return res.render('admin-register', { error: 'Username or email already exists.' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new admin into the database
    await db.collection('admins').insertOne({
      businessName,
      email,
      currency,
      username,
      password: hashedPassword,
      logo: logoPath,
      role: 'admin', // Default role for new admins
      createdAt: new Date()
    });

    // Send welcome email
    await sendWelcomeEmail(email, username, businessName);

    // Redirect to the login page after successful registration
    res.redirect('/admin-login');
  } catch (error) {
    console.error('Error during registration:', error);
    res.render('admin-register', { error: 'An error occurred during registration. Please try again.' });
  }
});


// Create Admin (Superadmin only)
app.get('/superadmin/create-admin', isAuthenticated, isSuperAdmin, (req, res) => {
  res.render('create-admin', { error: null });
});

app.post('/superadmin/create-admin', upload.single('logo'), async (req, res) => {
  const { username, password, role } = req.body;
  const logoPath = req.file ? `/uploads/${req.file.filename}` : null;

  const existingAdmin = await db.collection('admins').findOne({ username });
  if (existingAdmin) {
    return res.render('create-admin', { error: 'Username already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await db.collection('admins').insertOne({
    username,
    password: hashedPassword,
    role: role || 'superadmin', // Default to 'admin' if role is not provided
    logo: logoPath,
    createdAt: new Date()
  });

  res.redirect('/superadmin/dashboard');
});

// Delete Admin (Superadmin only)
app.post('/superadmin/delete-admin/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
  const adminId = req.params.id;
  await db.collection('admins').deleteOne({ _id: new ObjectId(adminId) });
  res.redirect('/superadmin/dashboard');
});

// Delete Outlet Route
app.post('/delete-outlet/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  await db.collection('outlets').deleteOne({ _id: new ObjectId(outletId) });
  res.redirect('/home');
});

// Update Stock Page
app.get('/update-stock', isAuthenticated, async (req, res) => {
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();
  const username = req.session.admin;
  
  res.render('update-stock', { inventory, admin, username, formatCurrency });
});

// Update Stock Route
app.post("/update-stock", async (req, res) => {
  const { id, stock, cost } = req.body;

  try {
    const objectId = new ObjectId(id);

    const result = await db.collection('inventory').updateOne(
      { _id: objectId },
      { $set: { stock: parseInt(stock), cost: parseFloat(cost) } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send("Item not found");
    }

    res.redirect("/update-stock");

  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).send("Error updating item");
  }
});

// Add Product Route
app.post('/add-product', isAuthenticated, async (req, res) => {
  const { name, stock, cost } = req.body;

  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });

    if (!admin) {
      return res.status(404).send("Admin not found.");
    }

    const result = await db.collection('inventory').insertOne({
      name,
      stock: parseInt(stock),
      cost: parseFloat(cost),
      adminId: admin._id,
      createdAt: new Date()
    });

    if (result.insertedId) {
      console.log("Product added successfully:", result.insertedId);
      res.redirect('/update-stock');
    } else {
      res.status(500).send("Failed to add product.");
    }
  } catch (error) {
    console.error("Error adding product:", error);
    res.status(500).send("Error adding product.");
  }
});

// Create Outlet Route
app.get('/create-outlet', isAuthenticated, async (req, res) => {
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  const username = req.session.admin;
  res.render('create-outlet', { error: null, admin, username });
});

app.get('/profile', isAuthenticated, async (req, res) => {
  try {
    console.log("Session Admin:", req.session.admin);
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    console.log("Admin Data:", admin);

    if (!admin) {
      return res.status(404).send("Admin not found.");
    }

    res.render('profile', {
      username: admin.username,
      businessName: admin.businessName,
      email: admin.email,
      currency: admin.currency,
      logo: admin.logo,
      admin
    });
  } catch (error) {
    console.error("Error fetching profile data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/profile_old", async (req, res) => {
  try {
    const admin = await db.collection("admins").findOne({username: req.session.admin});
    res.render("profile", { admin });
  } catch (error) {
    console.error("Error fetching profile data:", error);
    res.status(500).send("Error loading profile page");
  }
});

app.post('/create-outlet', isAuthenticated, async (req, res) => {
  const { name, location, mobile, username, password } = req.body;
  const admin = await db.collection('admins').findOne({ username: req.session.admin });

  const existingOutlet = await db.collection('outlets').findOne({ username });
  if (existingOutlet) {
    return res.render('create-outlet', { error: 'Username already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await db.collection('outlets').insertOne({
    name,
    location,
    mobile,
    username,
    password: hashedPassword,
    adminId: admin._id,
    inventory: []
  });

  res.redirect('/home');
});

// Dispense to Outlet Route
app.get('/dispense-to-outlet/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  const inventory = await db.collection('inventory').find().toArray();
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  const username = req.session.admin;
  res.render('dispense-to-outlet', { outlet, inventory, admin, username });
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

// Store View Page
app.get('/store-view', isAuthenticated, async (req, res) => {
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();
  const username = req.session.admin;
  res.render('store-view', { inventory, admin, username });
});

app.post('/delete-product', isAuthenticated, async (req, res) => {
  const productId = req.body.id;
  console.log('Product ID to delete:', productId);

  try {
    const objectId = new ObjectId(productId);
    const result = await db.collection('inventory').deleteOne({ _id: objectId });

    if (result.deletedCount === 1) {
      res.redirect('/store-view');
    } else {
      res.status(404).send('Product not found');
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).send('Error deleting product');
  }
});

app.post('/dispense', isAuthenticated, async (req, res) => {
  const { id, quantity } = req.body;
  const qty = parseInt(quantity);

  try {
    const objectId = new ObjectId(id);
    const item = await db.collection('inventory').findOne({ _id: objectId });

    if (item && item.stock >= qty && qty > 0) {
      await db.collection('inventory').updateOne(
        { _id: objectId },
        { $inc: { stock: -qty } }
      );
    }
    res.redirect('/store-view');
  } catch (error) {
    console.error('Error dispensing product:', error);
    res.status(500).send('Error dispensing product');
  }
});

// Outlet Login Routes
app.get('/outlet-login', (req, res) => {
  res.render('outlet-login', { error: null });
});

// Edit Admin (Superadmin only)
app.get('/superadmin/edit-admin/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
  const adminId = req.params.id;
  const admin = await db.collection('admins').findOne({ _id: new ObjectId(adminId) });
  res.render('edit-admin', { admin, error: null });
});

// Update Customer Details
app.post('/update-customer/:customerId', isAuthenticated, async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const { name, phone, email } = req.body;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });

    // Update the customer
    await db.collection('customers').updateOne(
      { _id: new ObjectId(customerId), adminId: admin._id },
      { $set: { name, phone, email } }
    );

    res.redirect('/customers');
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/superadmin/edit-admin/:id', upload.single('logo'), async (req, res) => {
  const adminId = req.params.id;
  const { username, password, role } = req.body;
  const logoPath = req.file ? `/uploads/${req.file.filename}` : null;

  const updateData = { username, role };
  if (password) {
    updateData.password = await bcrypt.hash(password, 10);
  }
  if (logoPath) {
    updateData.logo = logoPath;
  }

  await db.collection('admins').updateOne(
    { _id: new ObjectId(adminId) },
    { $set: updateData }
  );

  res.redirect('/superadmin/dashboard');
});

// Admin Logout Route
app.get('/admin-logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin-login');
});

// Home Route (Filter outlets by adminId)
app.get('/home', isAuthenticated, async (req, res) => {
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  const outlets = await db.collection('outlets').find({ adminId: admin._id }).toArray();
  const username = req.session.admin;
  res.render('home', { outlets, admin, username });
});

app.post('/outlet-login', async (req, res) => {
  const { username, password } = req.body;
  const outlet = await db.collection('outlets').findOne({ username });
  if (outlet && await bcrypt.compare(password, outlet.password)) {
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

app.get('/admin/sales-form', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();
    const username = req.session.admin;

    res.render('admin-sales-form', { inventory, admin, username });
  } catch (error) {
    console.error('Error fetching admin sales form:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/admin/sales-form', isAuthenticated, async (req, res) => {
  const { customerName, phoneNumber, email, items, paymentMethod } = req.body;

  try {
    // Validate required fields
    if (!customerName || !items || !paymentMethod) {
      return res.status(400).send('Customer name, items, and payment method are required.');
    }

    const admin = await db.collection('admins').findOne({ username: req.session.admin });

    // Ensure items and quantities are arrays
    const itemIds = Array.isArray(items.itemId) ? items.itemId : [items.itemId];
    const quantities = Array.isArray(items.quantity) ? items.quantity : [items.quantity];

    if (itemIds.length !== quantities.length) {
      return res.status(400).send('Mismatch between items and quantities.');
    }

    const saleItems = [];
    let totalOrderAmount = 0;

    // Process each item
    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const qty = parseInt(quantities[i]);

      // Validate quantity
      if (isNaN(qty)) {
        return res.status(400).send(`Invalid quantity for item ${itemId}.`);
      }

      // Convert itemId to ObjectId
      let objectId;
      try {
        objectId = new ObjectId(itemId);
      } catch (err) {
        console.error('Invalid ObjectId:', itemId, err.message);
        return res.status(400).send(`Invalid item ID: ${itemId}`);
      }

      // Fetch item from inventory
      const item = await db.collection('inventory').findOne({ _id: objectId, adminId: admin._id });

      if (!item) {
        return res.status(404).send(`Item with ID ${itemId} not found in inventory.`);
      }

      // Validate stock
      if (item.stock < qty || qty <= 0) {
        return res.status(400).send(`Invalid quantity or insufficient stock for ${item.name}.`);
      }

      // Calculate total cost for the item
      const totalCost = item.cost * qty;
      saleItems.push({
        itemId: objectId,
        itemName: item.name,
        quantity: qty,
        unitCost: item.cost,
        totalCost
      });

      // Add to total order amount
      totalOrderAmount += totalCost;
    }

    // Render the confirmation page with admin's currency
    res.render('confirm-transaction', {
      username: req.session.admin,
      admin,
      customerName,
      phoneNumber: phoneNumber || 'N/A',
      email: email || 'N/A',
      saleItems,
      totalOrderAmount,
      paymentMethod,
      currency: admin.currency || '$' , // Default to '$' if currency is not set
      formatCurrency
    });

  } catch (error) {
    console.error('Error processing transaction:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/payment-sales-confirmation/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });

    if (!sale) {
      return res.status(404).send('Sale not found.');
    }

    // Render the payment confirmation page
    res.render('payment-sales-confirmation', {
      sale,
      admin,
      username: req.session.admin
    });
  } catch (error) {
    console.error('Error fetching sale details:', error);
    res.status(500).send('Internal Server Error');
  }
});


app.post('/confirm-sale', isAuthenticated, async (req, res) => {
  const { customerName, phoneNumber, email, saleItems, totalOrderAmount, paymentMethod } = req.body;

  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });

    // Process each item and update inventory stock
    for (const item of saleItems) {
      await db.collection('inventory').updateOne(
        { _id: new ObjectId(item.itemId) },
        { $inc: { stock: -item.quantity } }
      );
    }

    // Create sale object
    const sale = {
      adminId: admin._id,
      customerName,
      phoneNumber: phoneNumber || 'N/A',
      email: email || 'N/A',
      items: saleItems,
      totalAmount: totalOrderAmount || 0,
      paymentMethod: paymentMethod || 'N/A',
      paymentStatus: 'Pending',
      date: new Date()
    };

    // Insert the sale
    const result = await db.collection('sales').insertOne(sale);
    const saleId = result.insertedId;

    // Redirect to receipt download page
    res.redirect(`/receipt/${saleId}`);
  } catch (error) {
    console.error('Error confirming sale:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/receipt/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });

    if (!sale) {
      return res.status(404).send('Sale not found.');
    }

    console.log('Sale Data:', sale);

    const doc = new PDFDocument({ margin: 50 });
    const filename = `receipt-${saleId}.pdf`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    // Footer function (called manually)
    const drawFooter = () => {
      const footerY = doc.page.height - 50;
      doc.moveTo(50, footerY).lineTo(550, footerY).stroke();
      doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, footerY + 10, { align: 'center' });
    };

    // Business details
    doc.fontSize(16).text('Receipt', { align: 'right' });
    doc.moveDown();
    doc.fontSize(14).text(`Business: ${admin.businessName || 'N/A'}`, { align: 'left' });
    doc.text(`Email: ${admin.email || 'N/A'}`, { align: 'left' });
    doc.text(`Date: ${new Date(sale.date).toLocaleDateString()}`, { align: 'left' });
    doc.moveDown();

    // Customer details
    doc.fontSize(12).text('Customer Details:', { underline: true });
    doc.text(`Name: ${sale.customerName || 'N/A'}`);
    doc.text(`Phone: ${sale.phoneNumber || 'N/A'}`);
    doc.text(`Email: ${sale.email || 'N/A'}`);
    doc.moveDown();

    // Table headers
    doc.fontSize(12).text('Items:', { underline: true });
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = [200, 70, 100, 100];
    const rowHeight = 20;

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Item', tableLeft, tableTop, { width: colWidths[0], align: 'left' });
    doc.text('Quantity', tableLeft + colWidths[0], tableTop, { width: colWidths[1], align: 'right' });
    doc.text('Unit Cost', tableLeft + colWidths[0] + colWidths[1], tableTop, { width: colWidths[2], align: 'right' });
    doc.text('Total Cost', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop, { width: colWidths[3], align: 'right' });

    doc.moveTo(tableLeft, tableTop + 15).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), tableTop + 15).stroke();
    doc.font('Helvetica');

    let y = tableTop + rowHeight;

    if (sale.items && sale.items.length > 0) {
      sale.items.forEach(item => {
        const unitCost = parseFloat(item.unitCost) || 0;
        const totalCost = unitCost * (parseInt(item.quantity) || 0);

        doc.text(item.itemName || 'N/A', tableLeft, y, { width: colWidths[0], align: 'left' });
        doc.text((item.quantity || 0).toString(), tableLeft + colWidths[0], y, { width: colWidths[1], align: 'right' });
        doc.text(`${admin.currency} ${unitCost.toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'right' });
        doc.text(`${admin.currency} ${totalCost.toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3], align: 'right' });

        y += rowHeight;

        // Ensure there's space for footer on the page
        if (doc.y + rowHeight > doc.page.height - 100) {
          doc.addPage();
          y = doc.y; // Reset Y position on new page
        }
      });
    } else {
      doc.text('No items found', tableLeft, y, { width: colWidths[0], align: 'left' });
      y += rowHeight;
    }

    // Draw total amount row aligned with items
    doc.moveTo(tableLeft, y + 5).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), y + 5).stroke();
    doc.font('Helvetica-Bold');
    doc.text('Total Amount:', tableLeft + colWidths[0] + colWidths[1] - 50, y + 10, { width: colWidths[2], align: 'right' });
    doc.text(`${admin.currency} ${(parseFloat(sale.totalAmount) || 0).toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y + 10, { width: colWidths[3], align: 'right' });
    doc.font('Helvetica');

    y += rowHeight * 1.5;

    // Payment details aligned to the left
    doc.moveDown(1);
    doc.fontSize(12).text('Payment Details:', { underline: true });
    doc.text(`Method: ${sale.paymentMethod || 'N/A'}`, { align: 'left' });
    doc.text(`Status: ${sale.paymentStatus || 'Pending'}`, { align: 'left' });

    // Add footer manually at the bottom of the page
    if (doc.y < doc.page.height - 100) {
      drawFooter();
    } else {
      doc.addPage();
      drawFooter();
    }

    doc.end();
  } catch (error) {
    console.error('Error generating receipt:', error);
    res.status(500).send('Error generating receipt');
  }
});





app.post('/admin/confirm-sale', isAuthenticated, async (req, res) => {
  const { customerName, phoneNumber, email, itemId, quantity } = req.body;

  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const item = await db.collection('inventory').findOne({ _id: new ObjectId(itemId), adminId: admin._id });
    if (!item) {
      return res.status(404).send("Item not found in inventory.");
    }

    if (item.stock < parseInt(quantity) || parseInt(quantity) <= 0) {
      return res.status(400).send("Invalid quantity or insufficient stock.");
    }

    await db.collection('inventory').updateOne(
      { _id: new ObjectId(itemId) },
      { $inc: { stock: -parseInt(quantity) } }
    );

    const sale = {
      adminId: admin._id,
      customerName,
      phoneNumber,
      email,
      itemId: new ObjectId(itemId),
      itemName: item.name,
      quantity: parseInt(quantity),
      cost: item.cost,
      totalAmount: item.cost * parseInt(quantity),
      date: new Date()
    };

    const result = await db.collection('sales').insertOne(sale);

    if (result.insertedId) {
      res.render('receipt', { sale, admin });
    } else {
      res.status(500).send("Failed to record sale.");
    }
  } catch (error) {
    console.error("Error processing sale:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get('/outlet/:outletId/stock-view', isOutletAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });

  if (!outlet || outlet._id.toString() !== req.session.outletId) {
    return res.redirect('/outlet-login');
  }

  const admin = await db.collection('admins').findOne({ _id: outlet.adminId });

  res.render('outlet-stock-view', { outlet, adminLogo: admin?.logo || '/images/default-logo.png' });
});

// Outlet Sales Form
app.get('/outlet/sales-form', isOutletAuthenticated, async (req, res) => {
  try {
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(req.session.outletId) });
    const inventory = outlet.inventory;
    const admin = await db.collection('admins').findOne({ _id: outlet.adminId });

    res.render('outlet-sales-form', { inventory, outlet, admin });
  } catch (error) {
    console.error('Error fetching outlet sales form:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/outlet/sales-form', isOutletAuthenticated, async (req, res) => {
  const { customerName, phoneNumber, email, itemId, quantity } = req.body;
  const qty = parseInt(quantity);

  try {
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(req.session.outletId) });
    const item = outlet.inventory.find(i => i.id === parseInt(itemId));
    if (!item) {
      return res.status(404).send('Item not found in outlet inventory.');
    }

    if (item.stock < qty || qty <= 0) {
      return res.status(400).send('Invalid quantity or insufficient stock.');
    }

    await db.collection('outlets').updateOne(
      { _id: new ObjectId(req.session.outletId), 'inventory.id': parseInt(itemId) },
      { $inc: { 'inventory.$.stock': -qty } }
    );

    await db.collection('sales').insertOne({
      outletId: outlet._id,
      customerName,
      phoneNumber,
      email,
      itemId: parseInt(itemId),
      itemName: item.name,
      quantity: qty,
      date: new Date()
    });

    res.redirect('/outlet/sales-form');
  } catch (error) {
    console.error('Error processing outlet sale:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Outlet Details Route
app.get('/outlet-details/:outletId', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    
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
    res.render('outlet-details', { outlet, admin });
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
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  res.render('outlet-transactions', { outlet, transactions, admin });
});

// Outlet Customers Route
app.get('/outlet-customers/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  if (!outlet) {
    return res.status(404).send('Outlet not found');
  }
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
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  res.render('outlet-customers', { outlet, customers, admin, formatCurrency });
});


app.get('/invoices', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const customers = await db.collection('customers').find({ adminId: admin._id }).toArray();
    const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();

    // Fetch all sales for the admin
    const sales = await db.collection('sales').find({ adminId: admin._id }).toArray();

    // Ensure totalAmount is a valid number for each sale
    const processedSales = sales.map(sale => ({
      ...sale,
      totalAmount: typeof sale.totalAmount === 'number' ? sale.totalAmount : 0, // Ensure totalAmount is a number
    }));

    res.render('invoices', {
      username: req.session.admin,
      admin,
      sales: processedSales,
      customers,
      inventory,
      formatCurrency // Pass the function to the template
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).send('Internal Server Error');
  }
});




// Create Invoice Form Submission (Updated for Multiple Items)

app.post('/invoices/create', isAuthenticated, async (req, res) => {
  const { customerId, newCustomerName, newCustomerPhone, newCustomerEmail, items, paymentMethod, bankName, bankAccountNumber, accountNumber } = req.body;

  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });

    // Validate required fields
    if (!items || !paymentMethod) {
      return res.status(400).send('Items and payment method are required.');
    }

    let customer;

    // Handle new customer creation
    if (customerId === 'new' && newCustomerName) {
      const newCustomer = {
        adminId: admin._id,
        name: newCustomerName,
        phone: newCustomerPhone || 'N/A',
        email: newCustomerEmail || 'N/A',
        createdAt: new Date()
      };
      const result = await db.collection('customers').insertOne(newCustomer);
      customer = { _id: result.insertedId, ...newCustomer };
    } else if (customerId !== 'new') {
      // Fetch existing customer
      customer = await db.collection('customers').findOne({ _id: new ObjectId(customerId), adminId: admin._id });
    } else {
      return res.status(400).send('Invalid customer details.');
    }

    if (!customer) {
      return res.status(400).send('Customer not found or invalid.');
    }

    // Ensure items and quantities are arrays
    const itemIds = Array.isArray(items.itemId) ? items.itemId : [items.itemId];
    const quantities = Array.isArray(items.quantity) ? items.quantity : [items.quantity];

    if (itemIds.length !== quantities.length) {
      return res.status(400).send('Mismatch between items and quantities.');
    }

    const saleItems = [];
    let totalOrderAmount = 0;

    // Process each item
    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const qty = parseInt(quantities[i]);

      // Validate quantity
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).send(`Invalid quantity for item ${itemId}.`);
      }

      // Convert itemId to ObjectId
      let objectId;
      try {
        objectId = new ObjectId(itemId);
      } catch (err) {
        console.error('Invalid ObjectId:', itemId, err.message);
        return res.status(400).send(`Invalid item ID: ${itemId}`);
      }

      // Fetch item from inventory
      const item = await db.collection('inventory').findOne({ _id: objectId, adminId: admin._id });

      if (!item) {
        return res.status(404).send(`Item with ID ${itemId} not found in inventory.`);
      }

      // Validate stock
      if (item.stock < qty || qty <= 0) {
        return res.status(400).send(`Invalid quantity or insufficient stock for ${item.name}.`);
      }

      // Update inventory stock
      await db.collection('inventory').updateOne(
        { _id: objectId },
        { $inc: { stock: -qty } }
      );

      // Calculate total cost for the item
      const totalCost = item.cost * qty;
      saleItems.push({
        itemId: objectId,
        itemName: item.name,
        quantity: qty,
        unitCost: item.cost,
        totalCost
      });

      // Add to total order amount
      totalOrderAmount += totalCost;
    }

    // Create sale object
    const sale = {
      adminId: admin._id,
      customerId: customer._id,
      customerName: customer.name,
      phoneNumber: customer.phone,
      email: customer.email,
      items: saleItems,
      totalAmount: totalOrderAmount || 0, // Ensure totalAmount is always defined
      paymentMethod: paymentMethod || 'N/A',
      paymentStatus: 'Pending', // Default status
      date: new Date()
    };

    // Add bank details only if payment method is "Bank Transfer"
    if (paymentMethod === 'Bank Transfer') {
      if (!bankName || !bankAccountNumber || !accountNumber) {
        return res.status(400).send('Bank name, bank account number, and account number are required for bank transfers.');
      }
      sale.bankDetails = { bankName, bankAccountNumber, accountNumber };
    }

    // Insert the sale
    const result = await db.collection('sales').insertOne(sale);
    const saleId = result.insertedId;

    // Redirect to invoices page
    res.redirect('/invoices');
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Download Invoice as PDF (Updated for Multiple Items with Table)
app.get('/invoices/download/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });

    if (!sale) return res.status(404).send('Sale not found');

    const doc = new PDFDocument({ margin: 50 });
    const filename = `invoice-${saleId}.pdf`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');

    doc.pipe(res);

    // Footer at the absolute top of the page
    doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, 30, { align: 'center' });
    doc.moveTo(50, 45).lineTo(550, 45).stroke();
    doc.moveDown(2);

    // Add admin logo if available
    if (admin.logo && fs.existsSync(path.join(__dirname, 'public', admin.logo))) {
      doc.image(path.join(__dirname, 'public', admin.logo), 50, 60, { width: 100 });
      doc.moveDown(5);
    }

    doc.fontSize(20).text('Invoice', { align: 'right' });
    doc.moveDown();
    doc.fontSize(12).text(`Business: ${admin.businessName}`, { align: 'left' });
    doc.text(`Email: ${admin.email}`, { align: 'left' });
    doc.text(`Invoice Date: ${new Date(sale.date).toLocaleDateString()}`, { align: 'left' });
    doc.moveDown();

    doc.fontSize(12).text('Customer Details:', { underline: true });
    doc.text(`Name: ${sale.customerName}`);
    doc.text(`Phone: ${sale.phoneNumber || 'N/A'}`);
    doc.text(`Email: ${sale.email || 'N/A'}`);
    doc.moveDown();

    // Sale Items Table
    doc.fontSize(12).text('Sale Details:', { underline: true });
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = [200, 70, 100, 100];
    const rowHeight = 20;

    // Table Headers
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Item', tableLeft, tableTop, { width: colWidths[0], align: 'left' });
    doc.text('Quantity', tableLeft + colWidths[0], tableTop, { width: colWidths[1], align: 'right' });
    doc.text('Unit Cost', tableLeft + colWidths[0] + colWidths[1], tableTop, { width: colWidths[2], align: 'right' });
    doc.text('Total Cost', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop, { width: colWidths[3], align: 'right' });

    doc.moveTo(tableLeft, tableTop + 15).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), tableTop + 15).stroke();
    doc.font('Helvetica');

    let y = tableTop + rowHeight;

    if (sale.items && Array.isArray(sale.items)) {
      sale.items.forEach(item => {
        doc.text(item.itemName || 'N/A', tableLeft, y, { width: colWidths[0], align: 'left' });
        doc.text(String(item.quantity || 0), tableLeft + colWidths[0], y, { width: colWidths[1], align: 'right' });
        doc.text(`${admin.currency} ${(Number(item.unitCost) || 0).toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'right' });
        doc.text(`${admin.currency} ${(Number(item.totalCost) || 0).toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3], align: 'right' });
        y += rowHeight;
      });
    } else {
      doc.text('No items found', tableLeft, y, { width: colWidths[0], align: 'left' });
      y += rowHeight;
    }

    doc.moveTo(tableLeft, y + 5).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), y + 5).stroke();
    doc.font('Helvetica-Bold');
    doc.text('Total Amount:', tableLeft + colWidths[0] + colWidths[1] - 50, y + 10, { width: colWidths[2], align: 'right' });
    doc.text(`${admin.currency} ${(parseFloat(sale.totalAmount) || 0).toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y + 10, { width: colWidths[3], align: 'right' });
    doc.font('Helvetica');

    // Payment Information on the left
    doc.moveDown(2);
    doc.fontSize(12).text('Payment Information:', 50, doc.y, { underline: true });
    doc.text(`Method: ${sale.paymentMethod || 'N/A'}`, 50, doc.y);
    if (sale.bankDetails) {
      doc.text(`Bank Name: ${sale.bankDetails.bankName || 'N/A'}`, 50, doc.y);
      doc.text(`Bank Account Number: ${sale.bankDetails.bankAccountNumber || 'N/A'}`, 50, doc.y);
    }
    doc.text(`Status: ${sale.paymentStatus || 'Pending'}`, 50, doc.y);

    // Generated at centered
    doc.moveDown(2);
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('Error generating PDF');
  }
});


// Mark Invoice as Paid
app.post('/invoices/mark-paid/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const result = await db.collection('sales').updateOne(
      { _id: new ObjectId(saleId), adminId: admin._id },
      { $set: { paymentStatus: 'Paid' } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send('Invoice not found');
    }

    res.redirect('/invoices');
  } catch (error) {
    console.error('Error marking invoice as paid:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Customers Page Route
app.get('/customers', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const customers = await db.collection('customers').find({ adminId: admin._id }).toArray();
    const username = req.session.admin;

    // Render the customers page with the fetched data
    res.render('customers', { customers, admin, username });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).send('Internal Server Error');
  }
});

// View Customer Details
app.get('/customer-details/:customerId', isAuthenticated, async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const customer = await db.collection('customers').findOne({ _id: new ObjectId(customerId), adminId: admin._id });

    if (!customer) {
      return res.status(404).send('Customer not found.');
    }

    res.render('customer-details', { customer, admin, username: req.session.admin });
  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Edit Customer Details
app.get('/edit-customer/:customerId', isAuthenticated, async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const customer = await db.collection('customers').findOne({ _id: new ObjectId(customerId), adminId: admin._id });

    if (!customer) {
      return res.status(404).send('Customer not found.');
    }

    res.render('edit-customer', { customer, admin, username: req.session.admin });
  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Delete Customer
app.post('/delete-customer/:customerId', isAuthenticated, async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });

    // Delete the customer
    await db.collection('customers').deleteOne({ _id: new ObjectId(customerId), adminId: admin._id });

    res.redirect('/customers');
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).send('Internal Server Error');
  }
});



// Health Check Route
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

// Start server and connect to MongoDB
async function startServer() {
  await connectToMongo();
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();