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
const crypto = require('crypto');
const nodemailer = require('nodemailer');

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

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: { rejectUnauthorized: false }
});

transporter.verify((error, success) => {
  if (error) console.error('SMTP connection error:', error);
  else console.log('SMTP connection successful:', success);
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
      <p>Say hello to Shed, the ultimate small and medium business solution designed to simplify your business operations 
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

// Session middleware
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
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
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
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db(dbName);

    const adminCollection = db.collection('admins');
    if (await adminCollection.countDocuments() === 0) {
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

    const inventoryCollection = db.collection('inventory');
    if (await inventoryCollection.countDocuments() === 0) {
      await inventoryCollection.insertMany([]);
      console.log('Initial inventory seeded');
    }
  } catch (err) {
    console.error('MongoDB connection error:', err.message, err.stack);
    setTimeout(connectToMongo, 5000);
  }
}

function formatCurrency(amount) {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.session.admin) return next();
  res.redirect('/admin-login');
}

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

function isAffiliateAuthenticated(req, res, next) {
  if (req.session.affiliate) return next();
  res.redirect('/referrals/login');
}

// Referral Routes
app.get('/referrals/signup', (req, res) => {
  res.render('referrals-signup');
});

app.post('/referrals/signup', async (req, res) => {
  try {
    const { email, country, password } = req.body;
    const existingAffiliate = await db.collection('affiliates').findOne({ email });
    if (existingAffiliate) return res.status(400).send('Email already registered as an affiliate.');

    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = crypto.randomBytes(8).toString('hex');
    const affiliate = {
      email,
      country,
      password: hashedPassword,
      referralCode,
      createdAt: new Date()
    };

    const result = await db.collection('affiliates').insertOne(affiliate);
    req.session.affiliate = result.insertedId.toString();
    res.redirect('/referrals/dashboard');
  } catch (error) {
    console.error('Error signing up affiliate:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/referrals/login', (req, res) => {
  res.render('referrals-login');
});

app.post('/referrals/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const affiliate = await db.collection('affiliates').findOne({ email });
    if (!affiliate || !(await bcrypt.compare(password, affiliate.password))) {
      return res.status(401).send('Invalid email or password.');
    }

    req.session.affiliate = affiliate._id.toString();
    res.redirect('/referrals/dashboard');
  } catch (error) {
    console.error('Error logging in affiliate:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/referrals/dashboard', isAffiliateAuthenticated, async (req, res) => {
  try {
    const affiliate = await db.collection('affiliates').findOne({ _id: new ObjectId(req.session.affiliate) });
    const referralLink = `http://localhost:3000/admin-register?ref=${affiliate.referralCode}`; // Updated to admin-register
    const activities = await db.collection('referral_activities')
      .find({ affiliateId: affiliate._id })
      .sort({ date: -1 })
      .toArray();

    res.render('referrals-dashboard', { affiliate, referralLink, activities });
  } catch (error) {
    console.error('Error loading affiliate dashboard:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/referrals/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/referrals/login'));
});

// Track Referral Clicks on /admin-register
app.get('/admin-register', async (req, res) => {
  const referralCode = req.query.ref;
  if (referralCode) {
    const referrer = await db.collection('affiliates').findOne({ referralCode });
    if (referrer) {
      await db.collection('referral_activities').insertOne({
        affiliateId: referrer._id,
        action: 'Referral Link Clicked',
        date: new Date()
      });
    }
  }
  res.render('admin-register', { error: null });
});

// Track Referral Signups on /admin-register
app.post('/admin-register', upload.single('logo'), async (req, res) => {
  const { businessName, email, currency, username, password } = req.body;
  const logoPath = req.file ? `/uploads/${req.file.filename}` : null;
  const referralCode = req.query.ref;

  try {
    const existingAdmin = await db.collection('admins').findOne({ $or: [{ username }, { email }] });
    if (existingAdmin) {
      return res.render('admin-register', { error: 'Username or email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = {
      businessName,
      email,
      currency,
      username,
      password: hashedPassword,
      logo: logoPath,
      role: 'admin',
      createdAt: new Date()
    };

    const result = await db.collection('admins').insertOne(newAdmin);
    await sendWelcomeEmail(email, username, businessName);

    // Track referral signup
    if (referralCode) {
      const referrer = await db.collection('affiliates').findOne({ referralCode });
      if (referrer) {
        await db.collection('referral_activities').insertOne({
          affiliateId: referrer._id,
          action: 'New Admin Signup',
          userEmail: email,
          date: new Date()
        });
      }
    }

    res.redirect('/admin-login');
  } catch (error) {
    console.error('Error during registration:', error);
    res.render('admin-register', { error: 'An error occurred during registration. Please try again.' });
  }
});

// Admin Login Routes
app.get('/admin-login', (req, res) => {
  res.render('admin-login', { error: null });
});

app.post('/admin-login', async (req, res) => {
  const { username, password } = req.body;
  const admin = await db.collection('admins').findOne({ username });
  if (admin && await bcrypt.compare(password, admin.password)) {
    req.session.admin = admin.username;
    req.session.adminId = admin._id;
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

// Superadmin Dashboard
app.get('/superadmin/dashboard', isAuthenticated, async (req, res) => {
  try {
    const admins = await db.collection('admins').find().toArray();
    const adminIds = admins.map(admin => admin._id);
    const loginLogs = await db.collection('login_logs')
      .aggregate([
        { $match: { adminId: { $in: adminIds } } },
        { $group: { _id: '$adminId', lastLogin: { $max: '$loginTime' }, loginCount: { $sum: 1 } } }
      ])
      .toArray();

    const enrichedAdmins = admins.map(admin => {
      const loginData = loginLogs.find(log => log._id.toString() === admin._id.toString()) || {};
      return { ...admin, lastLogin: loginData.lastLogin || null, loginCount: loginData.loginCount || 0 };
    });

    res.render('superadmin-dashboard', { admins: enrichedAdmins });
  } catch (err) {
    console.error('Error fetching admins:', err.message, err.stack);
    res.status(500).send('Internal Server Error');
  }
});

// Password Reset Routes
async function sendPasswordResetEmail(email, username, resetToken) {
  const resetLink = `http://localhost:3000/reset-password/${resetToken}`;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset Request - Shed',
    html: `
      <h1>Password Reset Request</h1>
      <p>Hello, ${username},</p>
      <p>We received a request to reset your password for Shed. Click the link below to reset your password:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>This link will expire in 1 hour. If you didn’t request this, please ignore this email.</p>
      <p>Best regards,</p>
      <p>Stanley, Chief Relationship Officer, Shedfactory</p>
      <a href="https://shedfactory.co">shedfactory.co</a>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', email);
  } catch (error) {
    console.error('Error sending password reset email:', error);
  }
}

app.post('/superadmin/update-admin/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const adminId = req.params.id;
    const { businessName, currency, role } = req.body;
    await db.collection('admins').updateOne(
      { _id: new ObjectId(adminId) },
      { $set: { businessName: businessName || null, currency: currency || null, role } }
    );
    res.redirect('/superadmin/dashboard');
  } catch (error) {
    console.error('Error updating admin:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/superadmin/reset-password/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const adminId = req.params.id;
    const admin = await db.collection('admins').findOne({ _id: new ObjectId(adminId) });
    if (!admin || !admin.email) return res.status(400).send('Admin not found or no email associated.');

    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000;
    await db.collection('admins').updateOne(
      { _id: new ObjectId(adminId) },
      { $set: { resetToken, resetTokenExpiry } }
    );
    await sendPasswordResetEmail(admin.email, admin.username, resetToken);
    res.redirect('/superadmin/dashboard');
  } catch (error) {
    console.error('Error initiating password reset:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/reset-password/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const admin = await db.collection('admins').findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() }
    });
    if (!admin) return res.status(400).send('Invalid or expired reset token.');
    res.render('reset-password', { token });
  } catch (error) {
    console.error('Error loading reset password page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/reset-password/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const { password } = req.body;
    const admin = await db.collection('admins').findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() }
    });
    if (!admin) return res.status(400).send('Invalid or expired reset token.');

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.collection('admins').updateOne(
      { _id: admin._id },
      { $set: { password: hashedPassword }, $unset: { resetToken: '', resetTokenExpiry: '' } }
    );
    res.redirect('/admin-login');
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Other Routes
app.get('/', (req, res) => res.render('admin-register', { error: null }));

app.get('/transactions', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const { startDate, endDate } = req.query;
    const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();
    const filter = { adminId: admin._id };
    if (startDate && endDate) filter.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    const transactions = await db.collection('sales').find(filter).toArray();
    const validTransactions = transactions.map(sale => ({
      ...sale,
      totalAmount: sale.totalAmount || 0,
      items: sale.items || []
    }));
    const username = req.session.admin;
    res.render('transactions', { transactions: validTransactions, admin, username, inventory });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/transactions/mark-paid/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
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

app.get('/superadmin/create-admin', isAuthenticated, isSuperAdmin, (req, res) => {
  res.render('create-admin', { error: null });
});

app.post('/superadmin/create-admin', upload.single('logo'), async (req, res) => {
  const { username, password, role } = req.body;
  const logoPath = req.file ? `/uploads/${req.file.filename}` : null;
  const existingAdmin = await db.collection('admins').findOne({ username });
  if (existingAdmin) return res.render('create-admin', { error: 'Username already exists' });

  const hashedPassword = await bcrypt.hash(password, 10);
  await db.collection('admins').insertOne({
    username,
    password: hashedPassword,
    role: role || 'superadmin',
    logo: logoPath,
    createdAt: new Date()
  });
  res.redirect('/superadmin/dashboard');
});

app.post('/superadmin/delete-admin/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
  const adminId = req.params.id;
  await db.collection('admins').deleteOne({ _id: new ObjectId(adminId) });
  res.redirect('/superadmin/dashboard');
});

app.post('/delete-outlet/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  await db.collection('outlets').deleteOne({ _id: new ObjectId(outletId) });
  res.redirect('/home');
});

app.get('/update-stock', isAuthenticated, async (req, res) => {
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();
  const username = req.session.admin;
  res.render('update-stock', { inventory, admin, username, formatCurrency });
});

app.post('/update-stock', async (req, res) => {
  const { id, stock, cost } = req.body;
  try {
    const objectId = new ObjectId(id);
    const result = await db.collection('inventory').updateOne(
      { _id: objectId },
      { $set: { stock: parseInt(stock), cost: parseFloat(cost) } }
    );
    if (result.matchedCount === 0) return res.status(404).send('Item not found');
    res.redirect('/update-stock');
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).send('Error updating item');
  }
});

app.post('/add-product', isAuthenticated, async (req, res) => {
  const { name, stock, cost } = req.body;
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) return res.status(404).send('Admin not found.');
    await db.collection('inventory').insertOne({
      name,
      stock: parseInt(stock),
      cost: parseFloat(cost),
      adminId: admin._id,
      createdAt: new Date()
    });
    res.redirect('/update-stock');
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).send('Error adding product.');
  }
});

app.get('/create-outlet', isAuthenticated, async (req, res) => {
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  const username = req.session.admin;
  res.render('create-outlet', { error: null, admin, username });
});

app.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) return res.status(404).send('Admin not found.');
    res.render('profile', {
      username: admin.username,
      businessName: admin.businessName,
      email: admin.email,
      currency: admin.currency,
      logo: admin.logo,
      admin
    });
  } catch (error) {
    console.error('Error fetching profile data:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/create-outlet', isAuthenticated, async (req, res) => {
  const { name, location, mobile, username, password } = req.body;
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  const existingOutlet = await db.collection('outlets').findOne({ username });
  if (existingOutlet) return res.render('create-outlet', { error: 'Username already exists', admin, username: req.session.admin });

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
  const item = await db.collection('inventory').findOne({ _id: new ObjectId(itemId) });
  if (item && item.stock >= qty && qty > 0) {
    await db.collection('inventory').updateOne(
      { _id: new ObjectId(itemId) },
      { $inc: { stock: -qty } }
    );
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
    const outletItem = outlet.inventory.find(i => i.id === itemId);
    if (outletItem) {
      await db.collection('outlets').updateOne(
        { _id: new ObjectId(outletId), 'inventory.id': itemId },
        { $inc: { 'inventory.$.stock': qty } }
      );
    } else {
      await db.collection('outlets').updateOne(
        { _id: new ObjectId(outletId) },
        { $push: { inventory: { id: itemId, name: item.name, stock: qty } } }
      );
    }
  }
  res.redirect(`/dispense-to-outlet/${outletId}`);
});

app.get('/store-view', isAuthenticated, async (req, res) => {
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();
  const username = req.session.admin;
  res.render('store-view', { inventory, admin, username });
});

app.post('/delete-product', isAuthenticated, async (req, res) => {
  const productId = req.body.id;
  try {
    const objectId = new ObjectId(productId);
    const result = await db.collection('inventory').deleteOne({ _id: objectId });
    if (result.deletedCount === 1) res.redirect('/store-view');
    else res.status(404).send('Product not found');
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

app.get('/outlet-login', (req, res) => {
  res.render('outlet-login', { error: null });
});

app.get('/superadmin/edit-admin/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
  const adminId = req.params.id;
  const admin = await db.collection('admins').findOne({ _id: new ObjectId(adminId) });
  res.render('edit-admin', { admin, error: null });
});

app.post('/update-customer/:customerId', isAuthenticated, async (req, res) => {
  try {
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
});

app.post('/superadmin/edit-admin/:id', upload.single('logo'), async (req, res) => {
  const adminId = req.params.id;
  const { username, password, role } = req.body;
  const logoPath = req.file ? `/uploads/${req.file.filename}` : null;
  const updateData = { username, role };
  if (password) updateData.password = await bcrypt.hash(password, 10);
  if (logoPath) updateData.logo = logoPath;
  await db.collection('admins').updateOne(
    { _id: new ObjectId(adminId) },
    { $set: updateData }
  );
  res.redirect('/superadmin/dashboard');
});

app.get('/admin-logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin-login'));
});

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

function isOutletAuthenticated(req, res, next) {
  if (req.session.outletId) return next();
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
    if (!customerName || !items || !paymentMethod) return res.status(400).send('Customer name, items, and payment method are required.');
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const itemIds = Array.isArray(items.itemId) ? items.itemId : [items.itemId];
    const quantities = Array.isArray(items.quantity) ? items.quantity : [items.quantity];
    if (itemIds.length !== quantities.length) return res.status(400).send('Mismatch between items and quantities.');

    const saleItems = [];
    let totalOrderAmount = 0;
    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const qty = parseInt(quantities[i]);
      if (isNaN(qty)) return res.status(400).send(`Invalid quantity for item ${itemId}.`);
      const objectId = new ObjectId(itemId);
      const item = await db.collection('inventory').findOne({ _id: objectId, adminId: admin._id });
      if (!item) return res.status(404).send(`Item with ID ${itemId} not found in inventory.`);
      if (item.stock < qty || qty <= 0) return res.status(400).send(`Invalid quantity or insufficient stock for ${item.name}.`);
      const totalCost = item.cost * qty;
      saleItems.push({ itemId: objectId, itemName: item.name, quantity: qty, unitCost: item.cost, totalCost });
      totalOrderAmount += totalCost;
    }
    res.render('confirm-transaction', {
      username: req.session.admin,
      admin,
      customerName,
      phoneNumber: phoneNumber || 'N/A',
      email: email || 'N/A',
      saleItems,
      totalOrderAmount,
      paymentMethod,
      currency: admin.currency || '$',
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
    if (!sale) return res.status(404).send('Sale not found.');
    res.render('payment-sales-confirmation', { sale, admin, username: req.session.admin });
  } catch (error) {
    console.error('Error fetching sale details:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/confirm-sale', isAuthenticated, async (req, res) => {
  const { customerName, phoneNumber, email, saleItems, totalOrderAmount, paymentMethod } = req.body;
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    for (const item of saleItems) {
      await db.collection('inventory').updateOne(
        { _id: new ObjectId(item.itemId) },
        { $inc: { stock: -item.quantity } }
      );
    }
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
    const result = await db.collection('sales').insertOne(sale);
    // Redirect to a success page instead of directly to receipt
    res.redirect(`/sale-success/${result.insertedId}`);
  } catch (error) {
    console.error('Error confirming sale:', error);
    res.status(500).send('Internal Server Error');
  }
});

// New route for the success page
app.get('/sale-success/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) return res.status(404).send('Sale not found.');
    res.render('sale-success', { sale, admin, username: req.session.admin });
  } catch (error) {
    console.error('Error loading sale success page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// New route to send receipt via email
app.post('/send-receipt-email/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const { email } = req.body;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) return res.status(404).send('Sale not found.');

    // Generate PDF receipt as a buffer
    const doc = new PDFDocument({ margin: 50 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', async () => {
      const pdfData = Buffer.concat(buffers);

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Receipt for Your Purchase from ${admin.businessName || 'Shed'}`,
        html: `
          <h1>Thank You for Your Purchase!</h1>
          <p>Dear ${sale.customerName || 'Customer'},</p>
          <p>Please find your receipt attached for your recent purchase.</p>
          <p>Business: ${admin.businessName || 'N/A'}</p>
          <p>Date: ${new Date(sale.date).toLocaleDateString()}</p>
          <p>Total Amount: ${admin.currency || '$'}${parseFloat(sale.totalAmount || 0).toFixed(2)}</p>
          <p>Best regards,</p>
          <p>Stanley, Chief Relationship Officer, Shedfactory</p>
          <a href="https://shedfactory.co">shedfactory.co</a>
        `,
        attachments: [
          {
            filename: `receipt-${saleId}.pdf`,
            content: pdfData,
            contentType: 'application/pdf'
          }
        ]
      };

      await transporter.sendMail(mailOptions);
      console.log('Receipt email sent to:', email);
      res.redirect(`/sale-success/${saleId}`);
    });

    // Generate receipt content (same as /receipt/:saleId)
    doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, 30, { align: 'center' });
    doc.moveTo(50, 45).lineTo(550, 45).stroke();
    doc.moveDown(2);

    if (admin.logo && fs.existsSync(path.join(__dirname, 'public', admin.logo))) {
      doc.image(path.join(__dirname, 'public', admin.logo), 50, doc.y, { width: 100 });
      doc.moveDown(5);
    }

    doc.fontSize(16).text('Receipt', { align: 'right' });
    doc.moveDown();
    doc.fontSize(14).text(`Business: ${admin.businessName || 'N/A'}`, { align: 'left' });
    doc.text(`Email: ${admin.email || 'N/A'}`, { align: 'left' });
    doc.text(`Date: ${new Date(sale.date).toLocaleDateString()}`, { align: 'left' });
    doc.moveDown();

    doc.fontSize(12).text('Customer Details:', { underline: true });
    doc.text(`Name: ${sale.customerName || 'N/A'}`);
    doc.text(`Phone: ${sale.phoneNumber || 'N/A'}`);
    doc.text(`Email: ${sale.email || 'N/A'}`);
    doc.moveDown();

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

    y += rowHeight * 1.5;

    doc.moveDown(1);
    doc.fontSize(12).text('Payment Details:', { underline: true });
    doc.text(`Method: ${sale.paymentMethod || 'N/A'}`, { align: 'left' });
    doc.text(`Status: ${sale.paymentStatus || 'Pending'}`, { align: 'left' });

    const footerY = doc.page.height - 50;
    doc.moveTo(50, footerY).lineTo(550, footerY).stroke();
    doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, footerY + 10, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error sending receipt email:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/receipt/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) return res.status(404).send('Sale not found.');

    const doc = new PDFDocument({ margin: 50 });
    const filename = `receipt-${saleId}.pdf`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    // Define drawFooter function within this scope
    const drawFooter = () => {
      const footerY = doc.page.height - 50;
      doc.moveTo(50, footerY).lineTo(550, footerY).stroke();
      doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, footerY + 10, { align: 'center' });
    };

    // Add "Shed: Inventory, Invoices and More" at the top
    doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, 30, { align: 'center' });
    doc.moveTo(50, 45).lineTo(550, 45).stroke();
    doc.moveDown(2);

    // Add logo if it exists
    if (admin.logo && fs.existsSync(path.join(__dirname, 'public', admin.logo))) {
      doc.image(path.join(__dirname, 'public', admin.logo), 50, doc.y, { width: 100 });
      doc.moveDown(5);
    }

    doc.fontSize(16).text('Receipt', { align: 'right' });
    doc.moveDown(3);
    doc.fontSize(14).text(`Business: ${admin.businessName || 'N/A'}`, { align: 'left' });
    doc.text(`Email: ${admin.email || 'N/A'}`, { align: 'left' });
    doc.text(`Date: ${new Date(sale.date).toLocaleDateString()}`, { align: 'left' });
    doc.moveDown();

    doc.fontSize(12).text('Customer Details:', { underline: true });
    doc.text(`Name: ${sale.customerName || 'N/A'}`);
    doc.text(`Phone: ${sale.phoneNumber || 'N/A'}`);
    doc.text(`Email: ${sale.email || 'N/A'}`);
    doc.moveDown();

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
        doc.text(`${admin.currency || '$'} ${formatCurrency(unitCost)}`, tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'right' });
        doc.text(`${admin.currency || '$'} ${formatCurrency(totalCost)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3], align: 'right' });
        y += rowHeight;
        if (doc.y + rowHeight > doc.page.height - 100) {
          doc.addPage();
          y = doc.y;
        }
      });
    } else {
      doc.text('No items found', tableLeft, y, { width: colWidths[0], align: 'left' });
      y += rowHeight;
    }

    doc.moveTo(tableLeft, y + 5).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), y + 5).stroke();
    doc.font('Helvetica-Bold');
    doc.text('Total Amount:', tableLeft + colWidths[0] + colWidths[1] - 50, y + 10, { width: colWidths[2], align: 'right' });
    doc.text(`${admin.currency || '$'} ${formatCurrency(parseFloat(sale.totalAmount) || 0)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y + 10, { width: colWidths[3], align: 'right' });
    doc.font('Helvetica');

    y += rowHeight * 1.5;

    doc.moveDown(1);
    doc.fontSize(12).text('Payment Details:', { underline: true });
    doc.text(`Method: ${sale.paymentMethod || 'N/A'}`, { align: 'left' });
    doc.text(`Status: ${sale.paymentStatus || 'Pending'}`, { align: 'left' });

    if (doc.y < doc.page.height - 100) drawFooter();
    else {
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
    if (!item) return res.status(404).send('Item not found in inventory.');
    if (item.stock < parseInt(quantity) || parseInt(quantity) <= 0) return res.status(400).send('Invalid quantity or insufficient stock.');

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
    if (result.insertedId) res.render('receipt', { sale, admin });
    else res.status(500).send('Failed to record sale.');
  } catch (error) {
    console.error('Error processing sale:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/send-receipt-email/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const { email } = req.body;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) return res.status(404).send('Sale not found.');

    // Generate PDF receipt as a buffer
    const doc = new PDFDocument({ margin: 50 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', async () => {
      const pdfData = Buffer.concat(buffers);

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Receipt for Your Purchase from ${admin.businessName || 'Shed'}`,
        html: `
          <h1>Thank You for Your Purchase!</h1>
          <p>Dear ${sale.customerName || 'Customer'},</p>
          <p>Please find your receipt attached for your recent purchase.</p>
          <p>Business: ${admin.businessName || 'N/A'}</p>
          <p>Date: ${new Date(sale.date).toLocaleDateString()}</p>
          <p>Total Amount: ${admin.currency || '$'}${parseFloat(sale.totalAmount || 0).toFixed(2)}</p>
          <p>Best regards,</p>
          <p>Stanley, Chief Relationship Officer, Shedfactory</p>
          <a href="https://shedfactory.co">shedfactory.co</a>
        `,
        attachments: [
          {
            filename: `receipt-${saleId}.pdf`,
            content: pdfData,
            contentType: 'application/pdf'
          }
        ]
      };

      await transporter.sendMail(mailOptions);
      console.log('Receipt email sent to:', email);
      res.redirect(`/sale-success/${saleId}`);
    });

    // Define drawFooter function within this scope
    const drawFooter = () => {
      const footerY = doc.page.height - 50;
      doc.moveTo(50, footerY).lineTo(550, footerY).stroke();
      doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, footerY + 10, { align: 'center' });
    };

    // Generate receipt content
    doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, 30, { align: 'center' });
    doc.moveTo(50, 45).lineTo(550, 45).stroke();
    doc.moveDown(2);

    if (admin.logo && fs.existsSync(path.join(__dirname, 'public', admin.logo))) {
      doc.image(path.join(__dirname, 'public', admin.logo), 50, doc.y, { width: 100 });
      doc.moveDown(5);
    }

    doc.fontSize(16).text('Receipt', { align: 'right' });
    doc.moveDown();
    doc.fontSize(14).text(`Business: ${admin.businessName || 'N/A'}`, { align: 'left' });
    doc.text(`Email: ${admin.email || 'N/A'}`, { align: 'left' });
    doc.text(`Date: ${new Date(sale.date).toLocaleDateString()}`, { align: 'left' });
    doc.moveDown();

    doc.fontSize(12).text('Customer Details:', { underline: true });
    doc.text(`Name: ${sale.customerName || 'N/A'}`);
    doc.text(`Phone: ${sale.phoneNumber || 'N/A'}`);
    doc.text(`Email: ${sale.email || 'N/A'}`);
    doc.moveDown();

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
        if (doc.y + rowHeight > doc.page.height - 100) {
          doc.addPage();
          y = doc.y;
        }
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

    y += rowHeight * 1.5;

    doc.moveDown(1);
    doc.fontSize(12).text('Payment Details:', { underline: true });
    doc.text(`Method: ${sale.paymentMethod || 'N/A'}`, { align: 'left' });
    doc.text(`Status: ${sale.paymentStatus || 'Pending'}`, { align: 'left' });

    if (doc.y < doc.page.height - 100) drawFooter();
    else {
      doc.addPage();
      drawFooter();
    }

    doc.end();
  } catch (error) {
    console.error('Error sending receipt email:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/outlet/:outletId/stock-view', isOutletAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  if (!outlet || outlet._id.toString() !== req.session.outletId) return res.redirect('/outlet-login');
  const admin = await db.collection('admins').findOne({ _id: outlet.adminId });
  res.render('outlet-stock-view', { outlet, adminLogo: admin?.logo || '/images/default-logo.png' });
});

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
    const item = outlet.inventory.find(i => i.id === itemId);
    if (!item) return res.status(404).send('Item not found in outlet inventory.');
    if (item.stock < qty || qty <= 0) return res.status(400).send('Invalid quantity or insufficient stock.');

    await db.collection('outlets').updateOne(
      { _id: new ObjectId(req.session.outletId), 'inventory.id': itemId },
      { $inc: { 'inventory.$.stock': -qty } }
    );

    await db.collection('sales').insertOne({
      outletId: outlet._id,
      customerName,
      phoneNumber,
      email,
      itemId: itemId,
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

app.get('/outlet-details/:outletId', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const outletId = req.params.outletId;
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
    if (!outlet) return res.status(404).send('Outlet not found');
    res.render('outlet-details', { outlet, admin });
  } catch (err) {
    console.error('Error in /outlet-details/:outletId:', err.message, err.stack);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/outlet-transactions/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  if (!outlet) return res.status(404).send('Outlet not found');
  const transactions = await db.collection('sales').find({ outletId: new ObjectId(outletId) }).toArray();
  const admin = await db.collection('admins').findOne({ username: req.session.admin });
  res.render('outlet-transactions', { outlet, transactions, admin });
});

app.get('/outlet-customers/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  if (!outlet) return res.status(404).send('Outlet not found');
  const sales = await db.collection('sales').find({ outletId: new ObjectId(outletId) }).toArray();
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
    const sales = await db.collection('sales').find({ adminId: admin._id }).toArray();
    const processedSales = sales.map(sale => ({
      ...sale,
      totalAmount: typeof sale.totalAmount === 'number' ? sale.totalAmount : 0
    }));

    // Retrieve error and form data from session (if any)
    const error = req.session.error || null;
    const formData = req.session.formData || {};
    delete req.session.error; // Clear after retrieving
    delete req.session.formData; // Clear after retrieving

    res.render('invoices', {
      username: req.session.admin,
      admin,
      sales: processedSales,
      customers,
      inventory,
      formatCurrency,
      error,
      formData
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/invoices/create', isAuthenticated, async (req, res) => {
  const { customerId, newCustomerName, newCustomerPhone, newCustomerEmail, items, paymentMethod, bankName, bankAccountNumber, accountNumber } = req.body;
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!items || !paymentMethod) {
      req.session.error = 'Items and payment method are required.';
      req.session.formData = req.body;
      await new Promise((resolve) => req.session.save(resolve));
      return res.redirect('/invoices');
    }

    let customer;
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
      customer = await db.collection('customers').findOne({ _id: new ObjectId(customerId), adminId: admin._id });
      if (!customer) {
        req.session.error = 'Customer not found or invalid.';
        req.session.formData = req.body;
        await new Promise((resolve) => req.session.save(resolve));
        return res.redirect('/invoices');
      }
    } else {
      req.session.error = 'Invalid customer details.';
      req.session.formData = req.body;
      await new Promise((resolve) => req.session.save(resolve));
      return res.redirect('/invoices');
    }

    const itemIds = Array.isArray(items.itemId) ? items.itemId : [items.itemId];
    const quantities = Array.isArray(items.quantity) ? items.quantity : [items.quantity];
    const newProductNames = Array.isArray(items.newProductName) ? items.newProductName : [items.newProductName].filter(Boolean);
    const newProductCosts = Array.isArray(items.newProductCost) ? items.newProductCost : [items.newProductCost].filter(Boolean);
    const newProductStocks = Array.isArray(items.newProductStock) ? items.newProductStock : [items.newProductStock].filter(Boolean);

    if (itemIds.length !== quantities.length) {
      req.session.error = 'Mismatch between items and quantities.';
      req.session.formData = req.body;
      await new Promise((resolve) => req.session.save(resolve));
      return res.redirect('/invoices');
    }

    const saleItems = [];
    let totalOrderAmount = 0;
    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const qty = parseInt(quantities[i]);
      if (isNaN(qty) || qty <= 0) {
        req.session.error = `Invalid quantity for item ${itemId}.`;
        req.session.formData = req.body;
        await new Promise((resolve) => req.session.save(resolve));
        return res.redirect('/invoices');
      }

      let item;
      if (itemId === 'new' && newProductNames[i]) {
        const cost = parseFloat(newProductCosts[i]) || 0;
        const stock = parseInt(newProductStocks[i]) || 0;
        if (cost <= 0 || stock < qty) {
          req.session.error = `Invalid cost or insufficient stock for new product "${newProductNames[i]}".`;
          req.session.formData = req.body;
          await new Promise((resolve) => req.session.save(resolve));
          return res.redirect('/invoices');
        }
        item = {
          adminId: admin._id,
          name: newProductNames[i],
          cost: cost,
          stock: stock,
          createdAt: new Date()
        };
        const result = await db.collection('inventory').insertOne(item);
        item._id = result.insertedId;
      } else {
        const objectId = new ObjectId(itemId);
        item = await db.collection('inventory').findOne({ _id: objectId, adminId: admin._id });
        if (!item) {
          req.session.error = `Item with ID ${itemId} not found in inventory.`;
          req.session.formData = req.body;
          await new Promise((resolve) => req.session.save(resolve));
          return res.redirect('/invoices');
        }
        if (item.stock < qty) {
          req.session.error = `Insufficient stock for ${item.name}. Only ${item.stock} available.`;
          req.session.formData = req.body;
          await new Promise((resolve) => req.session.save(resolve));
          return res.redirect('/invoices');
        }
        await db.collection('inventory').updateOne(
          { _id: objectId },
          { $inc: { stock: -qty } }
        );
      }

      const totalCost = item.cost * qty;
      saleItems.push({ itemId: item._id, itemName: item.name, quantity: qty, unitCost: item.cost, totalCost });
      totalOrderAmount += totalCost;
    }

    const sale = {
      adminId: admin._id,
      customerId: customer._id,
      customerName: customer.name,
      phoneNumber: customer.phone,
      email: customer.email,
      items: saleItems,
      totalAmount: totalOrderAmount || 0,
      paymentMethod: paymentMethod || 'N/A',
      paymentStatus: 'Pending',
      date: new Date()
    };

    if (paymentMethod === 'Bank Transfer') {
      if (!bankName || !bankAccountNumber || !accountNumber) {
        req.session.error = 'Bank details required for bank transfers.';
        req.session.formData = req.body;
        await new Promise((resolve) => req.session.save(resolve));
        return res.redirect('/invoices');
      }
      sale.bankDetails = { bankName, bankAccountNumber, accountNumber };
    }

    await db.collection('sales').insertOne(sale);
    res.redirect('/invoices');
  } catch (error) {
    console.error('Error creating invoice:', error);
    req.session.error = 'An unexpected error occurred. Please try again.';
    req.session.formData = req.body;
    await new Promise((resolve) => req.session.save(resolve));
    res.redirect('/invoices');
  }
});

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

    doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, 30, { align: 'center' });
    doc.moveTo(50, 45).lineTo(550, 45).stroke();
    doc.moveDown(2);

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

    doc.fontSize(12).text('Sale Details:', { underline: true });
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

    doc.moveDown(2);
    doc.fontSize(12).text('Payment Information:', 50, doc.y, { underline: true });
    doc.text(`Method: ${sale.paymentMethod || 'N/A'}`, 50, doc.y);
    if (sale.bankDetails) {
      doc.text(`Bank Name: ${sale.bankDetails.bankName || 'N/A'}`, 50, doc.y);
      doc.text(`Bank Account Number: ${sale.bankDetails.bankAccountNumber || 'N/A'}`, 50, doc.y);
    }
    doc.text(`Status: ${sale.paymentStatus || 'Pending'}`, 50, doc.y);

    doc.moveDown(2);
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('Error generating PDF');
  }
});

app.post('/invoices/mark-paid/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const result = await db.collection('sales').updateOne(
      { _id: new ObjectId(saleId), adminId: admin._id },
      { $set: { paymentStatus: 'Paid' } }
    );
    if (result.matchedCount === 0) return res.status(404).send('Invoice not found');
    res.redirect('/invoices');
  } catch (error) {
    console.error('Error marking invoice as paid:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/customers', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const customers = await db.collection('customers').find({ adminId: admin._id }).toArray();
    const username = req.session.admin;
    res.render('customers', { customers, admin, username });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/customer-details/:customerId', isAuthenticated, async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const customer = await db.collection('customers').findOne({ _id: new ObjectId(customerId), adminId: admin._id });
    if (!customer) return res.status(404).send('Customer not found.');
    res.render('customer-details', { customer, admin, username: req.session.admin });
  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/edit-customer/:customerId', isAuthenticated, async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const customer = await db.collection('customers').findOne({ _id: new ObjectId(customerId), adminId: admin._id });
    if (!customer) return res.status(404).send('Customer not found.');
    res.render('edit-customer', { customer, admin, username: req.session.admin });
  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/delete-customer/:customerId', isAuthenticated, async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    await db.collection('customers').deleteOne({ _id: new ObjectId(customerId), adminId: admin._id });
    res.redirect('/customers');
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/health', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ status: 'error', message: 'Database not initialized' });
    await db.collection('outlets').findOne({});
    res.json({ status: 'ok', message: 'Database connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Start server
async function startServer() {
  await connectToMongo();
  app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}

startServer();