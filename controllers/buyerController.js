const { ObjectId } = require('mongodb');
const { getDb } = require('../config/db');
const { transporter } = require('../config/mailer');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function requireBuyer(req, res, next) {
  if (!req.session.buyer) return res.redirect('/buyer/login');
  next();
}

// GET /buyer/login
exports.getLogin = (req, res) => {
  if (req.session.buyer) return res.redirect('/buyer');
  res.render('buyer-login', { error: null, step: 'email', email: '' });
};

// POST /buyer/login/otp  — send 6-digit code
exports.postSendOTP = async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.render('buyer-login', { error: 'Please enter a valid email address.', step: 'email', email });
  }
  try {
    const db  = getDb();
    const otp = generateOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await db.collection('buyer_otps').deleteMany({ email });
    await db.collection('buyer_otps').insertOne({ email, otp, expires });

    await transporter.sendMail({
      from: `"Shed" <${process.env.BUSINESS_USER || 'hello@shed.ng'}>`,
      to: email,
      subject: 'Your Shed login code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <img src="https://shed.ng/android-chrome-512x512.png" alt="Shed" height="40" style="margin-bottom:24px">
          <h2 style="color:#FF9800;margin:0 0 8px">Your login code</h2>
          <p style="color:#555;margin:0 0 24px">Enter this code to sign in to your Shed buyer profile:</p>
          <div style="font-size:40px;font-weight:800;letter-spacing:10px;color:#1A1A1A;background:#F2F2F2;padding:20px 24px;border-radius:8px;text-align:center;margin-bottom:24px">${otp}</div>
          <p style="color:#999;font-size:12px">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
          <p style="color:#999;font-size:12px;margin-top:8px">— The Shed Team</p>
        </div>
      `
    });

    res.render('buyer-login', { error: null, step: 'otp', email });
  } catch (err) {
    console.error('OTP send error:', err);
    res.render('buyer-login', { error: 'Failed to send code. Please try again.', step: 'email', email });
  }
};

// POST /buyer/login/verify  — check OTP, set session
exports.postVerifyOTP = async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const otp   = (req.body.otp   || '').trim();
  try {
    const db     = getDb();
    const record = await db.collection('buyer_otps').findOne({ email });

    if (!record || record.otp !== otp || new Date() > record.expires) {
      return res.render('buyer-login', {
        error: 'Invalid or expired code. Request a new one.',
        step: 'otp', email
      });
    }

    await db.collection('buyer_otps').deleteMany({ email });

    // Upsert buyer profile
    await db.collection('buyer_profiles').updateOne(
      { email },
      { $set: { lastLogin: new Date() }, $setOnInsert: { email, createdAt: new Date() } },
      { upsert: true }
    );

    const profile       = await db.collection('buyer_profiles').findOne({ email });
    req.session.buyer   = { email, name: profile.name || '' };
    res.redirect('/buyer');
  } catch (err) {
    console.error('OTP verify error:', err);
    res.render('buyer-login', { error: 'Something went wrong. Please try again.', step: 'email', email });
  }
};

// GET /buyer  — dashboard
exports.getDashboard = [requireBuyer, async (req, res) => {
  try {
    const db    = getDb();
    const email = req.session.buyer.email;

    const profile = await db.collection('buyer_profiles').findOne({ email });

    // All purchases by this email across all stores
    const orders = await db.collection('sales')
      .find({ email, source: 'storefront' })
      .sort({ date: -1 })
      .limit(100)
      .toArray();

    // Fetch store details for each order
    const rawAdminIds = [...new Set(
      orders.map(o => o.adminId?.toString()).filter(Boolean)
    )];
    const adminObjIds = rawAdminIds
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    const stores = adminObjIds.length
      ? await db.collection('admins').find({ _id: { $in: adminObjIds } }).toArray()
      : [];

    const storeMap = {};
    stores.forEach(s => { storeMap[s._id.toString()] = s; });

    const enrichedOrders = orders.map(o => {
      const store = storeMap[o.adminId?.toString()] || {};
      return {
        ...o,
        storeName: store.businessName || 'Unknown Store',
        storeSlug: store.username    || null,
        storeLogo: store.logo        || null,
        currency:  store.currency    || '₦',
      };
    });

    // Suggested stores: admins not yet purchased from, with active inventory
    const visitedAdminObjIds = rawAdminIds
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    const suggestQuery = {
      role: { $ne: 'superadmin' },
      username: { $nin: ['System'] },
      ...(visitedAdminObjIds.length ? { _id: { $nin: visitedAdminObjIds } } : {}),
    };

    const suggestedStores = await db.collection('admins')
      .find(suggestQuery)
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.render('buyer-dashboard', {
      buyer:  profile || { email },
      orders: enrichedOrders,
      suggestedStores,
    });
  } catch (err) {
    console.error('Buyer dashboard error:', err);
    res.status(500).render('500', { message: 'Error loading your dashboard' });
  }
}];

// GET /buyer/logout
exports.logout = (req, res) => {
  req.session.buyer = null;
  res.redirect('/buyer/login');
};
