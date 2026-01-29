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
const { setupBroadcastRoute } = require('./utils/emailBroadcast');
const moment = require('moment');

const app = express();
const port = 3000;

// Load environment variables
require('dotenv').config();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'; // Fallback to localhost for dev

// MongoDB connection details from .env
const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME;
let db;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.json()); // For application/json

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

// In your route file (e.g., app.js or routes/invoices.js)
function getPaymentMethodIcon(method) {
    if (!method) return 'money-bill-wave';
    
    switch(method.toLowerCase()) {
        case 'cash': return 'money-bill-wave';
        case 'credit card': return 'credit-card';
        case 'bank transfer': return 'university';
        case 'mobile payment': return 'mobile-alt';
        default: return 'money-bill-wave';
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

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const username = req.session.admin || 'unknown';
    const timestamp = Date.now();
    const fileExt = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${username}-${timestamp}${fileExt}`);
  }
});

// File filter for images
const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|gif|pdf/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only image and PDF files are allowed!'), false);
  }
};

// Multer instance for multiple product images
const uploadProductImages = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).array('productImages', 4);

// Multer instance for single logo upload
const uploadLogo = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).single('logo');

// Multer instance for single invoice file upload
const uploadInvoiceFile = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).single('file');


// Connect to MongoDB
async function connectToMongo() {
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db(dbName);

    // Create indexes for subscriptions collection
    const subscriptionsCollection = db.collection('subscriptions');
    await subscriptionsCollection.createIndex({ email: 1 }, { unique: true });
    
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


const flash = require('connect-flash');
app.use(flash());

app.get('/referrals/signup', (req, res) => {
  res.render('referrals-signup', { error: req.flash('error')[0] || null });
});

app.get('/referrals/', (req, res) => {
  res.render('referrals-signup', { error: req.flash('error')[0] || null });
});

app.post('/referrals/signup', async (req, res) => {
  let broadcastLog;
  try {
    const { firstName, lastName, email, country, password, countryCode, mobileNumber } = req.body;
    if (!firstName || !lastName || !email || !country || !password || !countryCode || !mobileNumber) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/referrals/signup');
    }

    const existingAffiliate = await db.collection('affiliates').findOne({ email });
    if (existingAffiliate) {
      req.flash('error', 'Email already registered as an affiliate.');
      return res.redirect('/referrals/signup');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = crypto.randomBytes(8).toString('hex');
    const affiliate = {
      firstName,
      lastName,
      email,
      country,
      password: hashedPassword,
      countryCode,
      mobileNumber,
      referralCode,
      createdAt: new Date()
    };

    const result = await db.collection('affiliates').insertOne(affiliate);

    // Construct baseUrl and referral link
    const baseUrl = process.env.BASE_URL || 
                    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
    const referralLink = `${baseUrl}/admin-register?ref=${referralCode}`;
    const dashboardLink = `${baseUrl}/referrals/dashboard?utm_source=welcome_email&utm_medium=email&utm_campaign=affiliate_onboarding`;

    // Start broadcast log for email
    broadcastLog = await db.collection('broadcast_logs').insertOne({
      type: 'affiliate_welcome',
      initiatedBy: 'system',
      startTime: new Date(),
      totalRecipients: 1,
      status: 'processing'
    });

    // Send welcome email
    let successCount = 0;
    let failCount = 0;
    const failedEmails = [];

    try {
      const mailOptions = {
        from: `"Shed Affiliate Programme" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '🎉 Welcome to the Shed Affiliate Program!',
        html: `
          <div style="font-family:Arial,sans-serif;color:#333;padding:20px;max-width:600px;margin:auto;">
            <img src="${baseUrl}/images/logo.png" alt="Shed Logo" style="width:150px;margin-bottom:20px;">
            <h1 style="color:#eba611;">Welcome to the Shed Affiliate Program!</h1>
            <p>Dear ${firstName} ${lastName},</p>
            <p>Congratulations on joining our affiliate family! You're now part of an exciting opportunity to earn cash rewards and exclusive perks, like VIP event access, by sharing our platform with your network.</p>
            <p>Your unique referral link is: <a href="${referralLink}" style="color:#eba611;text-decoration:underline;"><strong>${referralLink}</strong></a></p>
            <p><a href="#" onclick="navigator.clipboard.writeText('${referralLink}');alert('Link copied!');" style="background:#eba611;color:#333;padding:8px 16px;text-decoration:none;border-radius:4px;display:inline-block;">Copy Referral Link</a></p>
            <p>Share this link to start driving signups and watch your rewards grow!</p>
            <p>Curious about your impact? Your <a href="${dashboardLink}" style="color:#eba611;text-decoration:underline;">Affiliate Dashboard</a> shows your clicks, signups, and progress in real-time. Sign in to track how your reach is performing and see your success unfold!</p>
            <h2 style="color:#333;margin-top:20px;">Get Started with These Tips</h2>
            <ul style="line-height:1.6;">
              <li>Share your referral link on social media, blogs, or email campaigns.</li>
              <li>Check your <a href="${dashboardLink}" style="color:#eba611;text-decoration:underline;">dashboard</a> weekly to monitor clicks and signups.</li>
              <li>Contact us for exclusive promotional materials to boost your reach!</li>
            </ul>
            <p>We're here to support your success. Get started today and let’s grow together!</p>
            <p>Best regards,<br>The Shed Affiliate Team</p>
            <p style="font-size:12px;color:#666;margin-top:20px;">Need help? Contact us at <a href="mailto:hello@shed.ng" style="color:#eba611;text-decoration:underline;">support@shed.ng</a></p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      successCount++;

      // Log email success
      await db.collection('broadcast_progress').insertOne({
        broadcastId: broadcastLog._id,
        batchIndex: 0,
        processed: 1,
        successes: 1,
        failures: 0,
        timestamp: new Date()
      });
    } catch (err) {
      console.error(`Failed to send welcome email to ${email}:`, err);
      failCount++;
      failedEmails.push(email);

      // Log email failure
      await db.collection('broadcast_progress').insertOne({
        broadcastId: broadcastLog._id,
        batchIndex: 0,
        processed: 1,
        successes: 0,
        failures: 1,
        timestamp: new Date()
      });
    }

    // Update broadcast log
    await db.collection('broadcast_logs').updateOne(
      { _id: broadcastLog._id },
      {
        $set: {
          endTime: new Date(),
          status: 'completed',
          successCount,
          failCount,
          failedEmails
        }
      }
    );

    req.session.affiliate = result.insertedId.toString();
    res.redirect('/referrals/dashboard');

  } catch (error) {
    console.error('Error signing up affiliate:', error);

    // Update broadcast log if error occurs
    if (broadcastLog?._id) {
      await db.collection('broadcast_logs').updateOne(
        { _id: broadcastLog._id },
        {
          $set: {
            endTime: new Date(),
            status: 'failed',
            error: error.message
          }
        }
      );
    }

    req.flash('error', 'An unexpected error occurred. Please try again later.');
    res.redirect('/referrals/signup');
  }
});



app.get('/referrals/login', (req, res) => {
  res.render('referrals-login', { error: req.flash('error') });
});

app.post('/referrals/login', async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/referrals/login');
    }

    // Normalize input: trim whitespace and convert email to lowercase
    const normalizedInput = usernameOrEmail.trim().toLowerCase();

    const affiliate = await db.collection('affiliates').findOne({
      $or: [
        { username: normalizedInput },
        { email: { $regex: `^${normalizedInput}$`, $options: 'i' } }
      ]
    });

    if (!affiliate || !(await bcrypt.compare(password, affiliate.password))) {
      req.flash('error', 'Invalid username/email or password.');
      return res.redirect('/referrals/login');
    }

    req.session.affiliate = affiliate._id.toString();
    res.redirect('/referrals/dashboard');
  } catch (error) {
    console.error('Error logging in affiliate:', error);
    req.flash('error', 'An unexpected error occurred. Please try again later.');
    res.redirect('/referrals/login');
  }
});

app.get('/referrals/dashboard', isAffiliateAuthenticated, async (req, res) => {
  try {
    // Fetch affiliate from database using session data
    const affiliate = await db.collection('affiliates').findOne({ _id: new ObjectId(req.session.affiliate) });

    // Handle case where affiliate is not found
    if (!affiliate) {
      req.session.destroy(); // Clear invalid session
      return res.redirect('/referrals/login?error=Affiliate not found');
    }

    // Construct baseUrl from environment variable or headers
    const baseUrl = process.env.BASE_URL || 
                    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;

    // Construct referral link
    const referralLink = `${baseUrl}/admin-register?ref=${affiliate.referralCode || affiliate._id}`;

    // Fetch referral activities
    const activities = await db.collection('referral_activities')
      .find({ affiliateId: affiliate._id })
      .sort({ date: -1 })
      .toArray();

    // Aggregate click count (Referral Link Clicked)
    const clickCountResult = await db.collection('referral_activities')
      .aggregate([
        { $match: { affiliateId: affiliate._id, action: 'Referral Link Clicked' } },
        { $count: 'clickCount' }
      ])
      .toArray();
    const clickCount = clickCountResult.length > 0 ? clickCountResult[0].clickCount : 0;

    // Aggregate signup count (New Admin Signup)
    const signupCountResult = await db.collection('referral_activities')
      .aggregate([
        { $match: { affiliateId: affiliate._id, action: 'New Admin Signup' } },
        { $count: 'signupCount' }
      ])
      .toArray();
    const signupCount = signupCountResult.length > 0 ? signupCountResult[0].signupCount : 0;

    res.render('referrals-dashboard', {
      affiliate,
      referralLink,
      activities,
      clickCount,
      signupCount,
      sidebarVisible: true,
      error: null
    });
  } catch (error) {
    console.error('Error loading affiliate dashboard:', error);
    res.render('referrals-dashboard', {
      affiliate: null,
      referralLink: '',
      activities: [],
      clickCount: 0,
      signupCount: 0,
      sidebarVisible: true,
      error: 'An unexpected error occurred. Please try again later.'
    });
  }
});

app.get('/referrals/logout', (req, res) => {
  // Destroy the session
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.redirect('/referrals/dashboard?error=Logout failed');
    }
    // Redirect to login page with a query parameter to trigger sidebar reset
    res.redirect('/referrals/login?resetSidebar=true');
  });
});

// Forgot Password Route
app.get('/referrals/forgot-password', (req, res) => {
  const error = req.flash('error');
  const message = req.flash('success'); // Use 'success' flash message as 'message'
  res.render('referral-forgot-password', { error, message });
});

app.post('/referrals/forgot-password', async (req, res) => {
  let broadcastLog;
  try {
    const { email } = req.body;
    if (!email) {
      req.flash('error', 'Email is required.');
      return res.redirect('/referrals/forgot-password');
    }

    // Normalize email: trim whitespace and convert to lowercase
    const normalizedEmail = email.trim().toLowerCase();
    console.log('Searching for email:', normalizedEmail); // Debugging

    // Case-insensitive query
    const affiliate = await db.collection('affiliates').findOne({
      email: { $regex: `^${normalizedEmail}$`, $options: 'i' }
    });

    if (!affiliate) {
      console.log('No affiliate found for email:', normalizedEmail); // Debugging
      req.flash('error', 'No affiliate found with this email.');
      return res.redirect('/referrals/forgot-password');
    }

    console.log('Found affiliate:', affiliate); // Debugging

    // Generate reset token and expiration
    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenExpiry = moment().add(1, 'hour').toDate();

    // Update affiliate with reset token and expiry
    await db.collection('affiliates').updateOne(
      { _id: affiliate._id },
      { $set: { resetToken, resetTokenExpiry } }
    );

    // Construct reset link
    const baseUrl = process.env.BASE_URL || 
                    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
    const resetLink = `${baseUrl}/referrals/reset-password/${resetToken}`;

    // Start broadcast log for email
    broadcastLog = await db.collection('broadcast_logs').insertOne({
      type: 'password_reset',
      initiatedBy: 'system',
      startTime: new Date(),
      totalRecipients: '1',
      status: 'processing'
    });

    // Send reset email
    let successCount = 0;
    let failCount = 0;
    const failedEmails = [];

    try {
      const mailOptions = {
        from: `"Shed Affiliate Programme" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '🔒 Reset Your Shed Affiliate Password',
        html: `
          <div style="font-family: Arial; color: #333; padding: 20px; max-width: 600px; margin: auto;">
            <img src="${baseUrl}/images/logo.png" alt="Shed Logo" style="width: auto; margin-bottom: 150px;"> width: 150px; height: auto; margin-bottom: 20px;">
            <h1 style="color: #eba611;">Password Reset Request</h1>
            <p>Dear ${affiliate.firstName} ${affiliate.lastName},</p>
            <p>We received a request to reset your Shed Affiliate Program password. Click the link below to reset your password:</p>
            <p><a href="${resetLink}" style="background-color: #eba611; color: #333; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a></p>
            <p>This link will expire in 1 hour for security reasons.</p>
            <p>If you didn’t request a password reset, please ignore this email or contact us at <a href="mailto:support@shed.ng" style="color: #eba611; text-decoration: underline;">support@shed.ng</a>.</p>
            <p>Best regards,<br>The Shed Affiliate Team</p>
            <p style="font-size: 12px; color: #666; margin-top: 20px;">Need help? Contact us at <a href="mailto:support@shed.ng" style="color: #eba611; text-decoration: underline;">support@shed.ng</a></p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      successCount++;

      // Log email success
      await db.collection('broadcast_progress').insertOne({
        broadcastId: broadcastLog._id,
        batchIndex: 0,
        processed: 1,
        successes: 1,
        failures: 0,
        timestamp: new Date()
      });
    } catch (err) {
      console.error(`Failed to send reset email to ${email}:`, err);
      failCount++;
      failedEmails.push(email);

      // Log email failure
      await db.collection('broadcast_progress').insertOne({
        broadcastId: broadcastLog._id,
        batchIndex: 0,
        processed: 1,
        successes: 0,
        failures: 1,
        timestamp: new Date()
      });
    }

    // Update broadcast log
    await db.collection('broadcast_logs').updateOne(
      { _id: broadcastLog._id },
      {
        $set: {
          endTime: new Date(),
          status: 'completed',
          successCount,
          failCount,
          failedEmails
        }
      }
    );

    req.flash('success', 'A password reset link has been sent to your email.');
    res.redirect('/referrals/forgot-password');

  } catch (error) {
    console.error('Error processing forgot password:', error);

    // Update broadcast log if error occurs
    if (broadcastLog?._id) {
      await db.collection('broadcast_logs').updateOne(
        { _id: broadcastLog._id },
        {
          $set: {
            endTime: new Date(),
            status: 'failed',
            error: error.message
          }
        }
      );
    }

    req.flash('error', 'An unexpected error occurred. Please try again later.');
    res.redirect('/referrals/forgot-password');
  }
});

// Reset Password Route
app.get('/referrals/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const affiliate = await db.collection('affiliates').findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() }
    });

    if (!affiliate) {
      req.flash('error', 'Invalid or expired reset token.');
      return res.redirect('/referrals/forgot-password');
    }

    res.render('referral-reset-password', { error: req.flash('error'), token });
  } catch (error) {
    console.error('Error accessing reset password:', error);
    req.flash('error', 'An unexpected error occurred. Please try again.');
    res.redirect('/referrals/forgot-password');
  }
});

app.post('/referrals/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      req.flash('error', 'Both password fields are required.');
      return res.redirect(`/referrals/reset-password/${token}`);
    }

    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect(`/referrals/reset-password/${token}`);
    }

    const affiliate = await db.collection('affiliates').findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() }
    });

    if (!affiliate) {
      req.flash('error', 'Invalid or expired reset token.');
      return res.redirect('/referrals/forgot-password');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    await db.collection('affiliates').updateOne(
      { _id: affiliate._id },
      {
        $set: { password: hashedPassword },
        $unset: { resetToken: '', resetTokenExpiry: '' }
      }
    );

    req.flash('success', 'Password reset successfully. Please log in.');
    res.redirect('/referrals/login');

  } catch (error) {
    console.error('Error resetting password:', error);
    req.flash('error', 'An unexpected error occurred. Please try again.');
    res.redirect(`/referrals/referral-reset-password/${token}`);
  }
});

// EJS Helper to escape special characters
app.locals.escapeEjs = function (str) {
  if (typeof str !== 'string') return str || '';
  return str
    .replace(/%/g, '&#37;') // Escape %
    .replace(/</g, '&lt;')   // Escape <
    .replace(/>/g, '&gt;')   // Escape >
    .replace(/"/g, '&quot;') // Escape "
    .replace(/'/g, '&#39;'); // Escape '
};





app.post('/admin-register', uploadLogo, async (req, res) => {
  const { businessName, email, currency, username, password, country, firstName, lastName } = req.body;
  const referralCode = req.query.ref;
  const logoPath = req.file ? `/uploads/${req.file.filename}` : '/images/default-logo.png'; // Default logo if none uploaded

  try {
    // Validate required fields
    if (!firstName || !lastName) {
      return res.render('admin-register', { 
        error: 'First name and last name are required.',
        businessName,
        email,
        currency,
        username,
        country,
        firstName,
        lastName,
        referralCode
      });
    }

    // Validate username (no spaces allowed)
    if (username.includes(' ')) {
      return res.render('admin-register', { 
        error: 'Username cannot contain spaces.',
        businessName,
        email,
        currency,
        username,
        country,
        firstName,
        lastName,
        referralCode
      });
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.render('admin-register', { 
        error: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
        businessName,
        email,
        currency,
        username,
        country,
        firstName,
        lastName,
        referralCode
      });
    }

    // Check for existing username or email
    const existingAdmin = await db.collection('admins').findOne({ $or: [{ username }, { email }] });
    if (existingAdmin) {
      return res.render('admin-register', { 
        error: 'Username or email already exists.',
        businessName,
        email,
        currency,
        username,
        country,
        firstName,
        lastName,
        referralCode
      });
    }

    // Hash password and create new admin
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = {
      businessName,
      email,
      currency,
      country,
      username,
      password: hashedPassword,
      firstName,
      lastName,
      logo: logoPath,
      role: 'admin',
      createdAt: new Date(),
    };

    // Insert new admin into database
    const result = await db.collection('admins').insertOne(newAdmin);
    
    // Send welcome email
    await sendWelcomeEmail(email, username, businessName);

    // Handle referral code
    if (referralCode) {
      const referrer = await db.collection('affiliates').findOne({ referralCode });
      if (referrer) {
        // Log to referral_activities
        await db.collection('referral_activities').insertOne({
          affiliateId: referrer._id,
          action: 'New Admin Signup',
          userEmail: email,
          date: new Date()
        });
      }
    }

    // Redirect to login page
    res.redirect('/admin-login');
  } catch (error) {
    console.error('Error during registration:', error);
    res.render('admin-register', { 
      error: 'An error occurred during registration. Please try again.',
      businessName,
      email,
      currency,
      username,
      country,
      firstName,
      lastName,
      referralCode
    });
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
        { username: { $regex: `^${usernameOrEmail}$`, $options: 'i' } }, // Case-insensitive username check
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
// /superadmin/dashboard: Enhanced to show POS and online sales
app.get('/superadmin/dashboard', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    console.log('Accessing /superadmin/dashboard for user:', req.session.admin);

    // Fetch all admins
    const admins = await db.collection('admins').find().toArray();
    if (!admins.length) console.warn('No admins found in database');

    const adminIds = admins.map(admin => admin._id);

    // Fetch login logs
    const loginLogs = await db.collection('login_logs')
      .aggregate([
        { $match: { adminId: { $in: adminIds } } },
        { $group: { _id: '$adminId', lastLogin: { $max: '$loginTime' }, loginCount: { $sum: 1 } } }
      ])
      .toArray();

    // Fetch sales (POS and online) for all admins
    const sales = await db.collection('sales')
      .aggregate([
        { $match: { adminId: { $in: adminIds } } },
        {
          $group: {
            _id: { adminId: '$adminId', source: '$source' },
            totalSales: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
            sales: { $push: {
              saleId: '$_id',
              customerName: '$customerName',
              totalAmount: '$totalAmount',
              paymentMethod: '$paymentMethod',
              paymentStatus: '$paymentStatus',
              date: '$date',
              items: '$items'
            }}
          }
        }
      ])
      .toArray();

    // Enrich admins with login and sales data
    const enrichedAdmins = admins.map(admin => {
      const loginData = loginLogs.find(log => log._id.toString() === admin._id.toString()) || {};
      const adminSales = sales.filter(s => s._id.adminId.toString() === admin._id.toString());

      const posSales = adminSales.find(s => s._id.source === 'pos') || { totalSales: 0, totalRevenue: 0, sales: [] };
      const onlineSales = adminSales.find(s => s._id.source === 'storefront') || { totalSales: 0, totalRevenue: 0, sales: [] };

      return {
        ...admin,
        hasLoggedIn: !!loginData.loginCount,
        loginCount: loginData.loginCount || 0,
        lastLogin: loginData.lastLogin || null,
        posSales: {
          count: posSales.totalSales,
          revenue: posSales.totalRevenue,
          sales: posSales.sales
        },
        onlineSales: {
          count: onlineSales.totalSales,
          revenue: onlineSales.totalRevenue,
          sales: onlineSales.sales
        }
      };
    });

    // Fetch current admin
    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!currentAdmin) {
      console.error('Current admin not found for username:', req.session.admin);
      req.flash('error', 'Session invalid. Please log in again.');
      return res.redirect('/superadmin/login');
    }

    res.render('superadmin-dashboard', {
      adminItems: enrichedAdmins,
      currentAdmin,
      currentAdminId: currentAdmin._id.toString(),
      formatCurrency,
      success: req.flash('success') || [],
      error: req.flash('error') || []
    });
  } catch (err) {
    console.error('Error in /superadmin/dashboard:', err.message, err.stack);
    req.flash('error', 'Failed to load dashboard. Please try again.');
    res.redirect('/superadmin/login');
  }
});

app.get('/superadmin/affiliates', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    console.log('Accessing /superadmin/affiliates for user:', req.session.admin);

    // Fetch affiliates
    const affiliates = await db.collection('affiliates').find().toArray();
    if (!affiliates.length) console.warn('No affiliates found in database');

    const affiliateIds = affiliates.map(affiliate => affiliate._id);

    // Aggregate click counts from referral_activities (filtering for 'Referral Link Clicked')
    const clickLogs = await db.collection('referral_activities')
      .aggregate([
        { $match: { affiliateId: { $in: affiliateIds }, action: 'Referral Link Clicked' } },
        { $group: { _id: '$affiliateId', clickCount: { $sum: 1 } } }
      ])
      .toArray();

    // Aggregate signup counts from referral_activities (filtering for 'New Admin Signup')
    const signupLogs = await db.collection('referral_activities')
      .aggregate([
        { $match: { affiliateId: { $in: affiliateIds }, action: 'New Admin Signup' } },
        { $group: { _id: '$affiliateId', signupCount: { $sum: 1 } } }
      ])
      .toArray();

    const enrichedAffiliates = affiliates.map(affiliate => {
      const clickData = clickLogs.find(log => log._id.toString() === affiliate._id.toString()) || {};
      const signupData = signupLogs.find(log => log._id.toString() === affiliate._id.toString()) || {};
      return {
        ...affiliate,
        clickCount: clickData.clickCount || 0,
        signupCount: signupData.signupCount || 0
      };
    });

    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    res.render('superadmin-affiliates', { 
      affiliates: enrichedAffiliates,
      currentAdminId: currentAdmin._id.toString()
    });
  } catch (err) {
    console.error('Error in /superadmin/affiliates:', err.message, err.stack);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/superadmin/outlets', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    console.log('Accessing /superadmin/outlets for user:', req.session.admin);

    // Fetch all outlets
    const outlets = await db.collection('outlets').find().toArray();
    if (!outlets.length) console.warn('No outlets found in database');

    // Fetch all admins
    const admins = await db.collection('admins').find().toArray();
    if (!admins.length) console.warn('No admins found in database');

    // Create a map of adminId to admin details for efficient lookup
    const adminMap = new Map(admins.map(admin => [admin._id.toString(), admin]));

    // Fetch login logs for admins
    const adminIds = admins.map(admin => admin._id);
    const loginLogs = await db.collection('login_logs')
      .aggregate([
        { $match: { adminId: { $in: adminIds } } },
        { $group: { _id: '$adminId', lastLogin: { $max: '$loginTime' }, loginCount: { $sum: 1 } } }
      ])
      .toArray();

    // Create a map of adminId to login data
    const loginMap = new Map(loginLogs.map(log => [log._id.toString(), log]));

    // Enrich outlets with admin details and login data
    const enrichedOutlets = outlets.map(outlet => {
      const admin = adminMap.get(outlet.adminId) || {};
      const loginData = loginMap.get(outlet.adminId) || {};
      return {
        ...outlet,
        adminBusinessName: admin.businessName || 'N/A',
        adminEmail: admin.email || 'N/A',
        adminCurrency: admin.currency || '₦',
        hasLoggedIn: !!loginData.loginCount,
        loginCount: loginData.loginCount || 0,
        lastLogin: loginData.lastLogin || null
      };
    });

    // Fetch current superadmin
    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!currentAdmin) {
      console.error('Current superadmin not found:', req.session.admin);
      return res.status(401).send('Unauthorized');
    }

    // Define formatCurrency function
    const formatCurrency = (amount) => {
      if (!amount) return '0.00';
      return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    res.render('superadmin-outlets', {
      outlets: enrichedOutlets,
      formatCurrency,
      currentAdminId: currentAdmin._id.toString()
    });
  } catch (err) {
    console.error('Error in /superadmin/outlets:', err.message, err.stack);
    res.status(500).render('500', {
      message: 'Error loading outlets dashboard',
      error: process.env.NODE_ENV === 'development' ? err : undefined
    });
  }
});

app.get('/superadmin/sent-messages', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    // Get current admin details
    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!currentAdmin) {
      req.flash('error', 'Session invalid. Please log in again.');
      return res.redirect('/superadmin/login');
    }

    // Get messages sent by this admin
    const messages = await db.collection('messages')
      .find({ senderId: new ObjectId(currentAdmin._id) })
      .sort({ createdAt: -1 })
      .toArray();

    // Enrich messages with recipient usernames
    const enrichedMessages = await Promise.all(messages.map(async (msg) => {
      let recipient = 'All Admins';
      if (msg.recipientId) {
        const admin = await db.collection('admins').findOne({ _id: msg.recipientId });
        recipient = admin ? admin.username : 'Unknown';
      }
      return { 
        ...msg, 
        recipient,
        formattedDate: new Date(msg.createdAt).toLocaleString(),
        readAtFormatted: msg.readAt ? new Date(msg.readAt).toLocaleString() : null
      };
    }));

    res.render('superadmin-sent-messages', {
      messages: enrichedMessages,
      currentAdmin: currentAdmin, // Pass currentAdmin to template
      success: req.flash('success') || [],
      error: req.flash('error') || []
    });
  } catch (err) {
    console.error('Error fetching sent messages:', err);
    req.flash('error', 'Failed to load sent messages.');
    res.redirect('/superadmin/dashboard');
  }
});

app.post('/superadmin/send-message', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const { content, recipientId } = req.body;
    if (!content || content.trim().length < 1) {
      req.flash('error', 'Message content is required.');
      return res.redirect('/superadmin/dashboard');
    }

    const sender = await db.collection('admins').findOne({ _id: new ObjectId(req.session.adminId) });
    if (!sender) {
      req.flash('error', 'Sender not found.');
      return res.redirect('/superadmin/dashboard');
    }

    const message = {
      sender: sender.username, // Add sender username
      senderId: new ObjectId(req.session.adminId),
      recipientId: recipientId ? new ObjectId(recipientId) : null,
      content: content.trim(),
      createdAt: new Date(),
      read: false,
      readAt: null
    };

    await db.collection('messages').insertOne(message);
    req.flash('success', 'Message sent successfully.');
    res.redirect('/superadmin/dashboard');
  } catch (err) {
    console.error('Error sending message:', err);
    req.flash('error', 'Failed to send message. Please try again.');
    res.redirect('/superadmin/dashboard');
  }
});

// Route to display individual admin details
app.get('/superadmin/admin/:adminUsername', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const adminUsername = req.params.adminUsername;
    console.log('Requested admin username:', adminUsername);

    // Validate username
    if (!adminUsername || typeof adminUsername !== 'string' || adminUsername.trim() === '') {
      console.error('Invalid username:', adminUsername);
      req.session.error = ['Invalid admin username'];
      return res.redirect('/superadmin/dashboard');
    }

    // Fetch admin details with case-insensitive query
    const admin = await db.collection('admins').findOne({
      username: { $regex: `^${adminUsername}$`, $options: 'i' }
    });

    if (!admin) {
      console.log('Admin not found for username:', adminUsername);
      req.session.error = ['Admin not found'];
      return res.redirect('/superadmin/dashboard');
    }

    // Redirect to correct case if mismatch
    if (admin.username !== adminUsername) {
      console.log(`Case mismatch: redirecting to ${admin.username}`);
      return res.redirect(`/superadmin/admin/${encodeURIComponent(admin.username)}`);
    }

    console.log('Admin found:', admin._id, admin.username);

    // Fetch transactions by adminId
    const transactions = await db.collection('transactions').find({ adminId: new ObjectId(admin._id) }).toArray().catch(err => {
      console.error('Transaction query error:', err);
      return [];
    });
    console.log('Transactions found:', transactions.length);

    // Current admin
    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!currentAdmin) {
      console.log('Current admin not found:', req.session.admin);
      req.session.error = ['Current admin not found'];
      return res.redirect('/admin-login');
    }

    // Render the page
    res.render('superadmin-admin-details', {
      admin,
      transactions,
      currentAdminId: currentAdmin._id.toString(),
      currentAdmin,
      success: req.session.success || [],
      error: req.session.error || [],
      escapeEjs: (str) => {
        if (str == null || str === undefined) return 'N/A';
        return require('ejs').escapeXML(str.toString());
      },
      formatCurrency: (amount, currency) => {
        try {
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'NGN',
            minimumFractionDigits: 2
          }).format(amount || 0);
        } catch (e) {
          return `${currency || '₦'} ${parseFloat(amount || 0).toFixed(2)}`;
        }
      }
    });

    // Clear session messages
    req.session.success = null;
    req.session.error = null;

  } catch (error) {
    console.error('Error in admin details route:', error.stack);
    req.session.error = [`Failed to load admin details: ${error.message}`];
    res.redirect('/superadmin/dashboard');
  }
});

app.post('/superadmin/delete-admin/:id', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const adminId = req.params.id;
        console.log('Delete route hit for ID:', adminId);

        // Validate ObjectId
        if (!ObjectId.isValid(adminId)) {
            console.log('Invalid admin ID:', adminId);
            req.session.error = ['Valid admin ID'];
            return res.redirect('/superadmin/dashboard');
        }

        // Check if deleting own account
        const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
        if (!currentAdmin) {
            console.log('Current admin not found in session:', req.session.admin);
            req.session.error = ['Current admin not found'];
            return res.redirect('/superadmin/dashboard');
        }
        if (currentAdmin._id.toString() === adminId) {
            console.log('Attempted to delete own account:', adminId);
            req.session.error = ['Cannot delete your own account'];
            return res.redirect('/superadmin/dashboard');
        }

        // Check if admin exists before deletion
        const adminToDelete = await db.collection('admins').findOne({ _id: new ObjectId(adminId) });
        if (!adminToDelete) {
            console.log('No admin found with ID:', adminId);
            req.session.error = ['Admin not found'];
            return res.redirect('/superadmin/dashboard');
        }
        console.log('Admin to delete:', adminToDelete);

        // Perform the deletion
        console.log('Attempting to delete admin with ID:', adminId);
        const result = await db.collection('admins').deleteOne({ _id: new ObjectId(adminId) });
        console.log('Delete result:', result);

        if (result.deletedCount === 1) {
            console.log('Admin deleted successfully:', adminId);
            req.session.success = ['Admin deleted successfully'];
        } else {
            console.log('No admin found with ID:', adminId);
            req.session.error = ['Admin not found'];
        }

        res.redirect('/superadmin/dashboard');
    } catch (error) {
        console.error('Error deleting admin:', error);
        req.session.error = ['Failed to delete admin'];
        res.redirect('/superadmin/dashboard');
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
    const { businessName, currency, role, username, phone } = req.body;

    // Validate required fields
    if (!username || !role) {
      req.flash('error', 'Username and role are required.');
      return res.redirect('/superadmin/dashboard');
    }

    // Validate role
    if (!['admin', 'superadmin'].includes(role)) {
      req.flash('error', 'Role must be either "admin" or "superadmin".');
      return res.redirect('/superadmin/dashboard');
    }

    // Check for duplicate username (excluding current admin)
    const existingAdmin = await db.collection('admins').findOne({
      username,
      _id: { $ne: new ObjectId(adminId) }
    });
    if (existingAdmin) {
      req.flash('error', 'Username already exists.');
      return res.redirect('/superadmin/dashboard');
    }

    // Update admin
    await db.collection('admins').updateOne(
      { _id: new ObjectId(adminId) },
      { $set: { businessName: businessName || null, currency: currency || null, role, username, phone: phone || null } }
    );

    req.flash('success', 'Admin updated successfully.');
    res.redirect('/superadmin/dashboard');
  } catch (error) {
    console.error('Error updating admin:', error);
    req.flash('error', 'An unexpected error occurred. Please try again later.');
    res.redirect('/superadmin/dashboard');
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
      search: search || '', // Pass search term to template
      error: null, // Add error message
      success: null, // Add success message
      formatCurrency
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    // Render the template with error message
    res.render('transactions', {
      transactions: [],
      admin: req.session.admin ? { username: req.session.admin } : null,
      username: req.session.admin || '',
      inventory: [],
      startDate: '',
      endDate: '',
      search: '',
      error: 'Failed to load transactions. Please try again.',
      success: null
    });
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

app.post('/superadmin/create-admin', isAuthenticated, isSuperAdmin, uploadLogo, async (req, res) => {
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


// Middleware to trust proxy headers (important for production behind proxies)
app.set('trust proxy', true);

// GET /update-stock
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

    // Define baseUrl from environment variable or dynamically from headers
    const baseUrl = process.env.BASE_URL || 
                    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;

    // Define store URL using baseUrl
    const storeUrl = `${baseUrl}/store/${username}`;

    res.render('update-stock', { 
      inventory, 
      admin, 
      username, 
      formatCurrency,
      search: search || '',
      storeUrl,
      baseUrl, // Pass baseUrl to template for shareStorefrontLink
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Error fetching inventory for update-stock:', error);
    res.render('update-stock', {
      inventory: [],
      admin: null,
      username: req.session.admin,
      formatCurrency,
      search: '',
      storeUrl: '', // Provide empty storeUrl in case of error
      baseUrl: process.env.BASE_URL || 'https://yourdomain.com', // Fallback baseUrl
      error: 'Failed to load inventory. Please try again.',
      success: null
    });
  }
});

// POST /update-stock
app.post('/update-stock', isAuthenticated, async (req, res) => {
  const { _id, stock, cost, commission, description, search = '' } = req.body;
  
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

    // Add description update if provided
    if (description !== undefined) {
      updateData.description = description.trim().substring(0, 400); // enforce limit
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

    res.redirect(`/update-stock?success=Item updated successfully${search ? `&search=${encodeURIComponent(search)}` : ''}`);
  } catch (error) {
    console.error('Error updating item:', error);
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    let inventory = [];
    if (admin) {
      const query = { adminId: admin._id };
      if (search) query.name = { $regex: search, $options: 'i' };
      inventory = await db.collection('inventory').find(query).toArray();
    }
    res.render('update-stock', {
      inventory,
      admin: admin || null,
      username: req.session.admin,
      formatCurrency,
      search: search || '',
      error: error.message,
      success: null
    });
  }
});

app.get('/admin-messages', isAuthenticated, async (req, res) => {
  try {
      const admin = await db.collection('admins').findOne({ username: req.session.admin });
      if (!admin) {
          req.flash('error', 'Admin not found.');
          return res.redirect('/home');
      }

      // Get count of deleted messages for this admin
      const deletedCount = await db.collection('messages').countDocuments({
          $or: [
              { recipientId: admin._id },
              { recipientId: null }
          ],
          deleted: true
      });

      let query = {
          $or: [
              { recipientId: admin._id },
              { recipientId: null }
          ],
          deleted: { $ne: true } // Only show non-deleted messages
      };
      
      if (req.query.search) {
          const senderAdmins = await db.collection('admins')
              .find({ username: { $regex: req.query.search, $options: 'i' } })
              .project({ _id: 1 })
              .toArray();
          const senderIds = senderAdmins.map(a => a._id);
          query.$and = [
              {
                  $or: [
                      { senderId: { $in: senderIds } },
                      { subject: { $regex: req.query.search, $options: 'i' } },
                      { content: { $regex: req.query.search, $options: 'i' } }
                  ]
              }
          ];
      }

      const messages = await db.collection('messages')
          .aggregate([
              { $match: query },
              {
                  $lookup: {
                      from: 'admins',
                      localField: 'senderId',
                      foreignField: '_id',
                      as: 'senderInfo'
                  }
              },
              {
                  $project: {
                      _id: 1,
                      sender: { $arrayElemAt: ['$senderInfo.username', 0] },
                      subject: 1,
                      content: 1,
                      createdAt: 1,
                      read: 1,
                      readAt: 1,
                      isHtml: 1
                  }
              },
              { $sort: { createdAt: -1 } }
          ])
          .toArray();

      res.render('admin-messages', {
          username: req.session.admin,
          admin,
          messages,
          deletedCount, // Pass the deletedCount to the template
          search: req.query.search || '',
          success: req.flash('success'),
          error: req.flash('error'),
          formatDate: (date) => {
              return new Date(date).toLocaleString();
          },
          currentPage: 'messages'
      });
  } catch (err) {
      console.error('Error in /admin-messages:', err);
      req.flash('error', 'Failed to load messages.');
      res.redirect('/home');
  }
});

app.post('/admin/mark-message', isAuthenticated, async (req, res) => {
  try {
    const { _id, read } = req.body;
    const update = {
      $set: {
        read,
        readAt: read ? new Date() : null
      }
    };
    await db.collection('messages').updateOne(
      { _id: new ObjectId(_id) },
      update
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /admin/mark-message:', err);
    res.json({ success: false, error: 'Failed to update message status' });
  }
});

// Mark message as read/unread route
app.post('/mark-as-read', isAuthenticated, async (req, res) => {
  try {
      const { _id, read } = req.body;

      // Validate input
      if (!_id || !ObjectId.isValid(_id)) {
          return res.status(400).json({ 
              error: 'Invalid message ID',
              success: false
          });
      }

      // Check database connection
      if (!db || !db.collection) {
          throw new Error('Database connection not initialized');
      }

      // Get current admin
      const admin = await db.collection('admins').findOne({ username: req.session.admin });
      if (!admin) {
          return res.status(403).json({ 
              error: 'Admin not found',
              success: false
          });
      }

      // Update message status
      const updateResult = await db.collection('messages').updateOne(
          {
              _id: new ObjectId(_id),
              $or: [
                  { recipientId: admin._id },
                  { recipientId: null } // Allow updating broadcast messages
              ]
          },
          {
              $set: { 
                  read: read === 'false', // Convert string to boolean
                  readAt: new Date() 
              }
          }
      );

      if (updateResult.modifiedCount === 0) {
          return res.status(404).json({ 
              error: 'Message not found or no changes made',
              success: false
          });
      }

      res.json({ 
          success: true,
          read: read === 'false' // Return the new read status
      });
  } catch (error) {
      console.error('Error marking message as read:', {
          message: error.message,
          stack: error.stack,
          body: req.body,
          admin: req.session.admin
      });
      res.status(500).json({ 
          error: 'Error updating message status',
          success: false
      });
  }
});

// Soft delete message route
app.post('/admin/delete-message', isAuthenticated, async (req, res) => {
  try {
      const { _id } = req.body;

      // Validate message ID
      if (!_id || !ObjectId.isValid(_id)) {
          req.flash('error', 'Invalid message ID');
          return res.redirect('/admin-messages');
      }

      // Check database connection
      if (!db || !db.collection) {
          throw new Error('Database connection not initialized');
      }

      // Get current admin
      const admin = await db.collection('admins').findOne({ username: req.session.admin });
      if (!admin) {
          req.flash('error', 'Admin not found');
          return res.redirect('/admin-login');
      }

      // Update message with deleted flag instead of deleting
      const result = await db.collection('messages').updateOne(
          {
              _id: new ObjectId(_id),
              $or: [
                  { recipientId: admin._id },
                  { recipientId: null } // Allow "deletion" of broadcast messages
              ]
          },
          {
              $set: { 
                  deleted: true,
                  deletedAt: new Date(),
                  deletedBy: admin._id
              }
          }
      );

      if (result.modifiedCount === 0) {
          req.flash('error', 'Message not found or you do not have permission to delete it');
      } else {
          req.flash('success', 'Message moved to trash');
      }

      res.redirect('/admin-messages');
  } catch (error) {
      console.error('Error soft deleting message:', error);
      req.flash('error', 'Error deleting message');
      res.redirect('/admin-messages');
  }
});

app.get('/admin-messages/trash', isAuthenticated, async (req, res) => {
  try {
      const admin = await db.collection('admins').findOne({ username: req.session.admin });
      if (!admin) {
          req.flash('error', 'Admin not found.');
          return res.redirect('/home');
      }

      let query = {
          $or: [
              { recipientId: admin._id },
              { recipientId: null }
          ],
          deleted: true
      };

      if (req.query.search) {
          const senderAdmins = await db.collection('admins')
              .find({ username: { $regex: req.query.search, $options: 'i' } })
              .project({ _id: 1 })
              .toArray();
          const senderIds = senderAdmins.map(a => a._id);
          query.$and = [
              {
                  $or: [
                      { senderId: { $in: senderIds } },
                      { subject: { $regex: req.query.search, $options: 'i' } },
                      { content: { $regex: req.query.search, $options: 'i' } }
                  ]
              }
          ];
      }

      const deletedMessages = await db.collection('messages')
          .aggregate([
              { $match: query },
              {
                  $lookup: {
                      from: 'admins',
                      localField: 'senderId',
                      foreignField: '_id',
                      as: 'senderInfo'
                  }
              },
              {
                  $lookup: {
                      from: 'admins',
                      localField: 'deletedBy',
                      foreignField: '_id',
                      as: 'deletedByInfo'
                  }
              },
              {
                  $project: {
                      _id: 1,
                      sender: { $arrayElemAt: ['$senderInfo.username', 0] },
                      deletedBy: { $arrayElemAt: ['$deletedByInfo.username', 0] },
                      subject: 1,
                      content: 1,
                      createdAt: 1,
                      deletedAt: 1,
                      read: 1,
                      readAt: 1,
                      isHtml: 1
                  }
              },
              { $sort: { deletedAt: -1 } }
          ])
          .toArray();

      res.render('admin-messages-trash', {
          username: req.session.admin,
          admin,
          messages: deletedMessages,
          search: req.query.search || '',
          success: req.flash('success'),
          error: req.flash('error'),
          formatDate: (date) => {
              return new Date(date).toLocaleString();
          },
          currentPage: 'trash'
      });
  } catch (err) {
      console.error('Error in /admin-messages/trash:', err);
      req.flash('error', 'Failed to load trash.');
      res.redirect('/admin-messages');
  }
});


app.post('/admin/delete-message', isAuthenticated, async (req, res) => {
  try {
      const { _id } = req.body;

      if (!_id || !ObjectId.isValid(_id)) {
          req.flash('error', 'Invalid message ID');
          return res.redirect('/admin-messages');
      }

      const admin = await db.collection('admins').findOne({ username: req.session.admin });
      if (!admin) {
          req.flash('error', 'Admin not found');
          return res.redirect('/admin-login');
      }

      // Soft delete by setting deleted flag
      const result = await db.collection('messages').updateOne(
          {
              _id: new ObjectId(_id),
              $or: [
                  { recipientId: admin._id },
                  { recipientId: null }
              ]
          },
          {
              $set: { 
                  deleted: true,
                  deletedAt: new Date(),
                  deletedBy: admin._id
              }
          }
      );

      if (result.modifiedCount === 0) {
          req.flash('error', 'Message not found or no permission');
      } else {
          req.flash('success', 'Message moved to trash');
      }

      res.redirect('/admin-messages');
  } catch (error) {
      console.error('Error soft deleting message:', error);
      req.flash('error', 'Error deleting message');
      res.redirect('/admin-messages');
  }
});

app.post('/admin/restore-message', isAuthenticated, async (req, res) => {
  try {
      const { _id } = req.body;

      if (!_id || !ObjectId.isValid(_id)) {
          req.flash('error', 'Invalid message ID');
          return res.redirect('/admin-messages/trash');
      }

      const admin = await db.collection('admins').findOne({ username: req.session.admin });
      if (!admin) {
          req.flash('error', 'Admin not found');
          return res.redirect('/admin-login');
      }

      // Restore by removing deleted flag
      const result = await db.collection('messages').updateOne(
          {
              _id: new ObjectId(_id),
              deletedBy: admin._id // Only allow restore if admin was the one who deleted it
          },
          {
              $unset: { 
                  deleted: "",
                  deletedAt: "",
                  deletedBy: ""
              }
          }
      );

      if (result.modifiedCount === 0) {
          req.flash('error', 'Message not found or no permission to restore');
      } else {
          req.flash('success', 'Message restored successfully');
      }

      res.redirect('/admin-messages/trash');
  } catch (error) {
      console.error('Error restoring message:', error);
      req.flash('error', 'Error restoring message');
      res.redirect('/admin-messages/trash');
  }
});

app.post('/admin/permanently-delete-message', isAuthenticated, async (req, res) => {
  try {
      const { _id } = req.body;

      if (!_id || !ObjectId.isValid(_id)) {
          req.flash('error', 'Invalid message ID');
          return res.redirect('/admin-messages/trash');
      }

      const admin = await db.collection('admins').findOne({ username: req.session.admin });
      if (!admin) {
          req.flash('error', 'Admin not found');
          return res.redirect('/admin-login');
      }

      // Permanent delete
      const result = await db.collection('messages').deleteOne({
          _id: new ObjectId(_id),
          deletedBy: admin._id // Only allow permanent delete if admin was the one who deleted it
      });

      if (result.deletedCount === 0) {
          req.flash('error', 'Message not found or no permission to delete');
      } else {
          req.flash('success', 'Message permanently deleted');
      }

      res.redirect('/admin-messages/trash');
  } catch (error) {
      console.error('Error permanently deleting message:', error);
      req.flash('error', 'Error deleting message');
      res.redirect('/admin-messages/trash');
  }
});

// POST /add-product
app.post('/add-product', isAuthenticated, uploadProductImages, async (req, res) => {
  const { name, description, stock, cost, commission, isVatable } = req.body;
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      return res.render('update-stock', {
        inventory: [],
        admin: null,
        username: req.session.admin,
        formatCurrency,
        search: '',
        error: 'Admin not found.',
        success: null
      });
    }
    
    // Validate description length
    if (description && description.length > 400) {
      return res.render('update-stock', {
        inventory: [],
        admin: null,
        username: req.session.admin,
        formatCurrency,
        search: '',
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
      isVatable: isVatable === 'on', // New VAT field for product
      createdAt: new Date()
    };
    
    // Add image paths if uploaded
    if (req.files && req.files.length > 0) {
      newProduct.images = req.files.map(file => `/uploads/${file.filename}`);
    } else {
      newProduct.images = [];
    }
    
    // Add commission if provided
    if (commission !== undefined && commission !== '') {
      newProduct.commission = parseFloat(commission);
    }

    await db.collection('inventory').insertOne(newProduct);
    res.redirect('/update-stock');
  } catch (error) {
    console.error('Error adding product:', error);
    res.render('update-stock', {
      inventory: [],
      admin: null,
      username: req.session.admin,
      formatCurrency,
      search: '',
      error: 'Error adding product.',
      success: null
    });
  }
});

app.post('/delete-stock', isAuthenticated, async (req, res) => {
  const { _id } = req.body;
  try {
    const objectId = new ObjectId(_id);
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) throw new Error('Admin not found.');
    const result = await db.collection('inventory').deleteOne({ _id: objectId, adminId: admin._id });
    if (result.deletedCount === 0) throw new Error('Item not found or you do not have permission.');
    res.redirect('/update-stock?success=Item deleted successfully');
  } catch (error) {
    console.error('Error deleting item:', error);
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const inventory = admin ? await db.collection('inventory').find({ adminId: admin._id }).toArray() : [];
    res.render('update-stock', {
      inventory,
      admin: admin || null,
      username: req.session.admin,
      formatCurrency,
      search: '',
      error: error.message,
      success: null
    });
  }
});

app.get('/create-outlet', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const outlets = await db.collection('outlets').find({ adminId: admin._id }).toArray(); // Fetch outlets for this admin
    const username = req.session.admin;
    res.render('create-outlet', { error: req.session.error || null, admin, username, outlets });
    req.session.error = null; // Clear error after rendering
  } catch (error) {
    console.error('Error fetching outlets:', error);
    res.render('create-outlet', { error: 'Error fetching outlets', admin: null, username: req.session.admin, outlets: [] });
  }
});



app.post('/update-description', async (req, res) => {
  try {
      const { _id, description, search } = req.body;
      
      // Validate input
      if (!_id || !ObjectId.isValid(_id)) {
          return res.status(400).json({ error: 'Invalid item ID' });
      }
      
      if (description && description.length > 400) {
          return res.status(400).json({ error: 'Description too long' });
      }
      
      // Update in database
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
});

// GET /profile
app.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      req.session.error = 'Admin not found.';
      return res.redirect('/admin-login');
    }

    // Pass session messages to template and clear them
    const error = req.session.error;
    const success = req.session.success;
    req.session.error = null; // Clear error
    req.session.success = null; // Clear success

    res.render('profile', {
      username: req.session.admin,
      admin,
      error,
      success
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    req.session.error = 'Failed to load profile. Please try again.';
    res.redirect('/admin-login');
  }
});

// Middleware to trim whitespace from social media URLs
app.use((req, res, next) => {
  if (req.body.facebook) req.body.facebook = req.body.facebook.trim();
  if (req.body.instagram) req.body.instagram = req.body.instagram.trim();
  if (req.body.twitter) req.body.twitter = req.body.twitter.trim();
  next();
});

app.post('/profile/update', isAuthenticated, uploadLogo, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      req.session.error = 'Admin not found.';
      req.session.success = null;
      return res.redirect('/profile');
    }

    const { 
      firstName,
      lastName,
      businessName, 
      currency, 
      phone, 
      email,
      address, 
      country,
      primaryBankAccountName,
      primaryAccountNumber,
      primaryBankName,
      secondaryBankAccountName,
      secondaryAccountNumber,
      secondaryBankName,
      facebook,
      instagram,
      twitter,
      publicPhone,
      publicEmail,
      publicAddress,
      applyVat, // New field for VAT application
      vatRate,  // New field for VAT rate
      croppedImageData
    } = req.body;

    // Validate email
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      req.session.error = 'Please enter a valid email address';
      req.session.success = null;
      return res.redirect('/profile');
    }

    // Validate VAT rate if applying VAT
    if (applyVat === 'on') {
      const vatRateValue = parseFloat(vatRate);
      if (isNaN(vatRateValue) || vatRateValue < 0 || vatRateValue > 100) {
        req.session.error = 'Please enter a valid VAT rate between 0 and 100';
        req.session.success = null;
        return res.redirect('/profile');
      }
    }

    // Validate social media URLs if provided
    const isValidUrl = (url) => {
      if (!url) return true;
      try {
        new URL(url);
        return true;
      } catch (e) {
        return false;
      }
    };

    if (facebook && !isValidUrl(facebook)) {
      req.session.error = 'Please enter a valid Facebook URL';
      req.session.success = null;
      return res.redirect('/profile');
    }
    if (instagram && !isValidUrl(instagram)) {
      req.session.error = 'Please enter a valid Instagram URL';
      req.session.success = null;
      return res.redirect('/profile');
    }
    if (twitter && !isValidUrl(twitter)) {
      req.session.error = 'Please enter a valid Twitter URL';
      req.session.success = null;
      return res.redirect('/profile');
    }

    // Prepare the update data object
    const updateData = {
      firstName: firstName || admin.firstName,
      lastName: lastName || admin.lastName,
      businessName: businessName || admin.businessName,
      currency: currency || admin.currency,
      country: country || admin.country,
      phone: phone || admin.phone,
      email: email || admin.email,
      address: address || admin.address,
      facebook: facebook || admin.facebook || null,
      instagram: instagram || admin.instagram || null,
      twitter: twitter || admin.twitter || null,
      publicPhone: publicPhone === 'on',
      publicEmail: publicEmail === 'on',
      publicAddress: publicAddress === 'on',
      // VAT settings
      applyVat: applyVat === 'on',
      vatRate: applyVat === 'on' ? parseFloat(vatRate) : (admin.vatRate || 0),
      updatedAt: new Date()
    };

    // Handle logo update (existing code remains the same)
    if (req.file) {
      if (admin.logo) {
        const oldLogoPath = path.join(__dirname, 'public', admin.logo);
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
        }
      }
      updateData.logo = `/uploads/${req.file.filename}`;
    } else if (croppedImageData) {
      const base64Data = croppedImageData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const username = req.session.admin || 'unknown';
      const timestamp = Date.now();
      const filename = `logo-${username}-${timestamp}.png`;
      const filePath = path.join(uploadsDir, filename);

      if (admin.logo) {
        const oldLogoPath = path.join(__dirname, 'public', admin.logo);
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
        }
      }

      fs.writeFileSync(filePath, buffer);
      updateData.logo = `/uploads/${filename}`;
    }

    // Prepare bank account updates (existing code remains the same)
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

    // Update session with new logo if changed
    if (updateData.logo) {
      req.session.adminLogo = updateData.logo;
    }

    req.session.success = 'Profile updated successfully!';
    req.session.error = null;
    res.redirect('/profile');
  } catch (error) {
    console.error('Error updating profile:', error);
    req.session.error = 'Failed to update profile. Please try again.';
    req.session.success = null;
    res.redirect('/profile');
  }
});

// Helper function to validate URLs
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (err) {
    return false;
  }
}

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

app.post('/delete-outlet', isAuthenticated, async (req, res) => {
  try {
    const adminId = req.session.adminId;
    const outletId = req.body._id;

    // Validate input
    if (!ObjectId.isValid(outletId)) {
      console.error('Invalid outlet ID:', outletId);
      return res.redirect('/home?error=Invalid outlet ID');
    }

    // Fetch admin
    const admin = await db.collection('admins').findOne({ _id: new ObjectId(adminId) });
    if (!admin) {
      console.error('Admin not found for ID:', adminId);
      return res.redirect('/home?error=Admin not found');
    }

    // Fetch outlet and verify ownership
    const outlet = await db.collection('outlets').findOne({ 
      _id: new ObjectId(outletId), 
      adminId: new ObjectId(adminId) 
    });
    if (!outlet) {
      console.error('Outlet not found or not owned by admin:', outletId, adminId);
      return res.redirect('/home?error=Outlet not found or unauthorized');
    }

    // Start transaction for atomicity
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        // Delete outlet
        const deleteResult = await db.collection('outlets').deleteOne(
          { _id: new ObjectId(outletId) },
          { session }
        );
        if (deleteResult.deletedCount === 0) {
          throw new Error('Failed to delete outlet');
        }

        // Optionally clean up related data
        // Delete pending commissions
        await db.collection('commissions').deleteMany(
          { outletId: new ObjectId(outletId), status: 'pending' },
          { session }
        );

        // Note: Sales and transactions are not deleted to preserve history
        // If you want to delete them, add:
        // await db.collection('sales').deleteMany({ outletId: new ObjectId(outletId) }, { session });
        // await db.collection('transactions').deleteMany({ outletId: new ObjectId(outletId) }, { session });
      });

      console.log(`Outlet deleted: ${outletId} by admin ${admin.username}`);
      res.redirect('/home?success=Outlet deleted successfully');
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error('Error deleting outlet:', error);
    res.redirect(`/home?error=Failed to delete outlet: ${encodeURIComponent(error.message)}`);
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
            stock: qty,
            cost: item.cost // Add the cost field from the admin's inventory
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

app.get('/outlet/:outletUsername', async (req, res) => {
  try {
    const outletUsername = req.params.outletUsername;
    const saleId = req.query.saleId; // Optional for confirmation page

    // Fetch outlet by username (case-insensitive)
    const outlet = await db.collection('outlets').findOne({ 
      username: { $regex: `^${outletUsername}$`, $options: 'i' }
    });
    if (!outlet) {
      return res.status(404).render('404', { message: 'Outlet store not found' });
    }

    // Redirect to correct case if mismatch
    if (outlet.username !== outletUsername) {
      console.log(`Case mismatch: redirecting to ${outlet.username}`);
      return res.redirect(`/outlet/${encodeURIComponent(outlet.username)}`);
    }

    // Fetch the associated admin for branding and currency
    const admin = await db.collection('admins').findOne({ _id: outlet.adminId });
    if (!admin) {
      return res.status(404).render('404', { message: 'Associated admin not found' });
    }

    // Fetch sale details if saleId is provided
    let sale = null;
    if (saleId && ObjectId.isValid(saleId)) {
      sale = await db.collection('sales').findOne({
        _id: new ObjectId(saleId),
        outletId: outlet._id,
        source: 'outlet-storefront'
      });
    }

    // Use outlet's inventory directly
    const inventory = outlet.inventory ? outlet.inventory.filter(item => item.stock > 0) : [];

    // Normalize phone number for WhatsApp
    let whatsappNumber = '';
    if ((outlet.phone || admin.phone) && (outlet.publicPhone || admin.publicPhone)) {
      // Prefer outlet.phone, fallback to admin.phone
      let phone = (outlet.phone || admin.phone).replace(/\D/g, '');
      
      if (!phone.startsWith('+')) {
        let countryCode = '+234'; // Default to Nigeria
        const country = outlet.country || admin.country;
        if (country) {
          try {
            const countryData = countryCodes.byIso(country) || countryCodes.byCountry(country);
            if (countryData && countryData.countryCallingCodes && countryData.countryCallingCodes.length > 0) {
              countryCode = countryData.countryCallingCodes[0].replace(/\D/g, '');
              countryCode = '+' + countryCode;
            } else {
              console.warn(`No country code found for country: ${country}, defaulting to +234`);
            }
          } catch (error) {
            console.warn(`Error parsing country: ${country}, defaulting to +234`, error.message);
          }
        }
        phone = phone.replace(/^0+/, '');
        whatsappNumber = countryCode + phone;
      } else {
        whatsappNumber = '+' + phone;
      }

      if (whatsappNumber.length < 10 || whatsappNumber.length > 15) {
        console.warn(`Invalid WhatsApp number generated for outlet ${outlet.username}: ${whatsappNumber}`);
        whatsappNumber = '';
      }
    }

    // Define getSocialHandle function
    const getSocialHandle = (url, platform) => {
      try {
        if (!url) return 'N/A';
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        let handle = path.split('/').filter(segment => segment).pop() || 'N/A';
        if (platform === 'twitter') {
          handle = '@' + handle;
        }
        return handle;
      } catch (e) {
        console.error(`Error parsing ${platform} URL:`, e);
        return 'N/A';
      }
    };

    // Define formatCurrency function
    const formatCurrency = (amount) => {
      if (!amount) return '0.00';
      return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Get host for store URL
    const host = process.env.BASE_URL || req.get('host') || 'localhost:3000';

    const templateData = {
      outlet,
      admin,
      inventory,
      currency: admin.currency || '₦',
      whatsappNumber,
      host,
      formatCurrency,
      getSocialHandle
    };

    if (sale) {
      Object.assign(templateData, {
        saleId: sale._id,
        customerName: sale.customerName,
        phoneNumber: sale.phoneNumber,
        email: sale.email,
        saleItems: sale.items,
        totalAmount: sale.totalAmount,
        invoiceUrl: `/outlet/${encodeURIComponent(outlet.username)}/confirmation/${sale._id}?token=${req.query.token}&format=pdf`,
        paymentInstructions: admin.paymentInstructions
      });
    }

    res.render('storefront', templateData);
  } catch (error) {
    console.error('Error rendering outlet storefront:', error);
    res.status(500).render('500', {
      message: 'Error loading outlet store',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
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

app.post('/superadmin/edit-admin/:id', isAuthenticated, isSuperAdmin, uploadLogo, async (req, res) => {
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
    let totalVatAmount = 0;
    let subtotalAmount = 0;

    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const qty = parseInt(quantities[i]);
      if (isNaN(qty)) return res.status(400).send(`Invalid quantity for item ${itemId}.`);
      const objectId = new ObjectId(itemId);
      const item = await db.collection('inventory').findOne({ _id: objectId, adminId: admin._id });
      if (!item) return res.status(404).send(`Item with ID ${itemId} not found in inventory.`);
      if (item.stock < qty || qty <= 0) return res.status(400).send(`Invalid quantity or insufficient stock for ${item.name}.`);
      
      const unitCost = item.cost;
      const totalCost = unitCost * qty;
      
      // Calculate VAT if applicable
      let vatAmount = 0;
      let vatRate = 0;
      let isVatable = false;
      
      if (admin.applyVat && item.isVatable) {
        vatRate = admin.vatRate || 0;
        vatAmount = (totalCost * vatRate) / 100;
        isVatable = true;
        totalVatAmount += vatAmount;
      }
      
      const itemTotalWithVat = totalCost + vatAmount;
      
      saleItems.push({ 
        itemId: objectId, 
        itemName: item.name, 
        quantity: qty, 
        unitCost: unitCost,
        totalCost: totalCost,
        isVatable: isVatable,
        vatRate: vatRate,
        vatAmount: vatAmount,
        itemTotalWithVat: itemTotalWithVat
      });
      
      subtotalAmount += totalCost;
      totalOrderAmount += itemTotalWithVat;
    }

    res.render('confirm-transaction', {
      username: req.session.admin,
      admin,
      customerName,
      phoneNumber: phoneNumber || 'N/A',
      email: email || 'N/A',
      saleItems,
      subtotalAmount,
      totalVatAmount,
      totalOrderAmount,
      paymentMethod,
      currency: admin.currency || '$',
      formatCurrency,
      // Helper functions for the template
      calculateVat: (price, vatRate) => (price * vatRate) / 100,
      getPriceWithVat: (price, vatRate) => price + ((price * vatRate) / 100)
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
  try {
    const { customerName, phoneNumber, email, saleItems, totalOrderAmount, paymentMethod } = req.body;

    // Validation
    const missingFields = [];
    if (!customerName) missingFields.push('customerName');
    if (!saleItems) missingFields.push('saleItems');
    if (!totalOrderAmount) missingFields.push('totalOrderAmount');
    if (!paymentMethod) missingFields.push('paymentMethod');
    if (missingFields.length > 0) {
      console.log('Missing fields:', missingFields, 'Form data:', req.body);
      return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
    }

    // Validate email if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate phone if provided
    if (phoneNumber && !/^\+?[\d\s-]{6,}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Parse and validate saleItems
    let parsedSaleItems;
    try {
      parsedSaleItems = Array.isArray(saleItems) ? saleItems : JSON.parse(saleItems);
      if (!Array.isArray(parsedSaleItems)) throw new Error('Invalid sale items format');
    } catch (err) {
      console.error('Sale items parse error:', err, 'saleItems:', saleItems);
      return res.status(400).json({ error: 'Invalid sale items data' });
    }

    if (parsedSaleItems.length === 0) {
      return res.status(400).json({ error: 'No items in sale' });
    }

    for (const item of parsedSaleItems) {
      if (!item.itemId || !item.quantity || !item.unitCost) {
        return res.status(400).json({ error: 'Invalid sale item format' });
      }
      if (item.quantity <= 0) {
        return res.status(400).json({ error: `Invalid quantity for ${item.itemName || 'item'}` });
      }
      if (!ObjectId.isValid(item.itemId)) {
        return res.status(400).json({ error: `Invalid item ID: ${item.itemId}` });
      }
    }

    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Start transaction
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        // Update inventory
        for (const item of parsedSaleItems) {
          const inventoryItem = await db.collection('inventory').findOne(
            { _id: new ObjectId(item.itemId), adminId: admin._id },
            { session }
          );
          if (!inventoryItem) {
            throw new Error(`Item not found: ${item.itemName || item.itemId}`);
          }
          if (inventoryItem.stock < item.quantity) {
            throw new Error(`Insufficient stock for ${inventoryItem.name}`);
          }
          await db.collection('inventory').updateOne(
            { _id: new ObjectId(item.itemId) },
            { $inc: { stock: -item.quantity } },
            { session }
          );
        }

        // Store customer
        const customer = {
          adminId: admin._id,
          name: customerName.trim(),
          phone: phoneNumber ? phoneNumber.trim() : 'N/A',
          email: email ? email.trim().toLowerCase() : 'N/A',
          createdAt: new Date()
        };
        const customerResult = await db.collection('customers').insertOne(customer, { session });

        // Record sale
        const sale = {
          adminId: admin._id,
          customerId: customerResult.insertedId,
          customerName: customerName.trim(),
          phoneNumber: phoneNumber ? phoneNumber.trim() : 'N/A',
          email: email ? email.trim().toLowerCase() : 'N/A',
          items: parsedSaleItems.map(item => ({
            itemId: new ObjectId(item.itemId),
            itemName: item.itemName || 'Unknown',
            quantity: item.quantity,
            unitCost: parseFloat(item.unitCost),
            totalCost: parseFloat(item.unitCost) * item.quantity
          })),
          totalAmount: parseFloat(totalOrderAmount),
          paymentMethod: paymentMethod || 'N/A',
          paymentStatus: 'Confirmed',
          date: new Date(),
          source: 'pos', // Added for filtering
          status: 'completed'
        };
        const result = await db.collection('sales').insertOne(sale, { session });

        res.redirect(`/sale-success/${result.insertedId}`);
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error('Error confirming sale:', error.message, error.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.get('/sale-success/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) return res.status(404).send('Sale not found.');
    res.render('sale-success', { sale, admin, username: req.session.admin, saleId });
  } catch (error) {
    console.error('Error loading sale success page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/send-receipt-email/:saleId', isAuthenticated, async (req, res) => {
  try {
    const saleId = req.params.saleId;
    const { email } = req.body;
    if (!email) {
      req.flash('error', 'Recipient email is required.');
      return res.redirect(`/sale-success/${saleId}`);
    }

    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      req.flash('error', 'Admin not found.');
      return res.redirect(`/sale-success/${saleId}`);
    }

    const sale = await db.collection('sales').findOne({ _id: new ObjectId(saleId), adminId: admin._id });
    if (!sale) {
      req.flash('error', 'Sale not found.');
      return res.redirect(`/sale-success/${saleId}`);
    }

    const doc = new PDFDocument({ margin: 50 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', async () => {
      const pdfData = Buffer.concat(buffers);

      const mailOptions = {
        from: process.env.EMAIL_USER, // Use authenticated email (stanley@shed.ng)
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
          <p>The Business Team</p>
          <a href="https://shed.ng">Shed: Sell Everywhere. Manage Everything</a>
        `,
        attachments: [
          {
            filename: `receipt-${saleId}.pdf`,
            content: pdfData,
            contentType: 'application/pdf'
          }
        ]
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log('Receipt email sent to:', email);
        req.flash('success', 'Receipt email sent successfully.');
        res.redirect(`/sale-success/${saleId}`);
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        req.flash('error', 'Failed to send receipt email. Please try again.');
        res.redirect(`/sale-success/${saleId}`);
      }
    });

    doc.fontSize(10).text('Shed: Sell Anywhere, Manage Everything', 50, 30, { align: 'center' });
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
    doc.fontSize(10).text('Shed: Sell Anywhere, Manage Everything', 50, footerY + 10, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error sending receipt email:', error);
    req.flash('error', 'An unexpected error occurred while sending the receipt. Please try again.');
    res.redirect(`/sale-success/${saleId}`);
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
      doc.fontSize(10).text('Shed: Sell Anywhere, Manage Everything', 50, footerY + 10, { align: 'center' });
    };

    doc.fontSize(10).text('Shed: Sell Anywhere, Manage Everything', 50, 30, { align: 'center' });
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
      businessName: admin?.businessName || 'Shed',
      currency: admin?.currency || '$'
    },
    formatCurrency,
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
    res.render('outlet-details', { 
      outlet, 
      admin, 
      username: req.session.admin,
      error: null, // Add default value
      success: null // Add default value
    });
  } catch (err) {
    console.error('Error in /outlet-details/:outletId:', err.message, err.stack);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/landing', (req, res) => {
  res.render('landing', { admin: { currency: '$' } }); // Default currency for display
});

const rateLimit = require('express-rate-limit');

const subscribeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: 'Too many subscription attempts from this IP, please try again later'
});


// Add this route to your Express server
app.post('/api/subscribe', subscribeLimiter, express.json(), async (req, res) => {
  try {
      const { email } = req.body;
      
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ message: 'Please provide a valid email address' });
      }

      const subscriptionsCollection = db.collection('subscriptions');
      const existingSubscriber = await subscriptionsCollection.findOne({ email });
      
      if (existingSubscriber) {
          return res.status(409).json({ message: 'This email is already subscribed' });
      }

      await subscriptionsCollection.insertOne({
          email,
          subscribedAt: new Date(),
          source: 'landing_page',
          active: true
      });

      res.status(201).json({ message: 'Subscription successful' });
  } catch (error) {
      console.error('Subscription error:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
});



// Search results page route - UPDATED VERSION
app.get('/search', async (req, res) => {
  try {
    // SAFE: Check if req.query exists first
    const query = (req.query && req.query.q) ? String(req.query.q).trim() : '';
    const type = (req.query && req.query.type) ? String(req.query.type) : 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    console.log('🔍 Search request received:', { query, type, page });

    let stores = [];
    let products = [];
    let totalStores = 0;
    let totalProducts = 0;
    let totalResults = 0;

    if (query && query.length > 0) {
      // DEBUG: First check what stores exist
      console.log('📊 DEBUG: Checking database for any stores...');
      const allStoresCount = await db.collection('admins').countDocuments({});
      console.log('📊 Total stores in database:', allStoresCount);
      
      if (allStoresCount > 0) {
        const sampleStores = await db.collection('admins')
          .find({})
          .limit(5)
          .project({ businessName: 1, username: 1, active: 1, description: 1 })
          .toArray();
        console.log('📝 Sample stores:', JSON.stringify(sampleStores, null, 2));
      }

      // Search for stores
      if (type === 'all' || type === 'stores') {
        try {
          console.log('🔍 Searching stores with query:', query);
          
          // FIRST: Try without active filter to see what matches
          const storeQueryNoActive = {
            $or: [
              { businessName: { $regex: query, $options: 'i' } },
              { username: { $regex: query, $options: 'i' } },
              { description: { $regex: query, $options: 'i' } }
            ]
          };
          
          console.log('📋 Store query (without active filter):', JSON.stringify(storeQueryNoActive, null, 2));
          
          // Check count without active filter
          const totalWithoutActive = await db.collection('admins').countDocuments(storeQueryNoActive);
          console.log('📊 Stores found without active filter:', totalWithoutActive);
          
          // Now try with active filter (but check if stores have active field)
          const storeQuery = {
            $or: [
              { businessName: { $regex: query, $options: 'i' } },
              { username: { $regex: query, $options: 'i' } },
              { description: { $regex: query, $options: 'i' } }
            ]
            // Removed: active: true
          };
          
          // If you want to include active filter, check if stores actually have this field
          // First, see if any stores have active field
          const hasActiveField = await db.collection('admins').countDocuments({ active: { $exists: true } });
          console.log('📊 Stores with "active" field:', hasActiveField);
          
          if (hasActiveField > 0) {
            // Some stores have active field, add it to query
            storeQuery.active = true;
            console.log('✅ Adding active: true to query');
          } else {
            console.log('ℹ️ No stores have "active" field, skipping this filter');
          }

          console.log('📋 Final store query:', JSON.stringify(storeQuery, null, 2));
          
          totalStores = await db.collection('admins').countDocuments(storeQuery);
          console.log('✅ Found', totalStores, 'stores for query:', query);
          
          if (totalStores > 0) {
            stores = await db.collection('admins')
              .find(storeQuery)
              .project({
                _id: 1,
                businessName: 1,
                username: 1,
                logo: 1,
                description: 1,
                createdAt: 1,
                location: 1,
                phone: 1,
                email: 1,
                active: 1 // Include for debugging
              })
              .sort({ createdAt: -1 })
              .skip(type === 'stores' ? skip : 0)
              .limit(type === 'stores' ? limit : 10)
              .toArray();
            
            console.log('📦 Retrieved stores:', stores.length);
            stores.forEach((store, i) => {
              console.log(`  ${i + 1}. ${store.businessName} (@${store.username}) - active: ${store.active}`);
            });
          }
        } catch (dbError) {
          console.error('❌ Error fetching stores:', dbError.message, dbError.stack);
        }
      }

      // Search for products
      if (type === 'all' || type === 'products') {
        try {
          console.log('🔍 Searching products with query:', query);
          
          const productQuery = {
            $or: [
              { name: { $regex: query, $options: 'i' } },
              { description: { $regex: query, $options: 'i' } },
              { category: { $regex: query, $options: 'i' } }
            ]
          };

          totalProducts = await db.collection('inventory').countDocuments(productQuery);
          console.log('📊 Found', totalProducts, 'products for query:', query);
          
          if (totalProducts > 0) {
            products = await db.collection('inventory')
              .aggregate([
                {
                  $match: productQuery
                },
                {
                  $lookup: {
                    from: 'admins',
                    localField: 'adminId',
                    foreignField: '_id',
                    as: 'store'
                  }
                },
                {
                  $unwind: {
                    path: '$store',
                    preserveNullAndEmptyArrays: true // Changed to true to see if lookup is failing
                  }
                },
                // REMOVE the active filter or make it optional
                // {
                //   $match: {
                //     'store.active': true
                //   }
                // },
                {
                  $project: {
                    _id: 1,
                    name: 1,
                    description: 1,
                    cost: 1,
                    image: 1,
                    stock: 1,
                    category: 1,
                    commission: 1,
                    createdAt: 1,
                    storeName: '$store.businessName',
                    storeUsername: '$store.username',
                    storeLogo: '$store.logo',
                    storeLocation: '$store.location',
                    storeActive: '$store.active' // Include for debugging
                  }
                },
                {
                  $sort: { createdAt: -1 }
                },
                {
                  $skip: type === 'products' ? skip : 0
                },
                {
                  $limit: type === 'products' ? limit : 12
                }
              ])
              .toArray();
            
            console.log('📦 Retrieved products:', products.length);
            products.forEach((product, i) => {
              console.log(`  ${i + 1}. ${product.name} - store: ${product.storeName} (active: ${product.storeActive})`);
            });
          }
        } catch (dbError) {
          console.error('❌ Error fetching products:', dbError.message, dbError.stack);
        }
      }
    }

    // Calculate totals
    totalResults = totalStores + totalProducts;
    const totalPages = type === 'all' ? 1 : Math.ceil((type === 'stores' ? totalStores : totalProducts) / limit);

    console.log('📊 Final counts:', {
      query,
      totalStores,
      totalProducts,
      totalResults,
      storesFound: stores.length,
      productsFound: products.length
    });

    // Helper functions
    const formatCurrency = (amount) => {
      if (!amount && amount !== 0) return '₦0.00';
      return `₦${parseFloat(amount).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;
    };

    const formatDate = (date) => {
      if (!date) return '';
      try {
        return new Date(date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      } catch (e) {
        return '';
      }
    };

    const truncateText = (text, length = 100) => {
      if (!text) return '';
      return text.length > length ? text.substring(0, length) + '...' : text;
    };

    // ALWAYS pass error variable (even if null)
    const templateData = {
      query,
      type,
      stores,
      products,
      totalStores,
      totalProducts,
      totalResults,
      page,
      totalPages,
      limit,
      error: null,
      formatCurrency,
      formatDate,
      truncateText
    };

    console.log('🎯 Rendering search results with', stores.length, 'stores and', products.length, 'products');
    res.render('search-results', templateData);

  } catch (error) {
    console.error('💥 Error in search route:', error);
    
    // Render error with safe defaults - ALWAYS include error variable
    res.status(500).render('search-results', {
      query: req.query?.q || '',
      type: req.query?.type || 'all',
      stores: [],
      products: [],
      totalStores: 0,
      totalProducts: 0,
      totalResults: 0,
      page: 1,
      totalPages: 1,
      error: 'An error occurred while searching. Please try again.',
      formatCurrency: (amount) => `₦${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      formatDate: (date) => date ? new Date(date).toLocaleDateString() : '',
      truncateText: (text) => text ? (text.length > 100 ? text.substring(0, 100) + '...' : text) : ''
    });
  }
});

// Add this debug endpoint to check database directly
app.get('/api/debug/search-test', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.json({ error: 'Please provide a query parameter' });
    }
    
    console.log('🧪 Debug search test for query:', query);
    
    // Test 1: Direct MongoDB search
    const directSearch = await db.collection('admins')
      .find({
        $or: [
          { businessName: { $regex: query, $options: 'i' } },
          { username: { $regex: query, $options: 'i' } }
        ]
      })
      .project({ businessName: 1, username: 1, active: 1 })
      .limit(10)
      .toArray();
    
    // Test 2: Check field existence
    const fieldStats = {
      hasActiveField: await db.collection('admins').countDocuments({ active: { $exists: true } }),
      activeTrue: await db.collection('admins').countDocuments({ active: true }),
      activeFalse: await db.collection('admins').countDocuments({ active: false }),
      activeNull: await db.collection('admins').countDocuments({ active: null }),
      totalStores: await db.collection('admins').countDocuments({})
    };
    
    res.json({
      success: true,
      query,
      directSearch,
      fieldStats,
      directSearchCount: directSearch.length
    });
    
  } catch (error) {
    console.error('Debug search test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Quick fix: Add active field to all existing stores if missing
app.get('/api/fix/activate-stores', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    const result = await db.collection('admins').updateMany(
      { active: { $exists: false } },
      { $set: { active: true } }
    );
    
    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} stores with active: true`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error activating stores:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug version of suggestions API
app.get('/api/search/suggestions', async (req, res) => {
  try {
    const query = (req.query && req.query.q) ? String(req.query.q).trim() : '';
    const type = (req.query && req.query.type) ? String(req.query.type) : 'all';
    
    console.log('🚀 Suggestions API DEBUG - Query:', { query, type });
    
    if (!query || query.length < 2) {
      console.log('❌ Query too short');
      return res.json([]);
    }

    let suggestions = [];

    // First, let's debug the database connection
    console.log('🔍 Database check:', {
      hasDb: !!db,
      hasCollection: db ? !!db.collection : false
    });

    // Search stores
    if (type === 'all' || type === 'stores') {
      try {
        console.log('🔍 Searching stores with query:', query);
        
        // Try without active filter first
        const storeQuery = {
          $or: [
            { businessName: { $regex: query, $options: 'i' } },
            { username: { $regex: query, $options: 'i' } }
          ]
        };

        console.log('📋 Store query:', JSON.stringify(storeQuery, null, 2));
        
        // Check how many total stores exist
        const totalStores = await db.collection('admins').countDocuments({});
        console.log('📊 Total stores in database:', totalStores);
        
        // Get sample of stores to see what's in the database
        const sampleStores = await db.collection('admins')
          .find({})
          .limit(5)
          .project({ businessName: 1, username: 1, active: 1 })
          .toArray();
        
        console.log('📝 Sample stores:', sampleStores);
        
        // Now run the actual search
        const stores = await db.collection('admins')
          .find(storeQuery)
          .project({
            _id: 1,
            businessName: 1,
            username: 1,
            logo: 1
          })
          .limit(5)
          .toArray();
        
        console.log('✅ Stores found:', stores.length, 'Details:', stores);
        
        stores.forEach(store => {
          suggestions.push({
            type: 'store',
            id: store._id.toString(),
            name: store.businessName,
            username: store.username,
            logo: store.logo,
            url: `/store/${store.username}`
          });
        });
      } catch (storeError) {
        console.error('❌ Error fetching store suggestions:', storeError.message, storeError.stack);
      }
    }

    // Search products
    if (type === 'all' || type === 'products') {
      try {
        console.log('🔍 Searching products with query:', query);
        
        const productQuery = {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } }
          ]
        };

        // First, check total products
        const totalProducts = await db.collection('inventory').countDocuments({});
        console.log('📊 Total products in database:', totalProducts);
        
        // Get sample products
        const sampleProducts = await db.collection('inventory')
          .find({})
          .limit(3)
          .project({ name: 1, description: 1 })
          .toArray();
        
        console.log('📝 Sample products:', sampleProducts);
        
        const products = await db.collection('inventory')
          .aggregate([
            {
              $match: productQuery
            },
            {
              $lookup: {
                from: 'admins',
                localField: 'adminId',
                foreignField: '_id',
                as: 'store'
              }
            },
            {
              $unwind: {
                path: '$store',
                preserveNullAndEmptyArrays: true
              }
            },
            {
              $project: {
                _id: 1,
                name: 1,
                cost: 1,
                image: 1,
                storeName: '$store.businessName',
                storeUsername: '$store.username',
                storeLogo: '$store.logo'
              }
            },
            {
              $limit: 5
            }
          ])
          .toArray();
        
        console.log('✅ Products found:', products.length, 'Details:', products);
        
        products.forEach(product => {
          suggestions.push({
            type: 'product',
            id: product._id.toString(),
            name: product.name,
            price: product.cost,
            image: product.image,
            storeName: product.storeName,
            storeUsername: product.storeUsername,
            storeLogo: product.storeLogo,
            url: `/store/${product.storeUsername}?product=${product._id.toString()}`
          });
        });
      } catch (productError) {
        console.error('❌ Error fetching product suggestions:', productError.message, productError.stack);
      }
    }

    // Limit total suggestions
    suggestions = suggestions.slice(0, 8);
    
    console.log('🎯 Final suggestions to return:', suggestions.length, suggestions);
    res.json(suggestions);
  } catch (error) {
    console.error('💥 Error in suggestions API:', error.message, error.stack);
    res.status(500).json([]);
  }
});

// Add this test endpoint to check database directly
app.get('/api/debug/stores', async (req, res) => {
  try {
    const stores = await db.collection('admins')
      .find({})
      .project({
        _id: 1,
        businessName: 1,
        username: 1,
        active: 1,
        email: 1,
        createdAt: 1
      })
      .limit(20)
      .toArray();
    
    res.json({
      success: true,
      count: stores.length,
      stores: stores.map(s => ({
        id: s._id.toString(),
        businessName: s.businessName,
        username: s.username,
        active: s.active,
        email: s.email,
        createdAt: s.createdAt
      }))
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/debug/products', async (req, res) => {
  try {
    const products = await db.collection('inventory')
      .find({})
      .project({
        _id: 1,
        name: 1,
        cost: 1,
        stock: 1,
        adminId: 1,
        createdAt: 1
      })
      .limit(20)
      .toArray();
    
    res.json({
      success: true,
      count: products.length,
      products: products.map(p => ({
        id: p._id.toString(),
        name: p.name,
        cost: p.cost,
        stock: p.stock,
        adminId: p.adminId ? p.adminId.toString() : null,
        createdAt: p.createdAt
      }))
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Product search API - FIXED VERSION
app.get('/api/products/search', async (req, res) => {
  try {
    const query = req.query.q ? req.query.q.trim() : '';
    const type = req.query.type || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;
    
    console.log('Product search API called:', { query, type, page, limit });

    if (!query || query.length < 1) {
      return res.json({
        success: true,
        results: [],
        total: 0,
        page: 1,
        pages: 0
      });
    }

    // Build search query
    const searchQuery = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { category: { $regex: query, $options: 'i' } }
      ]
    };

    // Get total count
    const total = await db.collection('inventory').countDocuments(searchQuery);

    // Search products
    const products = await db.collection('inventory')
      .aggregate([
        {
          $match: searchQuery
        },
        {
          $lookup: {
            from: 'admins',
            localField: 'adminId',
            foreignField: '_id',
            as: 'store'
          }
        },
        {
          $unwind: {
            path: '$store',
            preserveNullAndEmptyArrays: false
          }
        },
        {
          $match: {
            'store.active': true
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            description: 1,
            cost: 1,
            image: { $ifNull: ['$images', []] },
            stock: 1,
            category: 1,
            commission: 1,
            createdAt: 1,
            storeName: '$store.businessName',
            storeUsername: '$store.username',
            storeLogo: '$store.logo',
            storeLocation: '$store.location',
            storeEmail: '$store.email',
            storePhone: '$store.phone'
          }
        },
        {
          $sort: { createdAt: -1 }
        },
        {
          $skip: skip
        },
        {
          $limit: limit
        }
      ])
      .toArray();

    // Transform results
    const results = products.map(product => ({
      id: product._id.toString(),
      name: product.name,
      description: product.description || '',
      price: product.cost || 0,
      image: Array.isArray(product.image) && product.image.length > 0 
        ? product.image[0] 
        : '/images/default-product.png',
      stock: product.stock || 0,
      category: product.category || '',
      store: {
        id: product._id.toString(),
        name: product.storeName,
        username: product.storeUsername,
        logo: product.storeLogo || '/images/logo.png',
        location: product.storeLocation || '',
        email: product.storeEmail || '',
        phone: product.storePhone || ''
      }
    }));

    res.json({
      success: true,
      results,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit
    });

  } catch (error) {
    console.error('Error in product search API:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      results: [],
      total: 0
    });
  }
});

// Store search API - ADD THIS NEW ENDPOINT
app.get('/api/stores/search', async (req, res) => {
  try {
    const query = req.query.q ? req.query.q.trim() : '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    console.log('Store search API called:', { query, page, limit });

    if (!query || query.length < 1) {
      return res.json({
        success: true,
        results: [],
        total: 0,
        page: 1,
        pages: 0
      });
    }

    // Build search query for stores
    const searchQuery = {
      $or: [
        { businessName: { $regex: query, $options: 'i' } },
        { username: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ],
      active: true
    };

    // Get total count
    const total = await db.collection('admins').countDocuments(searchQuery);

    // Search stores
    const stores = await db.collection('admins')
      .find(searchQuery)
      .project({
        _id: 1,
        businessName: 1,
        username: 1,
        logo: 1,
        description: 1,
        createdAt: 1,
        location: 1,
        phone: 1,
        email: 1,
        currency: 1,
        country: 1
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Get product counts for each store
    const results = await Promise.all(stores.map(async (store) => {
      const productCount = await db.collection('inventory').countDocuments({
        adminId: store._id,
        stock: { $gt: 0 }
      });

      return {
        id: store._id.toString(),
        name: store.businessName,
        username: store.username,
        logo: store.logo || '/images/logo.png',
        description: store.description || '',
        location: store.location || '',
        phone: store.phone || '',
        email: store.email || '',
        currency: store.currency || '₦',
        country: store.country || '',
        productCount,
        createdAt: store.createdAt,
        url: `/store/${store.username}`
      };
    }));

    res.json({
      success: true,
      results,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit
    });

  } catch (error) {
    console.error('Error in store search API:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      results: [],
      total: 0
    });
  }
});





const countryCodes = require('country-code-lookup'); // Add this dependency for country-to-phone-code mapping

app.get('/store/:adminUsername', async (req, res) => {
  try {
    const adminUsername = req.params.adminUsername;
    const saleId = req.query.saleId;

    const admin = await db.collection('admins').findOne({ 
      username: { $regex: `^${adminUsername}$`, $options: 'i' }
    });
    if (!admin) {
      return res.status(404).render('404', { message: 'Store not found' });
    }

    let sale = null;
    if (saleId && ObjectId.isValid(saleId)) {
      sale = await db.collection('sales').findOne({
        _id: new ObjectId(saleId),
        adminId: admin._id,
        source: 'storefront'
      });
    }

    const inventory = await db.collection('inventory')
      .find({ adminId: admin._id, stock: { $gt: 0 } })
      .toArray();

    // Normalize phone number for WhatsApp
    let whatsappNumber = '';
    if (admin.publicPhone && admin.phone) {
      // Remove non-digits
      let phone = admin.phone.replace(/\D/g, '');
      
      // Check if phone already includes a country code
      if (!phone.startsWith('+')) {
        let countryCode = '+234'; // Default to Nigeria
        if (admin.country) {
          try {
            // Try to map admin.country to country code
            const country = countryCodes.byIso(admin.country) || countryCodes.byCountry(admin.country);
            if (country && country.countryCallingCodes && country.countryCallingCodes.length > 0) {
              countryCode = country.countryCallingCodes[0].replace(/\D/g, ''); // e.g., "234"
              countryCode = '+' + countryCode; // Ensure '+' prefix
            } else {
              console.warn(`No country code found for admin.country: ${admin.country}, defaulting to +234`);
            }
          } catch (error) {
            console.warn(`Error parsing admin.country: ${admin.country}, defaulting to +234`, error.message);
            // Continue with default countryCode (+234)
          }
        }
        // Remove leading zeros and append country code
        phone = phone.replace(/^0+/, '');
        whatsappNumber = countryCode + phone;
      } else {
        // If phone already has a country code, use it as is
        whatsappNumber = '+' + phone;
      }

      // Validate whatsappNumber (basic check for length)
      if (whatsappNumber.length < 10 || whatsappNumber.length > 15) {
        console.warn(`Invalid WhatsApp number generated for admin ${admin.username}: ${whatsappNumber}`);
        whatsappNumber = ''; // Prevent invalid number from being used
      }
    }

    const getSocialHandle = (url, platform) => {
      try {
        if (!url) return 'N/A';
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        let handle = path.split('/').filter(segment => segment).pop() || 'N/A';
        if (platform === 'twitter') {
          handle = '@' + handle;
        }
        return handle;
      } catch (e) {
        console.error(`Error parsing ${platform} URL:`, e);
        return 'N/A';
      }
    };

    const formatCurrency = (amount) => {
      if (!amount) return '0.00';
      return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Get host for store URL (use environment variable or req.get('host'))
    const host = process.env.BASE_URL || req.get('host') || 'localhost:3000';

    const templateData = {
      admin,
      outlet: undefined,
      inventory,
      currency: admin.currency || '$',
      whatsappNumber,
      host, // Add host to templateData
      formatCurrency,
      getSocialHandle
    };

    if (sale) {
      Object.assign(templateData, {
        saleId: sale._id,
        customerName: sale.customerName,
        phoneNumber: sale.phoneNumber,
        email: sale.email,
        saleItems: sale.items,
        totalAmount: sale.totalAmount,
        invoiceUrl: `/store/${adminUsername}/confirmation/${sale._id}?token=${req.query.token}&format=pdf`,
        paymentInstructions: admin.paymentInstructions
      });
    }

    res.render('storefront', templateData);
  } catch (error) {
    console.error('Error rendering storefront:', error);
    res.status(500).render('500', {
      message: 'Error loading store',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

app.get('/store/:adminUsername/product/:productId', async (req, res) => {
  try {
    const { adminUsername, productId } = req.params;

    // Validate productId
    if (!ObjectId.isValid(productId)) {
      return res.status(404).render('404', { message: 'Product not found' });
    }

    // Find the admin (case-insensitive username)
    const admin = await db.collection('admins').findOne({
      username: { $regex: `^${adminUsername}$`, $options: 'i' }
    });
    if (!admin) {
      return res.status(404).render('404', { message: 'Store not found' });
    }

    // Find the product
    const product = await db.collection('inventory').findOne({
      _id: new ObjectId(productId),
      adminId: admin._id,
      stock: { $gt: 0 } // Only show products with stock
    });
    if (!product) {
      return res.status(404).render('404', { message: 'Product not found or out of stock' });
    }

    // Prepare template data
    const templateData = {
      admin,
      product,
      currency: admin.currency || '$',
      formatCurrency
    };

    res.render('product', templateData);
  } catch (error) {
    console.error('Error rendering product page:', error);
    res.status(500).render('500', {
      message: 'Error loading product page',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

const axios = require('axios');
const { countries } = require('country-data');


app.post('/store/:adminUsername/checkout', async (req, res) => {
  try {
    const adminUsername = req.params.adminUsername;
    const { customerName, phoneNumber, email, cartItems } = req.body;

    // Detailed validation
    const missingFields = [];
    if (!customerName) missingFields.push('customerName');
    if (!phoneNumber) missingFields.push('phoneNumber');
    if (!email) missingFields.push('email');
    if (!cartItems) missingFields.push('cartItems');
    
    if (missingFields.length > 0) {
      console.log('Missing fields:', missingFields, 'Form data:', req.body);
      return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate phone number
    if (!/^\+?[\d\s-]{6,}$/.test(phoneNumber)) {
      console.log('Invalid phone number:', phoneNumber);
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Check database connection
    if (!db || !db.collection) {
      throw new Error('Database connection not initialized');
    }

    const admin = await db.collection('admins').findOne({ username: adminUsername });
    if (!admin) {
      return res.status(404).json({ error: 'Store not found' });
    }

    let parsedCart;
    try {
      console.log('Raw cartItems received:', cartItems);
      parsedCart = JSON.parse(cartItems);
      if (!Array.isArray(parsedCart)) {
        throw new Error('Invalid cart items format');
      }
    } catch (err) {
      console.error('Cart items parse error:', err, 'cartItems:', cartItems);
      return res.status(400).json({ error: 'Invalid cart items data' });
    }

    if (parsedCart.length === 0) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    // Validate cart items
    for (const item of parsedCart) {
      if (!item.id || !item.quantity) {
        return res.status(400).json({ error: 'Invalid cart item format' });
      }
      if (item.quantity <= 0) {
        return res.status(400).json({ error: `Invalid quantity for ${item.name || 'item'}` });
      }
      if (!ObjectId.isValid(item.id)) {
        return res.status(400).json({ error: `Invalid item ID: ${item.id}` });
      }
    }

    // Start transaction
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        // Store customer
        const customer = {
          adminId: admin._id,
          name: customerName.trim(),
          phone: phoneNumber.trim(),
          email: email.trim().toLowerCase(),
          createdAt: new Date()
        };
        const customerResult = await db.collection('customers').insertOne(customer, { session });

        // Process sale items
        const saleItemsArray = [];
        let totalAmount = 0;
        
        for (const cartItem of parsedCart) {
          const item = await db.collection('inventory').findOne(
            { 
              _id: new ObjectId(cartItem.id),
              adminId: admin._id 
            },
            { session }
          );
          
          if (!item) {
            throw new Error(`Item not found: ${cartItem.name || cartItem.id}`);
          }
          
          if (item.stock < cartItem.quantity) {
            throw new Error(`Insufficient stock for ${item.name}`);
          }

          const totalCost = parseFloat(cartItem.cost || item.cost) * cartItem.quantity;
          saleItemsArray.push({
            itemId: item._id,
            itemName: item.name,
            quantity: cartItem.quantity,
            unitCost: parseFloat(cartItem.cost || item.cost),
            totalCost
          });
          totalAmount += totalCost;

          await db.collection('inventory').updateOne(
            { _id: item._id },
            { $inc: { stock: -cartItem.quantity } },
            { session }
          );
        }

        // Record sale
        const sale = {
          adminId: admin._id,
          customerId: customerResult.insertedId,
          customerName: customer.name,
          phoneNumber: customer.phone,
          email: customer.email,
          items: saleItemsArray,
          totalAmount,
          paymentMethod: 'Online',
          paymentStatus: 'Pending',
          date: new Date(),
          source: 'storefront',
          status: 'completed'
        };

        const saleResult = await db.collection('sales').insertOne(sale, { session });

        // Create transaction record
        const transaction = {
          adminId: admin._id,
          type: 'sale',
          amount: totalAmount,
          date: new Date(),
          description: `Online store sale #${saleResult.insertedId}`,
          reference: `SALE-${saleResult.insertedId}`,
          balanceImpact: 1 // Positive for sales revenue
        };
        await db.collection('transactions').insertOne(transaction, { session });
        console.log('Transaction recorded:', transaction.reference);

        // Generate temporary invoice token
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000; // 1 hour
        await db.collection('invoice_tokens').insertOne({
          saleId: saleResult.insertedId,
          token,
          expires
        }, { session });

        // Get or create System superadmin
        let systemAdmin = await db.collection('admins').findOne(
          { username: 'System', role: 'superadmin' },
          { session }
        );
        if (!systemAdmin) {
          systemAdmin = await db.collection('admins').insertOne(
            {
              username: 'System',
              email: 'system@shed.ng',
              password: 'N/A',
              role: 'superadmin',
              createdAt: new Date()
            },
            { session }
          );
          systemAdmin._id = systemAdmin.insertedId;
        }

        // Prepare notification content
        const itemsText = saleItemsArray
          .map(item => 
            `- ${item.itemName || 'N/A'}: ${item.quantity} x ${admin.currency || '$'}${parseFloat(item.unitCost || 0).toFixed(2)} = ${admin.currency}${parseFloat(item.totalCost || 0).toFixed(2)}`
          )
          .join('\n');
        const notificationText = `New Transaction Notification
A new transaction has been completed on your online store.

Transaction Details:
- Sale ID: ${saleResult.insertedId}
- Customer Name: ${customerName || 'N/A'}
- Customer Email: ${email || 'N/A'}
- Customer Phone: ${phoneNumber || 'N/A'}
- Date: ${new Date(sale.date).toLocaleString()}
- Total Amount: ${admin.currency || '$'}${parseFloat(totalAmount || 0).toFixed(2)}

Items Purchased:
${itemsText}

Payment Method: ${sale.paymentMethod || 'N/A'}
Payment Status: ${sale.paymentStatus || 'Pending'}

View full details in your dashboard: https://${process.env.BASE_URL || req.get('host')}/sales/${saleResult.insertedId}`;

        // Insert in-app notification
        const message = {
          senderId: systemAdmin._id,
          subject: `New Transaction: Sale #${saleResult.insertedId}`,
          content: `<pre>${notificationText}</pre>`,
          recipientId: admin._id,
          createdAt: new Date(),
          read: false,
          readAt: null,
          isHtml: true
        };
        await db.collection('messages').insertOne(message, { session });

        // Skip WhatsApp notification due to 133010 error
        console.warn(`WhatsApp notifications disabled for admin ${admin.username} due to unresolved Meta API error (133010). Please complete Meta WhatsApp setup.`);

        // Send customer email
        if (process.env.SENDGRID_API_KEY && typeof sendConfirmationEmail === 'function') {
          sendConfirmationEmail({
            to: email,
            saleId: saleResult.insertedId,
            customerName,
            totalAmount,
            currency: admin.currency || '$',
            businessName: admin.businessName || 'Our Store'
          }).catch(err => console.error('Customer email send error:', err));
        }

        // Send admin email
        if (admin.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email)) {
          const mailOptions = {
            from: process.env.BUSINESS_USER || 'stanley@shed.ng',
            to: admin.email,
            subject: `New Transaction on Your Store: Sale #${saleResult.insertedId}`,
            html: `
              <h1>New Transaction Notification</h1>
              <p>Dear ${admin.username || 'Store Owner'},</p>
              <p>A new transaction has been completed on your online store.</p>
              <h2>Transaction Details</h2>
              <ul>
                <li><strong>Sale ID:</strong> ${saleResult.insertedId}</li>
                <li><strong>Customer Name:</strong> ${customerName || 'N/A'}</li>
                <li><strong>Customer Email:</strong> ${customerName || 'N/A'}</li>
                <li><strong>Customer Phone:</strong> ${phoneNumber || 'N/A'}</li>
                <li><strong>Date:</strong> ${new Date(sale.date).toLocaleString()}</li>
                <li><strong>Total Amount:</strong> ${admin.currency || '$'}${parseFloat(totalAmount || 0).toFixed(2)}</li>
              </ul>
              <h3>Items Purchased</h3>
              <table style="border-collapse: collapse; width: 100%;">
                <thead>
                  <tr style="background-color: #f2f2f2;">
                    <th style="border: 1px solid #ddd; padding: 8px;">Item</th>
                    <th style="border: 1px solid #ddd; padding: 8px;">Quantity</th>
                    <th style="border: 1px solid #ddd; padding: 8px;">Unit Cost</th>
                    <th style="border: 1px solid #ddd; padding: 8px;">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  ${saleItemsArray.map(item => `
                    <tr>
                      <td style="border: 1px solid #ddd; padding: 8px;">${item.itemName || 'N/A'}</td>
                      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.quantity}</td>
                      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${admin.currency}${parseFloat(item.unitCost || 0).toFixed(2)}</td>
                      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${admin.currency}${parseFloat(item.totalCost || 0).toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <p><strong>Payment Method:</strong> ${sale.paymentMethod || 'N/A'}</p>
              <p><strong>Payment Status:</strong> ${sale.paymentStatus || 'Pending'}</p>
              <p>View full details in your dashboard: <a href="https://${process.env.BASE_URL || req.get('host')}/sales/${saleResult.insertedId}">Sale Details</a></p>
              <p>Best regards,</p>
              <p>The Shed Team</p>
              <p><a href="https://shed.ng">Shed: Sell Everywhere. Manage Everything</a></p>
            `
          };

          transporter.sendMail(mailOptions).catch(err => {
            console.error('Error sending notification email to store owner:', err);
          });
        } else {
          console.warn(`No valid email found for admin ${admin.username}, skipping notification email`);
        }

        // Return success
        const invoiceUrl = `/store/${adminUsername}/confirmation/${saleResult.insertedId}?token=${token}`;
        return res.json({ success: true, invoiceUrl });
      });
    } catch (err) {
      throw err;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error('Checkout error:', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      adminUsername: req.params.adminUsername
    });
    return res.status(500).json({ 
      error: 'Error processing your order',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


app.get('/store/:adminUsername/confirmation/:saleId', async (req, res) => {
  try {
    const { adminUsername, saleId } = req.params;
    const { token } = req.query;

    // Validate saleId
    if (!ObjectId.isValid(saleId)) {
      return res.status(400).json({ error: 'Invalid sale ID' });
    }

    // Check database connection
    if (!db || !db.collection) {
      console.error('Database not initialized');
      throw new Error('Database connection not initialized');
    }

    // Verify token
    const tokenEntry = await db.collection('invoice_tokens').findOne({ 
      saleId: new ObjectId(saleId), 
      token 
    });
    console.log('Token entry:', tokenEntry);
    if (!tokenEntry || tokenEntry.expires < Date.now()) {
      return res.status(403).json({ error: 'This confirmation link is invalid or has expired' });
    }

    // Fetch sale
    const sale = await db.collection('sales').findOne({ 
      _id: new ObjectId(saleId),
      source: 'storefront'
    });
    console.log('Sale:', sale);
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Fetch admin
    const admin = await db.collection('admins').findOne({ username: adminUsername });
    console.log('Admin:', admin);
    if (!admin) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Handle PDF request
    if (req.query.format === 'pdf') {
      if (typeof generatePDFInvoice === 'function') {
        return generatePDFInvoice(res, sale, admin);
      } else {
        console.error('generatePDFInvoice is not defined');
        return res.status(501).json({ error: 'PDF generation not implemented' });
      }
    }

    // Define formatCurrency
    const formatCurrency = (amount) => Number(amount).toFixed(2);

    // Render template
    console.log('Rendering template with data:', {
      saleId: sale._id,
      adminEmail: admin.email,
      email: sale.email,
      customerName: sale.customerName,
      saleItems: sale.items,
      totalAmount: sale.totalAmount,
      currency: admin.currency
    });
    res.render('storefront-confirmation', {
      saleId: sale._id,
      adminEmail: admin.email || 'N/A',
      email: sale.email || 'N/A',
      phoneNumber: sale.phoneNumber || 'N/A',
      admin,
      customerName: sale.customerName || 'N/A',
      saleItems: sale.items || [],
      totalAmount: sale.totalAmount || 0,
      currency: admin.currency || '$',
      formatCurrency,
      invoiceUrl: `/store/${adminUsername}/confirmation/${sale._id}?token=${token}&format=pdf`
    });

  } catch (error) {
    console.error('Confirmation error:', {
      message: error.message,
      stack: error.stack,
      adminUsername: req.params.adminUsername,
      saleId: req.params.saleId,
      query: req.query
    });
    return res.status(500).json({ 
      error: 'Error rendering confirmation',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Helper function to generate PDF invoice
async function generatePDFInvoice(res, sale, admin) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const filename = `invoice-${sale._id}.pdf`;

  res.setHeader('Content-disposition', `inline; filename="${filename}"`);
  res.setHeader('Content-type', 'application/pdf');
  doc.pipe(res);

  try {
    // Header
    doc.fontSize(10).text('Shed: Inventory, Invoices and More', 50, 30, { align: 'center' });
    doc.moveTo(50, 45).lineTo(550, 45).stroke();
    doc.moveDown(2);

    // Add logo if exists
    if (admin.logo && fs.existsSync(path.join(__dirname, 'public', admin.logo))) {
      try {
        doc.image(path.join(__dirname, 'public', admin.logo), 50, 60, { width: 100 });
        doc.moveDown(5);
      } catch (err) {
        console.error('Error loading logo:', err);
      }
    }

    // Invoice header
    doc.fontSize(20).text('INVOICE', { align: 'right' });
    doc.fontSize(10).text(`Invoice #: ${sale._id}`, { align: 'right' });
    doc.text(`Date: ${new Date(sale.date).toLocaleDateString()}`, { align: 'right' });
    doc.moveDown();

    // Business info
    doc.fontSize(12).text(admin.businessName || 'Business Name', { align: 'left' });
    if (admin.businessAddress) {
      doc.text(admin.businessAddress, { align: 'left' });
    }
    if (admin.businessPhone) {
      doc.text(`Phone: ${admin.businessPhone}`, { align: 'left' });
    }
    if (admin.email) {
      doc.text(`Email: ${admin.email}`, { align: 'left' });
    }
    doc.moveDown(2);

    // Customer info
    doc.fontSize(12).text('BILL TO:', { underline: true });
    doc.text(sale.customerName || 'Customer');
    doc.text(`Phone: ${sale.phoneNumber || 'N/A'}`);
    doc.text(`Email: ${sale.email || 'N/A'}`);
    doc.moveDown(2);

    // Items table
    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = [250, 80, 100, 100];
    const rowHeight = 20;

    doc.font('Helvetica-Bold');
    doc.text('Description', tableLeft, tableTop);
    doc.text('Qty', tableLeft + colWidths[0], tableTop, { width: colWidths[1], align: 'right' });
    doc.text('Unit Price', tableLeft + colWidths[0] + colWidths[1], tableTop, { width: colWidths[2], align: 'right' });
    doc.text('Amount', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop, { width: colWidths[3], align: 'right' });
    doc.moveTo(tableLeft, tableTop + 15).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), tableTop + 15).stroke();
    doc.font('Helvetica');

    // Table rows
    let y = tableTop + rowHeight;
    sale.items.forEach(item => {
      doc.text(item.itemName, tableLeft, y);
      doc.text(String(item.quantity), tableLeft + colWidths[0], y, { width: colWidths[1], align: 'right' });
      doc.text(`${admin.currency || '$'} ${formatCurrency(item.unitCost)}`, tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'right' });
      doc.text(`${admin.currency || '$'} ${formatCurrency(item.totalCost)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3], align: 'right' });
      y += rowHeight;
    });

    // Total
    doc.moveTo(tableLeft, y + 5).lineTo(tableLeft + colWidths.reduce((a, b) => a + b), y + 5).stroke();
    doc.font('Helvetica-Bold');
    doc.text('TOTAL', tableLeft + colWidths[0] + colWidths[1], y + 10, { width: colWidths[2], align: 'right' });
    doc.text(`${admin.currency || '$'} ${formatCurrency(sale.totalAmount)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y + 10, { width: colWidths[3], align: 'right' });
    doc.font('Helvetica');
    doc.moveDown(3);

    // Payment instructions
    if (admin.paymentInstructions) {
      doc.fontSize(12).text('PAYMENT INSTRUCTIONS:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).text(admin.paymentInstructions);
      doc.moveDown();
    }

    // Bank details (side by side)
    const hasBankDetails = admin.primaryAccount || admin.secondaryAccount;
    if (hasBankDetails) {
      doc.fontSize(12).text('BANK DETAILS:', { underline: true });
      doc.moveDown(0.5);
      const leftX = 50;
      const rightX = 300;
      const startY = doc.y;

      if (admin.primaryAccount) {
        doc.fontSize(10).font('Helvetica-Bold').text('Primary Account:', leftX, startY);
        doc.font('Helvetica');
        let y1 = doc.y;
        if (admin.primaryAccount.bankAccountName) {
          doc.text(`Account Name: ${admin.primaryAccount.bankAccountName}`, leftX, y1);
          y1 = doc.y;
        }
        if (admin.primaryAccount.accountNumber) {
          doc.text(`Account Number: ${admin.primaryAccount.accountNumber}`, leftX, doc.y);
          y1 = doc.y;
        }
        if (admin.primaryAccount.bankName) {
          doc.text(`Bank: ${admin.primaryAccount.bankName}`, leftX, doc.y);
        }
      }

      if (admin.secondaryAccount) {
        doc.fontSize(10).font('Helvetica-Bold').text('Secondary Account:', rightX, startY);
        doc.font('Helvetica');
        let y2 = startY + 12;
        if (admin.secondaryAccount.bankAccountName) {
          doc.text(`Account Name: ${admin.secondaryAccount.bankAccountName}`, rightX, y2);
          y2 = doc.y;
        }
        if (admin.secondaryAccount.accountNumber) {
          doc.text(`Account Number: ${admin.secondaryAccount.accountNumber}`, rightX, doc.y);
          y2 = doc.y;
        }
        if (admin.secondaryAccount.bankName) {
          doc.text(`Bank: ${admin.secondaryAccount.bankName}`, rightX, doc.y);
        }
      }

      doc.moveDown();
    }

    // Footer removed to prevent page overflow

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    if (!res.headersSent) {
      res.status(500).send('Error generating PDF invoice');
    }
    doc.end();
  }
}


// Helper function to send confirmation email
async function sendConfirmationEmail({ to, saleId, customerName, totalAmount, currency, businessName }) {
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const msg = {
    to,
    from: process.env.SENDGRID_FROM_EMAIL || 'no-reply@shed.ng',
    subject: `Your Order Confirmation from ${businessName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Thank you for your order, ${customerName}!</h2>
        <p>Your order #${saleId} has been received and is being processed.</p>
        
        <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Order Summary</h3>
          <p><strong>Order Number:</strong> ${saleId}</p>
          <p><strong>Total Amount:</strong> ${currency} ${formatCurrency(totalAmount)}</p>
        </div>
        
        <p>You can view and download your invoice by clicking the link below:</p>
        <p>
          <a href="${process.env.BASE_URL}/store/invoice/${saleId}" 
             style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px;">
            View Invoice
          </a>
        </p>
        
        <p>If you have any questions about your order, please reply to this email.</p>
        
        <p style="margin-top: 30px; font-size: 0.9em; color: #666;">
          &copy; ${new Date().getFullYear()} ${businessName}. All rights reserved.
        </p>
      </div>
    `
  };

  await sgMail.send(msg);
}

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

// Add this new route
app.get('/api/inventory', isAuthenticated, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const items = await db.collection('inventory')
      .find({ adminId: admin._id })
      .project({
        _id: 1,
        name: 1,
        cost: 1,
        stock: 1,
        isVatable: 1   // include if you're using this field
      })
      .sort({ name: 1 })
      .toArray();

    res.json({ items });
  } catch (err) {
    console.error('Error in /api/inventory:', err);
    res.status(500).json({ error: 'Server error while loading inventory' });
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
    const formData = req.session.formData || {
      items: {
        itemId: [],
        quantity: [],
        newProductName: [],
        newProductCost: [],
        newProductStock: []
      }
    };
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
      formData,
      getPaymentMethodIcon: getPaymentMethodIcon
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/invoices/create', isAuthenticated, async (req, res) => {
  // Extract and normalize form data
  const { 
    customerId: rawCustomerId, 
    newCustomerName, 
    newCustomerPhone, 
    newCustomerEmail, 
    items, 
    paymentMethod, 
    bankName, 
    bankAccountName, 
    accountNumber,
    additionalComments // NEW: Added additional comments field
  } = req.body;

  // Handle case where customerId might be an array
  const customerId = Array.isArray(rawCustomerId) ? rawCustomerId[0] : rawCustomerId;

  try {
    // Verify admin session
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      req.session.error = 'Admin not found. Please log in again.';
      await req.session.save();
      return res.redirect('/admin-login');
    }

    // Validate required fields
    if (!items || !paymentMethod) {
      req.session.error = 'Items and payment method are required.';
      req.session.formData = req.body;
      await req.session.save();
      return res.redirect('/invoices');
    }

    // Normalize items data (handle both single and multiple items)
    const itemIds = Array.isArray(items.itemId) ? items.itemId : [items.itemId];
    const quantities = Array.isArray(items.quantity) ? items.quantity : [items.quantity];
    const newProductNames = Array.isArray(items.newProductName) ? items.newProductName : [items.newProductName].filter(Boolean);
    const newProductCosts = Array.isArray(items.newProductCost) ? items.newProductCost : [items.newProductCost].filter(Boolean);
    const newProductStocks = Array.isArray(items.newProductStock) ? items.newProductStock : [items.newProductStock].filter(Boolean);

    // Validate items and quantities match
    if (itemIds.length !== quantities.length) {
      req.session.error = 'Mismatch between items and quantities.';
      req.session.formData = req.body;
      await req.session.save();
      return res.redirect('/invoices');
    }

    // Process each item with proper validation
    const saleItems = [];
    let totalOrderAmount = 0;
    let totalVatAmount = 0;
    let subtotalAmount = 0;

    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const qty = parseInt(quantities[i]);
      
      // Validate quantity
      if (isNaN(qty) || qty <= 0) {
        req.session.error = `Invalid quantity for item ${i+1}.`;
        req.session.formData = req.body;
        await req.session.save();
        return res.redirect('/invoices');
      }

      let item;
      
      // Handle both "new" and "new_12345" format for new products
      if ((itemId === 'new' || itemId.startsWith('new_')) && newProductNames[i] && newProductCosts[i] && newProductStocks[i]) {
        // Handle new product creation
        const cost = parseFloat(newProductCosts[i]) || 0;
        const stock = parseInt(newProductStocks[i]) || 0;
        
        if (cost <= 0 || stock < qty) {
          req.session.error = `Invalid cost or insufficient stock for new product "${newProductNames[i]}".`;
          req.session.formData = req.body;
          await req.session.save();
          return res.redirect('/invoices');
        }
        
        // Set isVatable based on admin's VAT settings
        // For new products in invoices, we'll assume they are vatable if admin applies VAT
        item = {
          adminId: admin._id,
          name: newProductNames[i],
          cost: cost,
          stock: stock,
          isVatable: admin.applyVat, // Default to admin's VAT setting
          createdAt: new Date()
        };
        
        const result = await db.collection('inventory').insertOne(item);
        item._id = result.insertedId;
        
        // Update stock
        await db.collection('inventory').updateOne(
          { _id: item._id },
          { $inc: { stock: -qty } }
        );
      } else if (itemId && itemId !== 'new' && !itemId.startsWith('new_')) {
        // Handle existing product - only if it's not a new product ID
        
        // Validate itemId format before conversion
        if (typeof itemId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(itemId)) {
          req.session.error = `Invalid item ID format for item ${i+1}. Received: ${itemId}`;
          req.session.formData = req.body;
          await req.session.save();
          return res.redirect('/invoices');
        }

        try {
          const objectId = new ObjectId(itemId);
          item = await db.collection('inventory').findOne({ 
            _id: objectId, 
            adminId: admin._id 
          });
        } catch (err) {
          console.error('Error converting itemId:', err);
          req.session.error = `Invalid item ID for item ${i+1}.`;
          req.session.formData = req.body;
          await req.session.save();
          return res.redirect('/invoices');
        }

        if (!item) {
          req.session.error = `Item with ID ${itemId} not found in inventory.`;
          req.session.formData = req.body;
          await req.session.save();
          return res.redirect('/invoices');
        }
        
        if (item.stock < qty) {
          req.session.error = `Insufficient stock for ${item.name}. Only ${item.stock} available.`;
          req.session.formData = req.body;
          await req.session.save();
          return res.redirect('/invoices');
        }
        
        // Update stock
        await db.collection('inventory').updateOne(
          { _id: item._id },
          { $inc: { stock: -qty } }
        );
      } else {
        req.session.error = `Invalid item data at position ${i+1}.`;
        req.session.formData = req.body;
        await req.session.save();
        return res.redirect('/invoices');
      }

      // Calculate VAT for the item
      const unitCost = item.cost;
      const totalCost = unitCost * qty;
      
      let vatAmount = 0;
      let vatRate = 0;
      let isVatable = false;
      let itemTotalWithVat = totalCost;
      
      // Apply VAT if admin has VAT enabled and item is vatable
      if (admin.applyVat && item.isVatable) {
        vatRate = admin.vatRate || 0;
        vatAmount = (totalCost * vatRate) / 100;
        isVatable = true;
        itemTotalWithVat = totalCost + vatAmount;
        totalVatAmount += vatAmount;
      }
      
      subtotalAmount += totalCost;
      totalOrderAmount += itemTotalWithVat;

      // Add to sale items with VAT information
      saleItems.push({ 
        itemId: item._id, 
        itemName: item.name, 
        quantity: qty, 
        unitCost: unitCost, 
        totalCost: totalCost,
        isVatable: isVatable,
        vatRate: vatRate,
        vatAmount: vatAmount,
        itemTotalWithVat: itemTotalWithVat
      });
    }

    // Handle customer creation/lookup
    let customer;
    if (customerId === 'new' && newCustomerName) {
      // Create new customer
      const newCustomer = {
        adminId: admin._id,
        name: newCustomerName,
        phone: newCustomerPhone || 'N/A',
        email: newCustomerEmail || 'N/A',
        createdAt: new Date()
      };
      const result = await db.collection('customers').insertOne(newCustomer);
      customer = { _id: result.insertedId, ...newCustomer };
    } else if (customerId && customerId !== 'new') {
      // Validate customerId format before conversion
      if (!/^[0-9a-fA-F]{24}$/.test(customerId)) {
        req.session.error = 'Invalid customer ID format.';
        req.session.formData = req.body;
        await req.session.save();
        return res.redirect('/invoices');
      }

      // Lookup existing customer
      try {
        customer = await db.collection('customers').findOne({ 
          _id: new ObjectId(customerId), 
          adminId: admin._id 
        });
      } catch (err) {
        console.error('Error converting customerId:', err);
        req.session.error = 'Invalid customer ID.';
        req.session.formData = req.body;
        await req.session.save();
        return res.redirect('/invoices');
      }

      if (!customer) {
        req.session.error = 'Customer not found or invalid.';
        req.session.formData = req.body;
        await req.session.save();
        return res.redirect('/invoices');
      }
    } else {
      req.session.error = 'Invalid customer details.';
      req.session.formData = req.body;
      await req.session.save();
      return res.redirect('/invoices');
    }

    // NEW: Process additional comments
    let processedComments = '';
    if (additionalComments) {
      // Trim and sanitize comments
      processedComments = additionalComments.trim();
      
      // Limit length to prevent abuse (optional)
      if (processedComments.length > 1000) {
        processedComments = processedComments.substring(0, 1000) + '...';
      }
    }

    // Create sale record with VAT information and additional comments
    const sale = {
      adminId: admin._id,
      customerId: customer._id,
      customerName: customer.name,
      phoneNumber: customer.phone,
      email: customer.email,
      items: saleItems,
      subtotalAmount: subtotalAmount, // Subtotal before VAT
      totalVatAmount: totalVatAmount, // Total VAT amount
      totalAmount: totalOrderAmount, // Total with VAT
      paymentMethod: paymentMethod || 'N/A',
      paymentStatus: 'Pending',
      date: new Date(),
      // Store VAT settings for reference
      vatApplied: admin.applyVat,
      vatRate: admin.vatRate || 0,
      // NEW: Include additional comments
      additionalComments: processedComments,
      formattedTotal: totalOrderAmount.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })
    };

    // Add bank details if payment method is bank transfer
    if (paymentMethod === 'Bank Transfer') {
      if (!bankName || !bankAccountName || !accountNumber) {
        req.session.error = 'Bank details required for bank transfers.';
        req.session.formData = req.body;
        await req.session.save();
        return res.redirect('/invoices');
      }
      sale.bankDetails = { bankName, bankAccountName, accountNumber };
    }

    // Save the sale
    await db.collection('sales').insertOne(sale);
    
    // Clear form data from session on success
    if (req.session.formData) {
      delete req.session.formData;
      await req.session.save();
    }
    
    res.redirect('/invoices');
  } catch (error) {
    console.error('Error creating invoice:', error);
    req.session.error = 'An unexpected error occurred. Please try again.';
    req.session.formData = req.body;
    await req.session.save();
    res.redirect('/invoices');
  }
});

// File upload handler for file_handlers
app.get('/invoices/upload', isAuthenticated, (req, res) => {
  res.render('invoices-upload', { username: req.session.admin });
});

app.post('/invoices/upload', isAuthenticated, uploadInvoiceFile, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      return res.status(401).send('Unauthorized');
    }
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    if (!filePath) {
      return res.status(400).send('No file uploaded');
    }
    console.log('File uploaded:', filePath);
    res.redirect('/invoices');
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/invoices/share', isAuthenticated, uploadInvoiceFile, async (req, res) => {
  try {
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      return res.status(401).send('Unauthorized');
    }
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    if (!filePath) {
      return res.status(400).send('No file uploaded');
    }
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

    const formatCurrency = (amount) => {
      const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
      return num.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      });
    };
    
    if (!sale) {
      return res.status(404).send('Invoice not found');
    }

    // Get admin info for the sale
    const admin = await db.collection('admins').findOne({ _id: sale.adminId });
    
    const doc = new PDFDocument({ 
      margin: 50,
      size: 'A4',
      info: {
        Title: `Invoice - ${saleId}`,
        Author: admin?.businessName || 'Shed',
        Subject: 'Commercial Invoice'
      }
    });
    
    const filename = `invoice-${saleId}.pdf`;
    res.setHeader('Content-disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    // Color scheme
    const primaryColor = '#2c5530'; // Dark green
    const secondaryColor = '#4a7c59'; // Medium green
    const accentColor = '#8fb996'; // Light green
    const textColor = '#333333';
    const borderColor = '#cccccc';
    const highlightColor = '#f8f9fa';

    // Helper function to draw colored rectangle
    const drawColoredBox = (x, y, width, height, color, text = '', textColor = '#ffffff') => {
      doc.rect(x, y, width, height).fill(color);
      if (text) {
        doc.fillColor(textColor)
           .fontSize(10)
           .text(text, x + 5, y + (height - 10) / 2, { width: width - 10, align: 'center' });
      }
    };

    // Header Section
    doc.fillColor(primaryColor)
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('SHED', 50, 50, { align: 'left' });
    
    doc.fillColor(textColor)
       .fontSize(8)
       .font('Helvetica')
       .text('Inventory, Invoices and More', 50, 68);

    // Business Logo
    let currentY = 50;
    if (admin?.logo && fs.existsSync(path.join(__dirname, 'public', admin.logo))) {
      try {
        doc.image(path.join(__dirname, 'public', admin.logo), 450, 50, { width: 80, height: 80, fit: [80, 80] });
      } catch (error) {
        console.error('Error loading logo:', error);
      }
    }

    // Invoice Title
    doc.fillColor(primaryColor)
       .fontSize(24)
       .font('Helvetica-Bold')
       .text('INVOICE', 400, 50, { align: 'right' });

    // Header separator line
    doc.moveTo(50, 90).lineTo(550, 90).strokeColor(primaryColor).lineWidth(2).stroke();

    currentY = 110;

    // Business Information Box
    drawColoredBox(50, currentY, 230, 60, accentColor);
    doc.fillColor(textColor)
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('FROM:', 60, currentY + 10);
    
    doc.font('Helvetica')
       .text(admin?.businessName || 'Business Name', 60, currentY + 25)
       .text(admin?.email || 'N/A', 60, currentY + 38)
       .text(admin?.phone || 'N/A', 60, currentY + 51);

    // Invoice Details Box
    drawColoredBox(300, currentY, 250, 60, accentColor);
    doc.fillColor(textColor)
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('INVOICE DETAILS:', 310, currentY + 10);
    
    doc.font('Helvetica')
       .text(`Invoice #: ${saleId.slice(-8)}`, 310, currentY + 25)
       .text(`Date: ${new Date(sale.date).toLocaleDateString()}`, 310, currentY + 38)
       .text(`Due: ${new Date(sale.date).toLocaleDateString()}`, 310, currentY + 51);

    currentY += 80;

    // Customer Information Box
    drawColoredBox(50, currentY, 500, 50, highlightColor);
    doc.fillColor(textColor)
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('BILL TO:', 60, currentY + 10);
    
    doc.font('Helvetica')
       .text(sale.customerName, 60, currentY + 25)
       .text(sale.phoneNumber || 'N/A', 60, currentY + 38)
       .text(sale.email || 'N/A', 200, currentY + 38);

    currentY += 70;

    // Items Table Header
    drawColoredBox(50, currentY, 500, 25, primaryColor, 'ITEMS DETAILS');
    currentY += 30;

    // Table Headers
    const colWidths = [220, 70, 80, 70, 60];
    const headerY = currentY;
    
    doc.fillColor(primaryColor)
       .fontSize(9)
       .font('Helvetica-Bold');
    
    doc.text('Description', 50, headerY, { width: colWidths[0] });
    doc.text('Qty', 270, headerY, { width: colWidths[1], align: 'center' });
    doc.text('Unit Price', 340, headerY, { width: colWidths[2], align: 'right' });
    doc.text('VAT', 420, headerY, { width: colWidths[3], align: 'right' });
    doc.text('Amount', 490, headerY, { width: colWidths[4], align: 'right' });

    // Header underline
    doc.moveTo(50, headerY + 12).lineTo(550, headerY + 12).strokeColor(borderColor).lineWidth(1).stroke();
    
    currentY += 20;

    // Items List
    doc.fillColor(textColor).font('Helvetica').fontSize(9);
    let itemsY = currentY;

    if (sale.items && Array.isArray(sale.items)) {
      sale.items.forEach((item, index) => {
        // Alternate row background
        if (index % 2 === 0) {
          doc.rect(50, itemsY - 5, 500, 20).fill(highlightColor).opacity(0.3);
        }

        const itemName = item.itemName || 'N/A';
        const quantity = item.quantity || 0;
        const unitCost = parseFloat(item.unitCost) || 0;
        const totalCost = parseFloat(item.totalCost) || 0;
        const vatAmount = parseFloat(item.vatAmount) || 0;
        const isVatable = item.isVatable || false;
        const vatRate = item.vatRate || 0;

        // Item details
        doc.fillColor(textColor)
           .text(itemName, 55, itemsY, { width: colWidths[0] - 10, align: 'left' });
        
        doc.text(String(quantity), 270, itemsY, { width: colWidths[1], align: 'center' });
        doc.text(`${admin?.currency || '$'} ${formatCurrency(unitCost)}`, 340, itemsY, { width: colWidths[2], align: 'right' });
        
        // VAT column
        if (isVatable && vatAmount > 0) {
          doc.fillColor(secondaryColor)
             .text(`${vatRate}%`, 420, itemsY, { width: colWidths[3], align: 'right' });
        } else {
          doc.fillColor('#666666')
             .text('N/A', 420, itemsY, { width: colWidths[3], align: 'right' });
        }
        
        doc.fillColor(textColor)
           .text(`${admin?.currency || '$'} ${formatCurrency(totalCost)}`, 490, itemsY, { width: colWidths[4], align: 'right' });

        itemsY += 20;
      });
    } else {
      doc.text('No items found', 55, itemsY, { width: colWidths[0] });
      itemsY += 20;
    }

    // Table bottom line
    doc.moveTo(50, itemsY + 5).lineTo(550, itemsY + 5).strokeColor(borderColor).lineWidth(1).stroke();
    
    currentY = itemsY + 20;

    // Totals Section
    const totalsLeft = 350;
    const totalsWidth = 200;

    // Calculate amounts with VAT support
    const subtotal = sale.subtotalAmount || sale.totalAmount || 0;
    const vatTotal = sale.totalVatAmount || 0;
    const finalTotal = sale.totalAmount || 0;

    // Subtotal
    doc.fillColor(textColor)
       .fontSize(9)
       .font('Helvetica')
       .text('Subtotal:', totalsLeft, currentY, { width: totalsWidth - 100, align: 'right' });
    
    doc.text(`${admin?.currency || '$'} ${formatCurrency(subtotal)}`, totalsLeft + 120, currentY, { width: 80, align: 'right' });
    currentY += 15;

    // VAT Line
    if (vatTotal > 0) {
      const vatRate = sale.vatRate || admin?.vatRate || 0;
      doc.fillColor(secondaryColor)
         .font('Helvetica-Bold')
         .text(`VAT (${vatRate}%):`, totalsLeft, currentY, { width: totalsWidth - 100, align: 'right' });
      
      doc.text(`${admin?.currency || '$'} ${formatCurrency(vatTotal)}`, totalsLeft + 120, currentY, { width: 80, align: 'right' });
      currentY += 15;
    }

    // Total
    doc.fillColor(primaryColor)
       .fontSize(11)
       .font('Helvetica-Bold')
       .text('TOTAL:', totalsLeft, currentY, { width: totalsWidth - 100, align: 'right' });
    
    doc.text(`${admin?.currency || '$'} ${formatCurrency(finalTotal)}`, totalsLeft + 120, currentY, { width: 80, align: 'right' });
    
    // Total underline
    doc.moveTo(totalsLeft + 80, currentY + 12).lineTo(totalsLeft + 200, currentY + 12).strokeColor(primaryColor).lineWidth(1).stroke();
    
    currentY += 30;

    // Payment Information
    drawColoredBox(50, currentY, 500, 60, highlightColor);
    doc.fillColor(textColor)
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('PAYMENT INFORMATION:', 60, currentY + 10);
    
    doc.font('Helvetica')
       .text(`Method: ${sale.paymentMethod || 'N/A'}`, 60, currentY + 25)
       .text(`Status: ${sale.paymentStatus || 'Pending'}`, 60, currentY + 38)
       .text(`Date: ${new Date(sale.date).toLocaleDateString()}`, 60, currentY + 51);

    // Bank details if available
    if (sale.bankDetails) {
      doc.text(`Bank: ${sale.bankDetails.bankName || 'N/A'}`, 200, currentY + 25)
         .text(`Account: ${sale.bankDetails.bankAccountName || 'N/A'}`, 200, currentY + 38)
         .text(`Number: ${sale.bankDetails.accountNumber || 'N/A'}`, 200, currentY + 51);
    }

    currentY += 80;

    // Terms and Conditions
    doc.fillColor(primaryColor)
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('TERMS & CONDITIONS', 50, currentY);
    
    doc.fillColor(textColor)
       .fontSize(8)
       .font('Helvetica')
       .text('• Payment is due within 30 days of invoice date', 50, currentY + 15)
       .text('• Late payments are subject to fees of 1.5% per month', 50, currentY + 28)
       .text('• All sales are final unless otherwise specified', 50, currentY + 41);

    // Footer
    const footerY = 750;
    doc.moveTo(50, footerY).lineTo(550, footerY).strokeColor(borderColor).lineWidth(0.5).stroke();
    
    doc.fillColor('#666666')
       .fontSize(8)
       .font('Helvetica')
       .text('Thank you for your business!', 50, footerY + 10, { align: 'center' })
       .text(`Generated on: ${new Date().toLocaleString()}`, 50, footerY + 22, { align: 'center' })
       .text('For questions, please contact us at the email above', 50, footerY + 34, { align: 'center' });

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

    if (!admin) return res.status(403).send('Admin not found');

    const sale = await db.collection('sales').findOne({
      _id: new ObjectId(saleId),
      adminId: admin._id
    });

    if (!sale) return res.status(404).send('Sale not found');

    const formatCurrency = (amount) => {
      const num = typeof amount === 'number' ? amount : parseFloat(amount);
      return isNaN(num)
        ? '0.00'
        : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      bufferPages: true,
      info: {
        Title: `Invoice - ${saleId.slice(-8)}`,
        Author: admin.businessName || 'Shed'
      }
    });

    const filename = `invoice-${saleId.slice(-8)}.pdf`;
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    const palette = {
      primary: '#1A1A1A',
      accent: '#2E8B57',
      muted: '#71717A',
      bgLight: '#F8F9FA',
      border: '#E4E4E7'
    };

    let y = 50;

    // ─── HEADER - Logo preferred, name only as fallback ────────────────
    const logoFullPath = admin.logo
      ? path.join(__dirname, 'public', admin.logo)
      : null;

    const hasValidLogo = logoFullPath && fs.existsSync(logoFullPath);

    if (hasValidLogo) {
      doc.image(logoFullPath, 50, y, { 
        width: 90,
        fit: [90, 90]
      });
      y += 100;
    } else {
      doc
        .fontSize(24)
        .font('Helvetica-Bold')
        .fillColor(palette.primary)
        .text((admin.businessName || 'BUSINESS').toUpperCase(), 50, y);
      y += 50;
    }

    doc
      .fontSize(28)
      .font('Helvetica-Bold')
      .fillColor(palette.primary)
      .text('INVOICE', 350, 50, { align: 'right' });

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(palette.muted)
      .text('INVOICE NO:', 400, 90, { continued: true })
      .font('Helvetica')
      .fillColor(palette.primary)
      .text(` #${saleId.slice(-8).toUpperCase()}`, { align: 'right' });

    doc
      .font('Helvetica-Bold')
      .fillColor(palette.muted)
      .text('DATE:', 400, 105, { continued: true })
      .font('Helvetica')
      .fillColor(palette.primary)
      .text(` ${new Date(sale.date).toLocaleDateString()}`, { align: 'right' });

    y = Math.max(y, 160);
    doc.rect(50, y, 500, 1).fill(palette.border);
    y += 20;

    // ─── ADDRESSES ────────────────────────────────────────────
    doc.fontSize(9).font('Helvetica-Bold').fillColor(palette.accent).text('FROM', 50, y);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(palette.primary)
      .text(admin.businessName || '', 50, y + 15);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(palette.muted)
      .text(admin.address || '', 50, y + 30, { width: 200 })
      .text(admin.email || '')
      .text(admin.phone || '');

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor(palette.accent)
      .text('BILL TO', 350, y, { align: 'right' });

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(palette.primary)
      .text(sale.customerName || '', 350, y + 15, { align: 'right' });

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(palette.muted)
      .text(sale.customerAddress || '', 350, y + 30, { width: 200, align: 'right' })
      .text(sale.email || '', { align: 'right' })
      .text(sale.phoneNumber || '', { align: 'right' });

    // ─── ITEMS TABLE ──────────────────────────────────────────
    y += 85;
    const colX = [50, 80, 280, 350, 450];

    doc.rect(50, y, 500, 25).fill(palette.primary);
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
    doc.text('#', colX[0] + 5, y + 8);
    doc.text('DESCRIPTION', colX[1], y + 8);
    doc.text('QTY', colX[2], y + 8, { width: 50, align: 'right' });
    doc.text('RATE', colX[3], y + 8, { width: 80, align: 'right' });
    doc.text('TOTAL', colX[4], y + 8, { width: 100, align: 'right' });

    y += 25;
    doc.font('Helvetica').fontSize(10).fillColor(palette.primary);

    (sale.items || []).forEach((item, i) => {
      const itemName = item.itemName || 'Item Description';
      const itemHeight = Math.max(30, doc.heightOfString(itemName, { width: 180 }) + 15);

      if (y + itemHeight > 730) {
        doc.addPage();
        y = 50;
      }

      if (i % 2 === 0) doc.rect(50, y, 500, itemHeight).fill(palette.bgLight);

      doc.fillColor(palette.primary);
      doc.text(i + 1, colX[0] + 5, y + 10);
      doc.text(itemName, colX[1], y + 10, { width: 180 });
      doc.text(String(item.quantity || 0), colX[2], y + 10, { width: 50, align: 'right' });
      doc.text(formatCurrency(item.unitCost), colX[3], y + 10, { width: 80, align: 'right' });
      doc.text(formatCurrency(item.totalCost), colX[4], y + 10, { width: 100, align: 'right' });

      y += itemHeight;
    });

    // ─── TOTALS & PAYMENT/NOTES ────────────────────────────────
    if (y > 600) {
      doc.addPage();
      y = 50;
    }

    y += 20;
    const totalsX = 350;

    const drawTotalRow = (label, value, isBold = false) => {
      doc
        .fontSize(isBold ? 12 : 10)
        .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(isBold ? palette.primary : palette.muted)
        .text(label, totalsX, y);
      doc
        .fillColor(palette.primary)
        .text(`${admin.currency || '$'} ${formatCurrency(value)}`, 450, y, { width: 100, align: 'right' });
      y += 20;
    };

    drawTotalRow('Subtotal', sale.subtotalAmount || sale.totalAmount);
    if (sale.totalVatAmount > 0) drawTotalRow(`VAT (${sale.vatRate || 0}%)`, sale.totalVatAmount);

    y += 5;
    doc.rect(totalsX - 10, y, 210, 30).fill(palette.bgLight);
    y += 8;
    drawTotalRow('TOTAL DUE', sale.totalAmount, true);

    y += 30;
    const infoBoxY = y;

    doc.rect(50, infoBoxY, 240, 75).fill(palette.bgLight).stroke(palette.border);
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor(palette.accent)
      .text('PAYMENT INFO', 60, infoBoxY + 10);

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(palette.primary)
      .text(`Bank: ${sale.bankDetails?.bankName || admin.bankName || 'N/A'}`, 60, infoBoxY + 22)
      .text(`A/C Name: ${sale.bankDetails?.bankAccountName || admin.businessName || 'N/A'}`, 60, infoBoxY + 34)
      .text(`A/C No: ${sale.bankDetails?.accountNumber || admin.accountNumber || 'N/A'}`, 60, infoBoxY + 46);

    if (sale.additionalComments) {
      doc.rect(310, infoBoxY, 240, 75).fill(palette.bgLight).stroke(palette.border);
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor(palette.accent)
        .text('NOTES', 320, infoBoxY + 10);
      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor(palette.muted)
        .text(sale.additionalComments, 320, infoBoxY + 22, { width: 220 });
    }

    // ─── FOOTER - Safe version without link annotation ───────────────
    const drawFooter = () => {
      const pageHeight = doc.page.height;
      const bottomMargin = 50;
      const fY = pageHeight - bottomMargin - 38; // ~753–754

      const pW = doc.page.width;
      const m = 50;
      const fSize = 7;
      const fText =
        'Shed.ng Inventory & Invoicing  •  Create professional invoices at shed.ng/invoices  •  Computer generated document.';

      const lPath = path.join(__dirname, 'public', 'images', 'logo.png');
      const hasFooterLogo = fs.existsSync(lPath);
      const logoWidth = 15;
      const spacing = 6;

      let textWidth = 0;
      try {
        textWidth = doc.widthOfString(fText, { size: fSize }) || 0;
      } catch (e) {
        textWidth = fText.length * 4.2; // rough fallback
      }

      const totalWidth = (hasFooterLogo ? logoWidth + spacing : 0) + textWidth;
      let centerX = (pW - totalWidth) / 2;

      // Final safety net
      if (isNaN(centerX) || centerX < 20 || centerX > pW) {
        centerX = 80; // fallback position
      }

      doc
        .moveTo(m, fY)
        .lineTo(pW - m, fY)
        .strokeColor(palette.border)
        .lineWidth(0.5)
        .stroke();

      let currentX = centerX;

      if (hasFooterLogo) {
        doc.image(lPath, currentX, fY + 6, { width: logoWidth });
        currentX += logoWidth + spacing;
      }

      doc
        .fontSize(fSize)
        .font('Helvetica')
        .fillColor(palette.muted)
        .text(fText, currentX, fY + 9, { lineBreak: false });
    };

    drawFooter();

    doc.end();
  } catch (error) {
    console.error('PDF generation error:', error);
    if (!res.headersSent) {
      res.status(500).send('Error generating invoice');
    }
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

app.post('/admin/broadcast-social-update', isAuthenticated, isSuperAdmin, async (req, res) => {
  try {
    // Verify superadmin status again for extra security
    const admin = await db.collection('admins').findOne({ 
      username: req.session.admin,
      role: 'superadmin' 
    });
    
    if (!admin) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Only superadmins can broadcast'
      });
    }

    // Get all active admins (excluding test accounts)
    const users = await db.collection('admins').find({ 
      email: { $exists: true, $ne: '' },
      status: { $ne: 'test' } // Optional: filter out test accounts
    }).toArray();

    if (users.length === 0) {
      return res.json({
        success: true,
        message: 'No valid users found to broadcast to',
        successCount: 0,
        failCount: 0,
        skipped: 0
      });
    }

    let successCount = 0;
    let failCount = 0;
    const failedEmails = [];
    const batchSize = 5; // Process 5 emails at a time
    const delayBetweenBatches = 3000; // 3 seconds between batches

    // Start broadcast log
    await db.collection('broadcast_logs').insertOne({
      type: 'social_update',
      initiatedBy: admin._id,
      startTime: new Date(),
      totalRecipients: users.length,
      status: 'processing'
    });

    // Process in batches to avoid overwhelming the SMTP server
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      const batchPromises = batch.map(async (user) => {
        try {
          const mailOptions = {
            from: `"Stanley [at] Shed" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: '🌟 New Feature: Social Media Integration!',
            html: `...` // Your email template here
          };

          await transporter.sendMail(mailOptions);
          successCount++;
          return { success: true, email: user.email };
        } catch (err) {
          console.error(`Failed to send to ${user.email}:`, err);
          failCount++;
          failedEmails.push(user.email);
          return { success: false, email: user.email, error: err.message };
        }
      });

      // Wait for current batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Log batch progress
      await db.collection('broadcast_progress').insertOne({
        broadcastId: broadcastLog._id,
        batchIndex: i / batchSize,
        processed: batch.length,
        successes: batchResults.filter(r => r.success).length,
        failures: batchResults.filter(r => !r.success).length,
        timestamp: new Date()
      });

      // Add delay between batches unless it's the last one
      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    // Update broadcast log
    await db.collection('broadcast_logs').updateOne(
      { _id: broadcastLog._id },
      { 
        $set: { 
          endTime: new Date(),
          status: 'completed',
          successCount,
          failCount,
          failedEmails
        } 
      }
    );

    res.json({
      success: true,
      message: `Broadcast completed successfully to ${successCount} users`,
      successCount,
      failCount,
      failedEmails: failedEmails.length > 0 ? failedEmails : undefined
    });

  } catch (error) {
    console.error('Broadcast failed:', error);
    
    // Update broadcast log if error occurs
    if (broadcastLog?._id) {
      await db.collection('broadcast_logs').updateOne(
        { _id: broadcastLog._id },
        { 
          $set: { 
            endTime: new Date(),
            status: 'failed',
            error: error.message
          } 
        }
      );
    }

    res.status(500).json({
      success: false,
      message: 'Broadcast failed',
      error: error.message
    });
  }
});

setupBroadcastRoute(app);


// Start server
async function startServer() {
  await connectToMongo();
  app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}



startServer();
