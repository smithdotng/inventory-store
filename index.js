require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const path = require('path');
const { setupBroadcastRoute } = require('./utils/emailBroadcast');

const { connectToMongo } = require('./config/db');
const { setupSessionValidation } = require('./middleware/auth');

// Routes
const authRoutes        = require('./routes/auth');
const referralRoutes    = require('./routes/referrals');
const inventoryRoutes   = require('./routes/inventory');
const salesRoutes       = require('./routes/sales');
const customerRoutes    = require('./routes/customers');
const outletRoutes      = require('./routes/outlets');
const invoiceRoutes     = require('./routes/invoices');
const superadminRoutes  = require('./routes/superadmin');
const profileRoutes     = require('./routes/profile');
const storeRoutes       = require('./routes/store');
const apiRoutes         = require('./routes/api');
const blogRoutes        = require('./routes/blog');
const miscRoutes        = require('./routes/misc');
const buyerRoutes       = require('./routes/buyer');
const shopperRoutes     = require('./routes/shopper');
const cartRoutes        = require('./routes/cart');
const billingRoutes     = require('./routes/billing');

const { startSubscriptionRenewalJob } = require('./jobs/subscriptionRenewal');

const app = express();
const port = process.env.PORT || 3000;

// ── Core middleware ────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Session ───────────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

app.use(flash());

// ── EJS helpers ───────────────────────────────────────────────────────────────
app.locals.escapeEjs = function (str) {
  if (typeof str !== 'string') return str || '';
  return str
    .replace(/%/g, '&#37;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ── Session validation (populates req.user on every authenticated request) ────
setupSessionValidation(app);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/',           authRoutes);
app.use('/referrals',  referralRoutes);
app.use('/',           inventoryRoutes);
app.use('/',           salesRoutes);
app.use('/',           customerRoutes);
app.use('/',           outletRoutes);
app.use('/',           invoiceRoutes);
app.use('/superadmin', superadminRoutes);
app.use('/',           profileRoutes);
app.use('/',           storeRoutes);
app.use('/',           apiRoutes);
app.use('/',           blogRoutes);
app.use('/',           buyerRoutes);
app.use('/',           shopperRoutes);
app.use('/',           cartRoutes);
app.use('/',           billingRoutes);
app.use('/',           miscRoutes);   // misc last — contains the * catch-all

// ── Email broadcast utility route ─────────────────────────────────────────────
setupBroadcastRoute(app);

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('500', { message: err.message || 'Internal Server Error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function startServer() {
  await connectToMongo();
  startSubscriptionRenewalJob();
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer();
