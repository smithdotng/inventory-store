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

// Calculate total commission due for an outlet
async function calculateOutletCommission(outletId) {
  try {
    // Get all pending commissions for this outlet
    const result = await db.collection('commissions').aggregate([
      { 
        $match: { 
          outletId: new ObjectId(outletId),
          status: 'pending'
        } 
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" }
        }
      }
    ]).toArray();

    return result[0]?.total || 0;
  } catch (error) {
    console.error('Error calculating commission:', error);
    return 0;
  }
}

// Get outlets with commission data
async function getOutletsWithCommission(adminId) {
  const outlets = await db.collection('outlets')
    .find({ adminId: new ObjectId(adminId) })
    .toArray();

  return Promise.all(outlets.map(async outlet => {
    const commissionDue = await calculateOutletCommission(outlet._id);
    return {
      ...outlet,
      commissionDue
    };
  }));
}


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

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.render('admin-register', {
    error: 'System error',
    referralCode: null,
    message: null
  });
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
      console.log(hashedPassword);
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
  if (!req.session.admin) {
    return res.redirect('/admin-login');
  }
  (async () => {
    try {
      const admin = await db.collection('admins').findOne({ username: req.session.admin });
      if (!admin || admin.role !== 'superadmin') {
        return res.status(403).send('Access denied. Only super admins can access this page.');
      }
      next();
    } catch (err) {
      console.error('Error in isSuperAdmin middleware:', err);
      res.status(500).send('Internal Server Error');
    }
  })();
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
    const { usernameOrEmail, password } = req.body;
    const affiliate = await db.collection('affiliates').findOne({
      $or: [
        { username: usernameOrEmail },
        { email: usernameOrEmail }
      ]
    });
    if (!affiliate || !(await bcrypt.compare(password, affiliate.password))) {
      return res.status(401).send('Invalid username/email or password.');
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
    const referralLink = `http://localhost:3000/admin-register?ref=${affiliate.referralCode}`;
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




// In your /admin-register POST route
app.post('/admin-register', upload.single('logo'), async (req, res) => {
  const { businessName, email, currency, username, password, country } = req.body;
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
      country,
      username,
      password: hashedPassword,
      logo: logoPath,
      role: 'admin',
      createdAt: new Date(),
      
    };

    const result = await db.collection('admins').insertOne(newAdmin);
    await sendWelcomeEmail(email, username, businessName);

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

app.get('/admin-register', async (req, res) => {
  try {
    const referralCode = req.query.ref || null; // Ensure it's never undefined
    
    // Track referral if code exists
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
    
    // Render with all required variables
    res.render('admin-register', { 
      error: null,
      referralCode: referralCode, // Explicitly pass the variable
      message: null,
      admin: null // Include other variables your template might expect
    });
    
  } catch (err) {
    console.error('Error in /admin-register:', err);
    res.render('admin-register', {
      error: 'An error occurred while loading the registration page',
      referralCode: null, // Ensure it's passed even in error case
      message: null,
      admin: null
    });
  }
});



// Admin Login Routes
app.get('/admin-login', (req, res) => {
  res.render('admin-login', { error: null, message: req.query.message || null });
});

app.post('/admin-login', async (req, res) => {
  const { usernameOrEmail, password } = req.body; // Changed from username to usernameOrEmail
  try {
    // Check if login is by email or username
    const admin = await db.collection('admins').findOne({
      $or: [
        { username: usernameOrEmail },
        { email: usernameOrEmail }
      ]
    });
    
    if (admin && await bcrypt.compare(password, admin.password)) {
      req.session.admin = admin.username;
      req.session.adminId = admin._id.toString();

      await db.collection('login_logs').insertOne({
        adminId: admin._id,
        username: admin.username,
        loginTime: new Date(),
      });
      console.log(`Login recorded for ${admin.username}`);

      res.redirect('/update-stock');
    } else {
      res.render('admin-login', { error: 'Invalid username/email or password', message: null });
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).send('Internal Server Error');
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

// Forgot Password Routes
app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { message: null, error: null });
});

app.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const admin = await db.collection('admins').findOne({ email });

    if (!admin) {
      return res.render('forgot-password', { message: null, error: 'No account found with that email.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 3600000; // 1 hour expiration

    await db.collection('password_resets').updateOne(
      { email },
      { $set: { token, expires } },
      { upsert: true }
    );

    // Use environment variable for domain or fallback to localhost in development
    const domain = process.env.DOMAIN_URL || 'http://localhost:3000';
    const resetUrl = `${domain}/reset-password?token=${token}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset Request - Shed',
      html: `
        <h1>Password Reset Request</h1>
        <p>Hello, ${admin.username},</p>
        <p>We received a request to reset your password for Shed. Click the link below to reset your password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link will expire in 1 hour. If you didn’t request this, please ignore this email.</p>
        <p>Best regards,</p>
        <p>Stanley, Chief Relationship Officer, Shedfactory</p>
        <a href="https://shedfactory.co">shedfactory.co</a>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', email);

    res.render('forgot-password', { message: 'A reset link has been sent to your email.', error: null });
  } catch (err) {
    console.error('Error in forgot-password:', err.message, err.stack);
    res.render('forgot-password', { message: null, error: 'An error occurred. Please try again.' });
  }
});

app.get('/reset-password', async (req, res) => {
  try {
    const { token } = req.query;
    const resetEntry = await db.collection('password_resets').findOne({ token });

    if (!resetEntry || resetEntry.expires < Date.now()) {
      return res.render('reset-password', { token: null, error: 'Invalid or expired reset link.' });
    }

    res.render('reset-password', { token, error: null });
  } catch (err) {
    console.error('Error in reset-password GET:', err.message, err.stack);
    res.render('reset-password', { token: null, error: 'An error occurred.' });
  }
});

app.post('/reset-password', async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.render('reset-password', { token, error: 'Passwords do not match.' });
    }

    const resetEntry = await db.collection('password_resets').findOne({ token });
    if (!resetEntry || resetEntry.expires < Date.now()) {
      return res.render('reset-password', { token: null, error: 'Invalid or expired reset link.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.collection('admins').updateOne(
      { email: resetEntry.email },
      { $set: { password: hashedPassword } }
    );

    await db.collection('password_resets').deleteOne({ token });
    console.log('Password reset successful for email:', resetEntry.email);

    res.redirect('/admin-login?message=Password reset successfully. Please log in.');
  } catch (err) {
    console.error('Error in reset-password POST:', err.message, err.stack);
    res.render('reset-password', { token: req.body.token, error: 'An error occurred. Please try again.' });
  }
});

// Superadmin Dashboard
app.get('/superadmin/dashboard', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    console.log('Accessing /superadmin/dashboard for user:', req.session.admin);
    const admins = await db.collection('admins').find().toArray();
    if (!admins.length) console.warn('No admins found in database');

    const adminIds = admins.map(admin => admin._id);
    const loginLogs = await db.collection('login_logs')
      .aggregate([
        { $match: { adminId: { $in: adminIds } } },
        { $group: { _id: '$adminId', lastLogin: { $max: '$loginTime' }, loginCount: { $sum: 1 } } }
      ])
      .toArray();

    const enrichedAdmins = admins.map(admin => {
      const loginData = loginLogs.find(log => log._id.toString() === admin._id.toString()) || {};
      return { 
        ...admin, 
        hasLoggedIn: !!loginData.loginCount,
        loginCount: loginData.loginCount || 0,
        lastLogin: loginData.lastLogin || null 
      };
    });

    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    res.render('superadmin-dashboard', { 
      admins: enrichedAdmins, 
      formatCurrency, 
      currentAdminId: currentAdmin._id.toString() 
    });
  } catch (err) {
    console.error('Error in /superadmin/dashboard:', err.message, err.stack);
    res.status(500).send('Internal Server Error');
  }
});

// Superadmin Password Reset Routes
async function sendPasswordResetEmail(email, username, resetToken) {
  const domain = process.env.DOMAIN_URL || 'http://localhost:3000';
  const resetLink = `${domain}/reset-password/${resetToken}`;
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
app.get('/', (req, res) => res.render('landing', { error: null }));

app.get('/transactions', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const { startDate, endDate, search } = req.query;
    const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();
    
    // Base filter for admin and outlet transactions
    const filter = { 
      $or: [
        { adminId: admin._id }, // Direct admin sales
        { 'outlet.adminId': admin._id } // Sales from outlets owned by this admin
      ]
    };
    
    // Add date range filter if provided
    if (startDate && endDate) {
      filter.date = { 
        $gte: new Date(startDate), 
        $lte: new Date(`${endDate}T23:59:59.999Z`) // Include entire end day
      };
    }

    // Add search filter if provided
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i'); // Case-insensitive search
      filter.$or = [
        { customerName: searchRegex }, // Search by customer name
        { 'items.itemName': searchRegex }, // Search by item name in items array
        { itemName: searchRegex } // Search by item name for older single-item transactions
      ];
      
      // Combine with existing admin/outlet filter
      filter.$and = [
        { $or: filter.$or }, // Search conditions
        { $or: [
          { adminId: admin._id },
          { 'outlet.adminId': admin._id }
        ]} // Admin/outlet ownership
      ];
      delete filter.$or; // Remove standalone $or to avoid conflict
    }
    
    // Get sales with outlet information populated
    const transactions = await db.collection('sales').aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'outlets',
          localField: 'outletId',
          foreignField: '_id',
          as: 'outlet'
        }
      },
      { $unwind: { path: '$outlet', preserveNullAndEmptyArrays: true } },
      { $sort: { date: -1 } } // Newest transactions first
    ]).toArray();

    const validTransactions = transactions.map(sale => ({
      ...sale,
      totalAmount: sale.totalAmount || 0,
      items: sale.items || [],
      outletName: sale.outlet ? sale.outlet.name : null
    }));
    
    res.render('transactions', { 
      transactions: validTransactions, 
      admin, 
      username: req.session.admin,
      inventory,
      startDate: startDate || '',
      endDate: endDate || '',
      search: search || '' // Pass search term to template
    });
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
  try {
    const adminId = req.params.id;
    console.log('Delete request received for adminId:', adminId);

    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    if (currentAdmin._id.toString() === adminId) {
      console.warn('Attempted self-deletion by:', req.session.admin);
      return res.status(403).send('You cannot delete your own superadmin account.');
    }

    const result = await db.collection('admins').deleteOne({ _id: new ObjectId(adminId) });
    if (result.deletedCount === 0) {
      console.warn('No admin found with ID:', adminId);
      return res.status(404).send('Admin not found');
    }

    console.log('Admin deleted successfully:', adminId);
    res.redirect('/superadmin/dashboard');
  } catch (err) {
    console.error('Error deleting admin:', err.message, err.stack);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/delete-outlet/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  await db.collection('outlets').deleteOne({ _id: new ObjectId(outletId) });
  res.redirect('/home');
});

app.get('/update-stock', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const { search } = req.query;

    // Base filter for admin's inventory
    const filter = { adminId: admin._id };

    // Add search filter if provided
    if (search && search.trim() !== '') {
      filter.name = new RegExp(search.trim(), 'i'); // Case-insensitive search by product name
    }

    const inventory = await db.collection('inventory')
      .find(filter)
      .sort({ name: 1 }) // Sort alphabetically by name
      .toArray();

    const username = req.session.admin;
    res.render('update-stock', { 
      inventory, 
      admin, 
      username, 
      formatCurrency,
      search: search || '' // Pass search term to template
    });
  } catch (error) {
    console.error('Error fetching inventory for update-stock:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/update-stock', isAuthenticated, async (req, res) => {
  const { id, stock, cost, commission } = req.body;
  try {
    const objectId = new ObjectId(id);
    const updateData = {
      stock: parseInt(stock),
      cost: parseFloat(cost)
    };
    
    // Only update commission if it's provided and not empty
    if (commission !== undefined && commission !== '') {
      updateData.commission = parseFloat(commission);
    }

    const result = await db.collection('inventory').updateOne(
      { _id: objectId },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) return res.status(404).send('Item not found');
    res.redirect('/update-stock');
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).send('Error updating item');
  }
});;

app.post('/add-product', isAuthenticated, upload.single('productImage'), async (req, res) => {
  const { name, stock, cost, commission } = req.body;
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) return res.status(404).send('Admin not found.');
    
    const newProduct = {
      name,
      stock: parseInt(stock),
      cost: parseFloat(cost),
      adminId: admin._id,
      createdAt: new Date()
    };
    
    // Add image path if uploaded
    if (req.file) {
      newProduct.image = `/uploads/${req.file.filename}`;
    }
    
    // Add commission if provided
    if (commission !== undefined && commission !== '') {
      newProduct.commission = parseFloat(commission);
    }

    await db.collection('inventory').insertOne(newProduct);
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

// GET /profile
app.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      req.session.error = 'Admin not found.';
      return res.redirect('/admin-login');
    }
    res.render('profile', {
      username: req.session.admin,
      admin,
      error: req.session.error || null,
      success: req.session.success || null
    });
    req.session.error = null;
    req.session.success = null;
  } catch (error) {
    console.error('Error fetching profile:', error);
    req.session.error = 'An unexpected error occurred.';
    res.redirect('/invoices');
  }
});

// POST /profile/update
app.post('/profile/update', isAuthenticated, upload.single('logo'), async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      req.session.error = 'Admin not found.';
      return res.redirect('/profile');
    }

    const { 
      businessName, 
      currency, 
      phone, 
      address, 
      country,
      primaryBankAccountName,
      primaryAccountNumber,
      primaryBankName,
      secondaryBankAccountName,
      secondaryAccountNumber,
      secondaryBankName
    } = req.body;

    // Prepare the update data object
    const updateData = {
      businessName: businessName || admin.businessName,
      currency: currency || admin.currency,
      country: country || admin.country,
      phone: phone || admin.phone,
      address: address || admin.address,
      updatedAt: new Date()
    };

    // Handle logo upload if present
    if (req.file) {
      updateData.logo = `/uploads/${req.file.filename}`;
    }

    // Prepare bank account updates
    const primaryAccount = {
      bankAccountName: primaryBankAccountName || (admin.primaryAccount?.bankAccountName || ''),
      accountNumber: primaryAccountNumber || (admin.primaryAccount?.accountNumber || ''),
      bankName: primaryBankName || (admin.primaryAccount?.bankName || '')
    };

    const secondaryAccount = {
      bankAccountName: secondaryBankAccountName || (admin.secondaryAccount?.bankAccountName || ''),
      accountNumber: secondaryAccountNumber || (admin.secondaryAccount?.accountNumber || ''),
      bankName: secondaryBankName || (admin.secondaryAccount?.bankName || '')
    };

    // Only update accounts if at least one field is provided
    if (primaryBankAccountName || primaryAccountNumber || primaryBankName) {
      updateData.primaryAccount = primaryAccount;
    }

    if (secondaryBankAccountName || secondaryAccountNumber || secondaryBankName) {
      updateData.secondaryAccount = secondaryAccount;
    }

    // Perform the update
    await db.collection('admins').updateOne(
      { _id: admin._id },
      { $set: updateData }
    );

    req.session.success = 'Profile updated successfully!';
    res.redirect('/profile');
  } catch (error) {
    console.error('Error updating profile:', error);
    req.session.error = 'Failed to update profile. Please try again.';
    res.redirect('/profile');
  }
});

app.post('/create-outlet', isAuthenticated, async (req, res) => {
  const { name, location, mobile, username, password } = req.body;
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const existingOutlet = await db.collection('outlets').findOne({ username });
    
    if (existingOutlet) {
      req.session.error = 'Username already exists';
      return res.redirect('/home');
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
  } catch (error) {
    console.error('Error creating outlet:', error);
    req.session.error = 'An error occurred while creating outlet';
    res.redirect('/home');
  }
});

// Updated dispense-to-outlet route
app.get('/dispense-to-outlet/:outletId', isAuthenticated, async (req, res) => {
  try {
    const outletId = req.params.outletId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    
    // Verify the outlet belongs to the current admin
    const outlet = await db.collection('outlets').findOne({ 
      _id: new ObjectId(outletId),
      adminId: admin._id 
    });
    
    if (!outlet) {
      return res.status(404).send('Outlet not found or not authorized');
    }

    // Only get inventory items belonging to this admin
    const inventory = await db.collection('inventory').find({ 
      adminId: admin._id 
    }).toArray();
    
    const username = req.session.admin;
    res.render('dispense-to-outlet', { 
      outlet, 
      inventory, 
      admin, 
      username 
    });
  } catch (error) {
    console.error('Error in dispense-to-outlet:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Updated dispense-to-outlet POST route
app.post('/dispense-to-outlet/:outletId', isAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const { itemId, quantity } = req.body;
  const qty = parseInt(quantity);
  
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    
    // Verify the outlet belongs to the current admin
    const outlet = await db.collection('outlets').findOne({ 
      _id: new ObjectId(outletId),
      adminId: admin._id 
    });
    
    if (!outlet) {
      return res.status(404).send('Outlet not found or not authorized');
    }

    // Verify the item belongs to the current admin
    const item = await db.collection('inventory').findOne({ 
      _id: new ObjectId(itemId),
      adminId: admin._id 
    });
    
    if (!item) {
      return res.status(404).send('Item not found or not authorized');
    }

    if (item.stock < qty || qty <= 0) {
      return res.status(400).send('Invalid quantity or insufficient stock');
    }

    // Update admin's inventory (reduce stock)
    await db.collection('inventory').updateOne(
      { _id: new ObjectId(itemId), adminId: admin._id },
      { $inc: { stock: -qty } }
    );

    // Update outlet's inventory (add stock)
    const outletItem = outlet.inventory.find(i => i.id === itemId);
    if (outletItem) {
      await db.collection('outlets').updateOne(
        { _id: new ObjectId(outletId), 'inventory.id': itemId },
        { $inc: { 'inventory.$.stock': qty } }
      );
    } else {
      await db.collection('outlets').updateOne(
        { _id: new ObjectId(outletId) },
        { $push: { 
          inventory: { 
            id: itemId, 
            name: item.name, 
            stock: qty 
          } 
        } }
      );
    }

    res.redirect(`/dispense-to-outlet/${outletId}`);
  } catch (error) {
    console.error('Error dispensing to outlet:', error);
    res.status(500).send('Internal Server Error');
  }
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

// Outlet Logout Route
app.get('/outlet-logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying outlet session:', err);
      return res.status(500).send('Error logging out');
    }
    res.redirect('/admin-login');
  });
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

// Add this to your server.js file
app.post('/add-customer', isAuthenticated, async (req, res) => {
  const { name, phone, email } = req.body;
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) return res.status(404).send('Admin not found.');
    
    const newCustomer = {
      adminId: admin._id,
      name,
      phone: phone || 'N/A',
      email: email || 'N/A',
      createdAt: new Date()
    };

    await db.collection('customers').insertOne(newCustomer);
    res.redirect('/customers');
  } catch (error) {
    console.error('Error adding customer:', error);
    res.status(500).send('Error adding customer.');
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
  try {
    console.log('Admin ID from session:', req.session.adminId);
    const admin = await db.collection('admins').findOne({ _id: new ObjectId(req.session.adminId) });
    if (!admin) throw new Error('Admin not found');
    console.log('Admin found:', admin.username);

    

    let outlets = await db.collection('outlets').find({ adminId: new ObjectId(req.session.adminId) }).toArray();
    console.log('Outlets found:', outlets.length);

    const outletsWithCommission = await Promise.all(outlets.map(async (outlet) => {
      const pendingCommissions = await db.collection('commissions').aggregate([
        { $match: { outletId: outlet._id, status: 'pending' } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]).toArray();

      console.log(`Outlet ${outlet.name} (${outlet._id}): Pending Commissions:`, pendingCommissions);
      const totalCommissionDue = pendingCommissions[0]?.total || 0;
      console.log(`Total Commission Due for ${outlet.name}: ${totalCommissionDue}`);
      return { ...outlet, totalCommissionDue };
    }));

    res.render('home', {
      username: req.session.admin, // Use admin username from session
      admin,
      outlets: outletsWithCommission,
      error: req.query.error
    });
  } catch (error) {
    console.error('Error loading admin home:', error);
    res.render('home', {
      username: req.session.admin,
      admin: null,
      outlets: [],
      error: 'Failed to load outlets. Please try again.'
    });
  }
});

app.post('/outlet-login', async (req, res) => {
  const { usernameOrEmail, password } = req.body; // Changed from username to usernameOrEmail
  const outlet = await db.collection('outlets').findOne({
    $or: [
      { username: usernameOrEmail },
      { email: usernameOrEmail } // Assuming outlets have email field
    ]
  });
  if (outlet && await bcrypt.compare(password, outlet.password)) {
    req.session.outletId = outlet._id.toString();
    res.redirect(`/outlet/${outlet._id}/stock-view`);
  } else {
    res.render('outlet-login', { error: 'Invalid username/email or password' });
  }
});

app.post('/pay-commission/:outletId', isAuthenticated, async (req, res) => {
  try {
    const outletId = req.params.outletId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });

    // Verify outlet belongs to admin
    const outlet = await db.collection('outlets').findOne({ 
      _id: new ObjectId(outletId),
      adminId: admin._id
    });

    if (!outlet) {
      return res.status(404).json({ success: false, message: 'Outlet not found' });
    }

    // Get all pending commissions
    const pendingCommissions = await db.collection('commissions')
      .find({ 
        outletId: new ObjectId(outletId),
        status: 'pending'
      })
      .toArray();

    if (pendingCommissions.length === 0) {
      return res.status(400).json({ success: false, message: 'No pending commissions' });
    }

    // Create commission payment record
    const totalAmount = pendingCommissions.reduce((sum, c) => sum + c.amount, 0);
    const paymentRecord = {
      adminId: admin._id,
      outletId: new ObjectId(outletId),
      outletName: outlet.name,
      amount: totalAmount,
      datePaid: new Date(),
      commissionIds: pendingCommissions.map(c => c._id),
      paymentMethod: 'Bank Transfer', // Could be made dynamic
      reference: `COMM-${Date.now()}`
    };

    // Start transaction
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        // 1. Create payment record
        await db.collection('commission_payments').insertOne(paymentRecord, { session });

        // 2. Update all commissions to paid status
        await db.collection('commissions').updateMany(
          { 
            _id: { $in: pendingCommissions.map(c => c._id) }
          },
          { 
            $set: { 
              status: 'paid',
              paymentId: paymentRecord._id,
              datePaid: new Date()
            } 
          },
          { session }
        );

        // 3. Create transaction record
        await db.collection('transactions').insertOne({
          adminId: admin._id,
          type: 'commission_payment',
          amount: totalAmount,
          date: new Date(),
          description: `Commission payment to ${outlet.name}`,
          reference: paymentRecord.reference,
          balanceImpact: -1 // Negative for outgoing payment
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    res.json({ 
      success: true,
      amount: totalAmount,
      outletName: outlet.name
    });
  } catch (error) {
    console.error('Error processing commission payment:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

function isOutletAuthenticated(req, res, next) {
  if (req.session.outletId) return next();
  res.redirect('/outlet-login');
}

app.get('/pos', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const inventory = await db.collection('inventory').find({ adminId: admin._id }).toArray();
    const username = req.session.admin;
    res.render('pos', { inventory, admin, username });
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
    res.redirect(`/sale-success/${result.insertedId}`);
  } catch (error) {
    console.error('Error confirming sale:', error);
    res.status(500).send('Internal Server Error');
  }
});

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

app.post('/send-receipt-email/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const { email } = req.body;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) return res.status(404).send('Sale not found.');

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

    const drawFooter = () => {
      const footerY = doc.page.height - 50;
      doc.moveTo(50, footerY).lineTo(550, footerY).stroke();
      doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, footerY + 10, { align: 'center' });
    };

    doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, 30, { align: 'center' });
    doc.moveTo(50, 45).lineTo(550, 45).stroke();
    doc.moveDown(2);

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



app.get('/outlet/:outletId/stock-view', isOutletAuthenticated, async (req, res) => {
  const outletId = req.params.outletId;
  const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
  if (!outlet || outlet._id.toString() !== req.session.outletId) return res.redirect('/outlet-login');
  const admin = await db.collection('admins').findOne({ _id: outlet.adminId });
  res.render('outlet-stock-view', { 
    outlet, 
    admin: {
      logo: admin?.logo || '/images/logo.jpg',
      businessName: admin?.businessName || 'Shed'
    }
  });
});

app.get('/outlet/sales-form', isOutletAuthenticated, async (req, res) => {
  try {
    // Get the current outlet
    const outlet = await db.collection('outlets').findOne({ 
      _id: new ObjectId(req.session.outletId) 
    });
    
    if (!outlet) {
      return res.status(404).send('Outlet not found');
    }

    // Get the admin to display business info
    const admin = await db.collection('admins').findOne({ 
      _id: outlet.adminId 
    });

    // Only show inventory items that belong to this outlet
    const inventory = outlet.inventory || [];
    
    res.render('outlet-sales-form', { 
      inventory, 
      outlet, 
      admin,
      formatCurrency
    });
  } catch (error) {
    console.error('Error fetching outlet sales form:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/outlet/sales-form', isOutletAuthenticated, async (req, res) => {
  const { customerName, phoneNumber, email, items } = req.body;
  try {
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(req.session.outletId) });
    if (!outlet) return res.status(404).send('Outlet not found');
    console.log('Outlet:', outlet.name, outlet._id);

    if (!Array.isArray(items)) return res.status(400).send('Invalid items data');
    const admin = await db.collection('admins').findOne({ _id: outlet.adminId });
    const saleItems = [];
    let totalAmount = 0;
    let totalCommission = 0;

    console.log('Items:', items);

    for (const itemData of items) {
      const itemId = itemData.itemId;
      const qty = parseInt(itemData.quantity);
      if (!itemId || isNaN(qty)) return res.status(400).send('Invalid item ID or quantity');

      const outletItem = outlet.inventory.find(i => (i.id && i.id.toString() === itemId) || (i._id && i._id.toString() === itemId));
      if (!outletItem) return res.status(404).send(`Item ${itemId} not found in outlet inventory`);

      const adminProduct = await db.collection('inventory').findOne({ _id: new ObjectId(outletItem.id || outletItem._id), adminId: outlet.adminId });
      console.log(`Item ${outletItem.name}:`, { cost: adminProduct?.cost, commission: adminProduct?.commission });

      let commissionAmount = 0;
      let commissionRate = 0;
      if (adminProduct?.commission) {
        commissionRate = parseFloat(adminProduct.commission);
        commissionAmount = (adminProduct.cost * qty * commissionRate) / 100;
        totalCommission += commissionAmount;
      }
      console.log(`Commission calc for ${outletItem.name}: Rate=${commissionRate}%, Amount=${commissionAmount}, Total so far=${totalCommission}`);

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
    console.log('Sale saved:', { _id: saleResult.insertedId, totalCommission });

    if (totalCommission > 0) {
      console.log('Processing commissions...');
      for (const item of saleItems.filter(i => i.commissionAmount > 0)) {
        const commissionDoc = {
          saleId: saleResult.insertedId,
          adminId: outlet.adminId,
          outletId: outlet._id,
          outletName: outlet.name,
          itemId: item.itemId,
          itemName: item.itemName,
          quantity: parseInt(item.quantity),
          amount: parseFloat(item.commissionAmount.toFixed(2)) + 0.000001, // Force double
          rate: parseFloat(item.commissionRate.toFixed(2)) + 0.000001,     // Force double
          date: new Date(),
          status: 'pending'
        };
        console.log('Inserting commission (post-conversion):', commissionDoc);
        console.log('amount type:', typeof commissionDoc.amount, commissionDoc.amount);
        console.log('rate type:', typeof commissionDoc.rate, commissionDoc.rate);
        try {
          const commissionResult = await db.collection('commissions').insertOne(commissionDoc);
          console.log(`Commission inserted: ${commissionResult.insertedId}`);
        } catch (err) {
          console.error('Failed to insert commission:', err);
          throw err;
        }
      }
    } else {
      console.log('No commissions to process: totalCommission =', totalCommission);
    }

    res.redirect('/outlet/sales-form?success=' + encodeURIComponent('Sale recorded successfully'));
  } catch (error) {
    console.error('Error processing outlet sale:', error);
    res.redirect('/outlet/sales-form?error=' + encodeURIComponent('Failed to complete sale: ' + error.message));
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

app.get('/landing', (req, res) => {
  res.render('landing', { admin: { currency: '$' } }); // Default currency for display
});

// Public Storefront Route
app.get('/store/:adminUsername', async (req, res) => {
  try {
    const adminUsername = req.params.adminUsername;
    const admin = await db.collection('admins').findOne({ username: adminUsername });
    if (!admin) {
      return res.status(404).render('404', { message: 'Store not found' });
    }

    // Fetch inventory items with available stock
    const inventory = await db.collection('inventory')
      .find({ adminId: admin._id, stock: { $gt: 0 } })
      .sort({ name: 1 })
      .toArray();

    res.render('storefront', {
      admin,
      inventory,
      currency: admin.currency || '$',
      formatCurrency
    });
  } catch (error) {
    console.error('Error loading storefront:', error);
    res.status(500).render('500', { message: 'Internal Server Error' });
  }
});


// Checkout Route
app.post('/store/:adminUsername/checkout', async (req, res) => {
  try {
    const adminUsername = req.params.adminUsername;
    const { customerName, phoneNumber, email, cartItems } = req.body;
    const admin = await db.collection('admins').findOne({ username: adminUsername });
    if (!admin) return res.status(404).render('404', { message: 'Store not found' });

    const parsedCart = JSON.parse(cartItems);
    if (!Array.isArray(parsedCart) || parsedCart.length === 0) {
      return res.status(400).send('No items in cart');
    }

    // Store customer
    const customer = {
      adminId: admin._id,
      name: customerName,
      phone: phoneNumber,
      email,
      createdAt: new Date()
    };
    const customerResult = await db.collection('customers').insertOne(customer);

    // Process sale items
    const saleItems = [];
    let totalAmount = 0;
    for (const cartItem of parsedCart) {
      const item = await db.collection('inventory').findOne({ 
        _id: new ObjectId(cartItem.id),
        adminId: admin._id
      });
      if (!item || item.stock < cartItem.quantity) {
        return res.status(400).send(`Insufficient stock for ${cartItem.name}`);
      }

      const totalCost = item.cost * cartItem.quantity;
      saleItems.push({
        itemId: item._id,
        itemName: item.name,
        quantity: cartItem.quantity,
        unitCost: item.cost,
        totalCost
      });
      totalAmount += totalCost;

      await db.collection('inventory').updateOne(
        { _id: item._id },
        { $inc: { stock: -cartItem.quantity } }
      );
    }

    // Record sale
    const sale = {
      adminId: admin._id,
      customerId: customerResult.insertedId,
      customerName,
      phoneNumber,
      email,
      items: saleItems,
      totalAmount,
      paymentMethod: 'Online',
      paymentStatus: 'Pending',
      date: new Date(),
      source: 'storefront'
    };
    const saleResult = await db.collection('sales').insertOne(sale);

    // Generate temporary invoice token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 3600000; // 1 hour expiration
    await db.collection('invoice_tokens').insertOne({
      saleId: saleResult.insertedId,
      token,
      expires
    });

    // Render confirmation page with download link
    const invoiceUrl = `/store/invoice/${saleResult.insertedId}?token=${token}`;
    res.render('storefront-confirmation', {
      admin,
      customerName,
      phoneNumber,
      email,
      saleItems,
      totalAmount,
      saleId: saleResult.insertedId,
      currency: admin.currency || '$',
      formatCurrency,
      invoiceUrl // Pass the URL to the template
    });
  } catch (error) {
    console.error('Error processing checkout:', error);
    res.status(500).render('500', { message: 'Internal Server Error' });
  }
});

app.get('/store/invoice/:saleId', async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const token = req.query.token; // Temporary access token for security

    // Fetch the sale without requiring admin authentication
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId) });
    if (!sale || sale.source !== 'storefront') {
      return res.status(404).render('404', { message: 'Invoice not found' });
    }

    // Verify token (optional, if you implement it in checkout)
    const resetEntry = await db.collection('invoice_tokens').findOne({ saleId: sale._id, token });
    if (!resetEntry || resetEntry.expires < Date.now()) {
      return res.status(403).render('403', { message: 'Invalid or expired invoice link' });
    }

    const admin = await db.collection('admins').findOne({ _id: sale.adminId });
    if (!admin) {
      return res.status(404).render('404', { message: 'Store not found' });
    }

    // Generate PDF
    const doc = new PDFDocument({ margin: 50 });
    const filename = `invoice-${saleId}.pdf`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    // Header
    doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, 30, { align: 'center' });
    doc.moveTo(50, 45).lineTo(550, 45).stroke();
    doc.moveDown(2);

    if (admin.logo && fs.existsSync(path.join(__dirname, 'public', admin.logo))) {
      doc.image(path.join(__dirname, 'public', admin.logo), 50, 60, { width: 100 });
      doc.moveDown(5);
    }

    doc.fontSize(20).text('Invoice', { align: 'right' });
    doc.moveDown();
    doc.fontSize(12).text(`Business: ${admin.businessName || 'N/A'}`, { align: 'left' });
    doc.text(`Email: ${admin.email || 'N/A'}`, { align: 'left' });
    doc.text(`Invoice Date: ${new Date(sale.date).toLocaleDateString()}`, { align: 'left' });
    doc.moveDown();

    // Customer Details
    doc.fontSize(12).text('Customer Details:', { underline: true });
    doc.text(`Name: ${sale.customerName || 'N/A'}`);
    doc.text(`Phone: ${sale.phoneNumber || 'N/A'}`);
    doc.text(`Email: ${sale.email || 'N/A'}`);
    doc.moveDown();

    // Sale Details
    doc.fontSize(12).text('Purchase Details:', { underline: true });
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
        doc.text(`${admin.currency || '$'} ${formatCurrency(item.unitCost || 0)}`, tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'right' });
        doc.text(`${admin.currency || '$'} ${formatCurrency(item.totalCost || 0)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3], align: 'right' });
        y += rowHeight;
      });
    }

    doc.moveTo(tableLeft, y + 5).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), y + 5).stroke();
    doc.font('Helvetica-Bold');
    doc.text('Total Amount:', tableLeft + colWidths[0] + colWidths[1] - 50, y + 10, { width: colWidths[2], align: 'right' });
    doc.text(`${admin.currency || '$'} ${formatCurrency(sale.totalAmount || 0)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y + 10, { width: colWidths[3], align: 'right' });
    doc.font('Helvetica');

    // Payment Details Section
    doc.moveDown(2);
    doc.fontSize(12).text('Payment Details:', { underline: true });
    doc.moveDown(0.5);

    // Add payment instructions
    doc.fontSize(10).text('Please use the following bank details for payment:', { align: 'left' });
    doc.moveDown(0.5);

    // Primary Account
    if (admin.primaryAccount && (admin.primaryAccount.bankAccountName || admin.primaryAccount.accountNumber || admin.primaryAccount.bankName)) {
      doc.fontSize(10).font('Helvetica-Bold').text('Primary Account:', { align: 'left' });
      doc.font('Helvetica');
      if (admin.primaryAccount.bankAccountName) {
        doc.text(`Account Name: ${admin.primaryAccount.bankAccountName}`, { align: 'left' });
      }
      if (admin.primaryAccount.accountNumber) {
        doc.text(`Account Number: ${admin.primaryAccount.accountNumber}`, { align: 'left' });
      }
      if (admin.primaryAccount.bankName) {
        doc.text(`Bank Name: ${admin.primaryAccount.bankName}`, { align: 'left' });
      }
      doc.moveDown(0.5);
    }

    // Secondary Account
    if (admin.secondaryAccount && (admin.secondaryAccount.bankAccountName || admin.secondaryAccount.accountNumber || admin.secondaryAccount.bankName)) {
      doc.fontSize(10).font('Helvetica-Bold').text('Secondary Account:', { align: 'left' });
      doc.font('Helvetica');
      if (admin.secondaryAccount.bankAccountName) {
        doc.text(`Account Name: ${admin.secondaryAccount.bankAccountName}`, { align: 'left' });
      }
      if (admin.secondaryAccount.accountNumber) {
        doc.text(`Account Number: ${admin.secondaryAccount.accountNumber}`, { align: 'left' });
      }
      if (admin.secondaryAccount.bankName) {
        doc.text(`Bank Name: ${admin.secondaryAccount.bankName}`, { align: 'left' });
      }
      doc.moveDown(0.5);
    }

    // Add payment reference note
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Please include the invoice number (${saleId}) as payment reference.`, { align: 'left' });

    // Footer
    const footerY = doc.page.height - 50;
    doc.moveTo(50, footerY).lineTo(550, footerY).stroke();
    doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, footerY + 10, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating storefront invoice:', error);
    res.status(500).render('500', { message: 'Error generating invoice' });
  }
});

app.get('/outlet-transactions/:outletId', isOutletAuthenticated, async (req, res) => {
  try {
    const outletId = req.params.outletId;
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });
    
    // Verify the session matches the outlet
    if (!outlet || outlet._id.toString() !== req.session.outletId) {
      return res.redirect('/outlet-login');
    }

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
});

app.get('/commission-reports', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    
    // Get summary of commissions
    const commissionSummary = await db.collection('commissions').aggregate([
      { $match: { adminId: admin._id } },
      {
        $group: {
          _id: '$status',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    // Get recent payments
    const recentPayments = await db.collection('commission_payments')
      .find({ adminId: admin._id })
      .sort({ datePaid: -1 })
      .limit(10)
      .toArray();

    // Get outlets with pending commissions
    const outletsWithCommissions = await db.collection('outlets').aggregate([
      { $match: { adminId: admin._id } },
      {
        $lookup: {
          from: 'commissions',
          localField: '_id',
          foreignField: 'outletId',
          as: 'commissions',
          pipeline: [
            { $match: { status: 'pending' } }
          ]
        }
      },
      {
        $addFields: {
          pendingCommission: { $sum: '$commissions.amount' }
        }
      },
      { $match: { pendingCommission: { $gt: 0 } } }
    ]).toArray();

    res.render('commission-reports', {
      admin,
      username: req.session.admin,
      summary: commissionSummary,
      payments: recentPayments,
      outlets: outletsWithCommissions,
      formatCurrency
    });
  } catch (error) {
    console.error('Error fetching commission reports:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/outlet-customers/:outletId', isOutletAuthenticated, async (req, res) => {
  try {
    const outletId = req.params.outletId;
    const outlet = await db.collection('outlets').findOne({ _id: new ObjectId(outletId) });

    // Verify the session matches the outlet
    if (!outlet || outlet._id.toString() !== req.session.outletId) {
      return res.redirect('/outlet-login');
    }

    // Fetch sales for this outlet to derive customers
    const sales = await db.collection('sales')
      .find({ outletId: new ObjectId(outletId) })
      .sort({ date: -1 })
      .toArray();

    // Build unique customer list from sales
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

    // Fetch admin details for branding/currency
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

    const error = req.session.error || null;
    const formData = req.session.formData || {};
    delete req.session.error;
    delete req.session.formData;

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
  const { customerId, newCustomerName, newCustomerPhone, newCustomerEmail, items, paymentMethod, bankName, bankAccountName, accountNumber } = req.body;
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
      if (!bankName || !bankAccountName || !accountNumber) {
        req.session.error = 'Bank details required for bank transfers.';
        req.session.formData = req.body;
        await new Promise((resolve) => req.session.save(resolve));
        return res.redirect('/invoices');
      }
      sale.bankDetails = { bankName, bankAccountName, accountNumber };
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

// File upload handler for file_handlers
app.get('/invoices/upload', isAuthenticated, (req, res) => {
  res.render('invoices-upload', { username: req.session.admin });
});

app.post('/invoices/upload', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    console.log('File uploaded:', filePath);
    res.redirect('/invoices');
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Share target handler
app.post('/invoices/share', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    console.log('File shared:', filePath);
    res.redirect('/invoices');
  } catch (error) {
    console.error('Error sharing file:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Protocol handler
app.get('/handle-link', isAuthenticated, (req, res) => {
  const url = req.query.url || '';
  if (url.startsWith('web+shed://invoices')) {
    res.redirect('/invoices');
  } else if (url.startsWith('web+shed://update-stock')) {
    res.redirect('/update-stock');
  } else {
    res.redirect('/home');
  }
});

// Serve manifest.json
app.get('/site.webmanifest', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'site.webmanifest'));
});

app.get('/status', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'status.jpg'));
});

app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

app.get('/offline.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'offline.html'));
});

app.get('*', (req, res, next) => {
  if (req.headers['service-worker']) {
    const filePath = path.join(__dirname, 'public', 'sw.js');
    return res.sendFile(filePath);
  }
  next();
});

// Public invoice download route
app.get('/public-invoice/:saleId', async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId) });
    
    if (!sale) {
      return res.status(404).send('Invoice not found');
    }

    // Get admin info for the sale
    const admin = await db.collection('admins').findOne({ _id: sale.adminId });
    
    const doc = new PDFDocument({ margin: 50 });
    const filename = `invoice-${saleId}.pdf`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    // Your existing PDF generation code here...
    // (Same as your current /receipt/:saleId route but without auth checks)

    
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
      doc.text(`Bank Account Name: ${sale.bankDetails.bankAccountName || 'N/A'}`, 50, doc.y);
      doc.text(`Account Number: ${sale.bankDetails.accountNumber || 'N/A'}`, 50, doc.y);
    }
    doc.text(`Status: ${sale.paymentStatus || 'Pending'}`, 50, doc.y);

    doc.moveDown(2);
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
    
    doc.end();
  } catch (error) {
    console.error('Error generating public invoice:', error);
    res.status(500).send('Error generating invoice');
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
      doc.text(`Bank Account Name: ${sale.bankDetails.bankAccountName || 'N/A'}`, 50, doc.y);
      doc.text(`Account Number: ${sale.bankDetails.accountNumber || 'N/A'}`, 50, doc.y);
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
    const { search } = req.query;

    // Base filter for admin's customers
    const filter = { adminId: admin._id };

    // Add search filter if provided
    if (search && search.trim() !== '') {
      filter.name = new RegExp(search.trim(), 'i'); // Case-insensitive search by customer name
    }

    const customers = await db.collection('customers')
      .find(filter)
      .sort({ name: 1 }) // Sort alphabetically by name
      .toArray();

    // Enrich customers with totalValue and lastPurchaseDate
    for (let customer of customers) {
      const sales = await db.collection('sales')
        .find({ 
          $or: [
            { adminId: admin._id, customerId: customer._id }, // Admin sales
            { 'outlet.adminId': admin._id, customerId: customer._id } // Outlet sales
          ]
        })
        .toArray();
      
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
      search: search || '' // Pass search term to template
    });
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