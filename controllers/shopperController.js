const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const { getDb } = require('../config/db');
const { transporter } = require('../config/mailer');

const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function otpEmailHtml({ firstName, otp }) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2 style="color:#0d0d1a;">Verify your email</h2>
      <p>Hi ${firstName || 'there'}, thanks for creating a Shed shopper account!</p>
      <p>Enter this code to confirm your email address and finish signing up:</p>
      <div style="font-size:2.2rem;font-weight:700;letter-spacing:.3em;color:#008B8B;padding:20px 0;">${otp}</div>
      <p style="color:#888;font-size:0.85rem;">This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
    </div>`;
}

// ── GET /shopper/register ───────────────────────────────────────────────────
exports.getRegister = (req, res) => {
  if (req.session.shopper) return res.redirect('/shopper/account');
  res.render('shopper-register', { error: null, firstName: '', lastName: '', email: '', phone: '' });
};

// ── POST /shopper/register — validate, store pending shopper, send OTP ─────
exports.postRegister = async (req, res) => {
  const db = getDb();
  const { firstName, lastName, email: rawEmail, phone, password, confirmPassword } = req.body;
  const email = (rawEmail || '').trim().toLowerCase();

  const renderError = (error) => res.render('shopper-register', { error, firstName, lastName, email, phone });

  try {
    if (!firstName || !lastName) return renderError('First name and last name are required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return renderError('Please enter a valid email address.');
    if (!phone || phone.trim().length < 6) return renderError('Please enter a valid phone number.');

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password || '')) {
      return renderError('Password must be at least 8 characters, with an uppercase letter, a lowercase letter, and a number.');
    }
    if (password !== confirmPassword) return renderError('Passwords do not match.');

    const existingShopper = await db.collection('shoppers').findOne({ email });
    if (existingShopper) return renderError('An account with that email already exists. Try logging in instead.');

    const otp = generateOTP();
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.collection('shopper_verifications').updateOne(
      { email },
      {
        $set: {
          otp,
          pendingShopper: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email,
            phone: phone.trim(),
            password: hashedPassword
          },
          expiresAt: new Date(Date.now() + OTP_TTL_MS)
        }
      },
      { upsert: true }
    );

    transporter.sendMail({
      from: `"Shed" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify your Shed shopper account',
      html: otpEmailHtml({ firstName, otp })
    }).catch(err => console.error('Shopper OTP email send failed:', err.message));

    return res.redirect(`/shopper/verify-email?email=${encodeURIComponent(email)}`);
  } catch (error) {
    console.error('Error during shopper registration:', error);
    renderError('An error occurred during registration. Please try again.');
  }
};

// ── GET /shopper/verify-email ───────────────────────────────────────────────
exports.getVerifyEmail = (req, res) => {
  const email = req.query.email || '';
  res.render('shopper-verify-email', { email, error: null, message: null });
};

// ── POST /shopper/verify-email/resend ───────────────────────────────────────
exports.resendVerifyEmail = async (req, res) => {
  const db = getDb();
  const email = (req.body.email || '').trim().toLowerCase();
  try {
    const record = await db.collection('shopper_verifications').findOne({ email });
    if (!record) {
      return res.render('shopper-verify-email', { email, error: 'No pending registration found. Please sign up again.', message: null });
    }
    const otp = generateOTP();
    await db.collection('shopper_verifications').updateOne(
      { email },
      { $set: { otp, expiresAt: new Date(Date.now() + OTP_TTL_MS) } }
    );
    transporter.sendMail({
      from: `"Shed" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your new Shed verification code',
      html: otpEmailHtml({ firstName: record.pendingShopper?.firstName, otp })
    }).catch(err => console.error('Resend shopper OTP failed:', err.message));

    res.render('shopper-verify-email', { email, error: null, message: 'A new code has been sent to your email.' });
  } catch (err) {
    console.error('Shopper resend error:', err);
    res.render('shopper-verify-email', { email, error: 'Failed to resend code. Please try again.', message: null });
  }
};

// ── POST /shopper/verify-email — confirm OTP, create account, log in ──────
exports.postVerifyEmail = async (req, res) => {
  const db = getDb();
  const email = (req.body.email || '').trim().toLowerCase();
  const otp = (req.body.otp || '').trim();

  const renderError = (error) => res.render('shopper-verify-email', { email, error, message: null });

  try {
    const record = await db.collection('shopper_verifications').findOne({ email });
    if (!record) return renderError('No pending registration found for this email.');
    if (new Date() > record.expiresAt) {
      await db.collection('shopper_verifications').deleteOne({ email });
      return renderError('Verification code has expired. Please sign up again.');
    }
    if (record.otp !== otp) return renderError('Incorrect code. Please try again.');

    const newShopper = {
      ...record.pendingShopper,
      isEmailVerified: true,
      createdAt: new Date(),
      lastLogin: new Date()
    };
    const result = await db.collection('shoppers').insertOne(newShopper);
    await db.collection('shopper_verifications').deleteOne({ email });

    req.session.regenerate((err) => {
      if (err) {
        console.error('Error regenerating shopper session:', err);
        return res.redirect('/shopper/login?message=Account created! Please log in.');
      }
      req.session.shopper = {
        id: result.insertedId.toString(),
        email,
        firstName: newShopper.firstName,
        lastName: newShopper.lastName
      };
      req.session.save(() => res.redirect('/shopper/account'));
    });
  } catch (error) {
    console.error('Error verifying shopper email:', error);
    renderError('An error occurred. Please try again.');
  }
};

// ── GET /shopper/login ──────────────────────────────────────────────────────
exports.getLogin = (req, res) => {
  if (req.session.shopper) return res.redirect('/shopper/account');
  res.render('shopper-login', { error: null, message: req.query.message || null, email: '' });
};

// ── POST /shopper/login ─────────────────────────────────────────────────────
exports.postLogin = async (req, res) => {
  const db = getDb();
  const email = (req.body.email || '').trim().toLowerCase();
  const { password } = req.body;

  try {
    const shopper = await db.collection('shoppers').findOne({ email });
    if (!shopper || !(await bcrypt.compare(password || '', shopper.password))) {
      return res.render('shopper-login', { error: 'Invalid email or password.', message: null, email });
    }

    req.session.regenerate(async (err) => {
      if (err) {
        console.error('Error regenerating shopper session:', err);
        return res.status(500).send('Internal Server Error');
      }
      req.session.shopper = {
        id: shopper._id.toString(),
        email: shopper.email,
        firstName: shopper.firstName,
        lastName: shopper.lastName
      };
      await db.collection('shoppers').updateOne({ _id: shopper._id }, { $set: { lastLogin: new Date() } });
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Error saving shopper session:', saveErr);
          return res.status(500).send('Internal Server Error');
        }
        const redirectTo = req.query.next && req.query.next.startsWith('/') ? req.query.next : '/shopper/account';
        res.redirect(redirectTo);
      });
    });
  } catch (error) {
    console.error('Shopper login error:', error);
    res.render('shopper-login', { error: 'An error occurred. Please try again.', message: null, email });
  }
};

// ── GET /shopper/logout ─────────────────────────────────────────────────────
exports.logout = (req, res) => {
  req.session.shopper = null;
  res.redirect('/shopper/login');
};

// ── GET /shopper/account ────────────────────────────────────────────────────
exports.getAccount = async (req, res) => {
  try {
    const db = getDb();
    const shopperId = new ObjectId(req.session.shopper.id);
    const shopper = await db.collection('shoppers').findOne({ _id: shopperId });
    if (!shopper) {
      req.session.shopper = null;
      return res.redirect('/shopper/login');
    }

    // Match orders placed while logged in (shopperId) as well as any earlier
    // guest-checkout orders made with this email before the account existed,
    // so every invoice/receipt the shopper is entitled to shows up here.
    const orders = await db.collection('sales')
      .find({ source: 'storefront', $or: [{ shopperId }, { email: shopper.email }] })
      .sort({ date: -1 })
      .limit(100)
      .toArray();

    const rawAdminIds = [...new Set(orders.map(o => o.adminId?.toString()).filter(Boolean))];
    const adminObjIds = rawAdminIds.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
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
        storeSlug: store.username || null,
        currency: store.currency || '₦'
      };
    });

    res.render('shopper-account', { shopper, orders: enrichedOrders });
  } catch (err) {
    console.error('Shopper account error:', err);
    res.status(500).render('500', { message: 'Error loading your account' });
  }
};

function requireShopper(req, res, next) {
  if (!req.session.shopper) {
    const next_ = encodeURIComponent(req.originalUrl || '/shopper/account');
    return res.redirect(`/shopper/login?next=${next_}`);
  }
  next();
}

exports.requireShopper = requireShopper;
