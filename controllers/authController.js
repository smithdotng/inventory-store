const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { getDb } = require('../config/db');
const { transporter } = require('../config/mailer');
const { uploadLogo } = require('../config/multer');
const { getDashboardUrl } = require('../utils/helpers');
const { sendWelcomeEmailToUser } = require('../utils/emailHelpers');

// GET /admin-login
exports.getLogin = (req, res) => {
  res.render('login', { error: null, message: req.query.message || null });
};

// POST /admin-login
exports.postLogin = async (req, res) => {
  const { usernameOrEmail, password } = req.body;
  const db = getDb();

  console.log('=== LOGIN ATTEMPT ===');
  console.log('Username/Email:', usernameOrEmail);
  console.log('Session before login:', req.session);

  try {
    const admin = await db.collection('admins').findOne({
      $or: [
        { username: { $regex: `^${usernameOrEmail}$`, $options: 'i' } },
        { email: usernameOrEmail }
      ]
    });

    console.log('Admin found:', admin ? 'Yes' : 'No');

    let businessUser = null;
    if (!admin) {
      businessUser = await db.collection('business_users').findOne({
        $or: [
          { username: { $regex: `^${usernameOrEmail}$`, $options: 'i' } },
          { email: { $regex: `^${usernameOrEmail}$`, $options: 'i' } }
        ],
        status: 'active'
      });
      console.log('Business user found:', businessUser ? 'Yes' : 'No');

      if (businessUser && businessUser.status !== 'active') {
        businessUser = null;
      }
    }

    const user = admin || businessUser;

    if (user && await bcrypt.compare(password, user.password)) {
      console.log('✅ Password verified successfully');

      req.session.regenerate(async (err) => {
        if (err) {
          console.error('Error regenerating session:', err);
          return res.status(500).send('Internal Server Error');
        }

        if (admin) {
          req.session.admin = admin.username;
          req.session.adminId = admin._id.toString();
          req.session.role = admin.role;
          req.session.username = admin.username;
          req.session.userType = 'admin';
        } else if (businessUser) {
          req.session.userId = businessUser._id.toString();
          req.session.adminId = businessUser.adminId.toString();
          req.session.role = businessUser.role;
          req.session.username = businessUser.username;
          req.session.firstName = businessUser.firstName;
          req.session.userType = 'business_user';
        }

        console.log('✅ Session after setup:', req.session);

        if (businessUser) {
          await db.collection('business_users').updateOne(
            { _id: businessUser._id },
            { $set: { lastLogin: new Date() } }
          );
        }

        await db.collection('login_logs').insertOne({
          userId: user._id,
          username: user.username,
          role: user.role,
          adminId: user.adminId || user._id,
          loginTime: new Date(),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        req.session.save((err) => {
          if (err) {
            console.error('Error saving session:', err);
            return res.status(500).send('Internal Server Error');
          }

          const redirectUrl = getDashboardUrl(user.role);
          console.log('✅ Redirecting to:', redirectUrl);
          res.redirect(redirectUrl);
        });
      });

    } else {
      console.log('❌ Invalid credentials');
      res.render('login', { error: 'Invalid username/email or password', message: null });
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).send('Internal Server Error');
  }
};

// GET /admin-logout
exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/admin-login'));
};

// GET /admin-register
exports.getRegister = async (req, res) => {
  try {
    const db = getDb();
    const referralCode = req.query.ref || null;

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

    res.render('register', {
      error: null,
      referralCode: referralCode,
      message: null,
      admin: null
    });

  } catch (err) {
    console.error('Error in /admin-register:', err);
    res.render('register', {
      error: 'An error occurred while loading the registration page',
      referralCode: null,
      message: null,
      admin: null
    });
  }
};

// POST /admin-register
exports.postRegister = async (req, res) => {
  const db = getDb();
  const { businessName, email, currency, username, password, country, firstName, lastName } = req.body;
  const referralCode = req.query.ref;
  const logoPath = req.file ? `/uploads/${req.file.filename}` : '/images/default-logo.png';

  try {
    if (!firstName || !lastName) {
      return res.render('register', {
        error: 'First name and last name are required.',
        businessName, email, currency, username, country, firstName, lastName, referralCode
      });
    }

    if (username.includes(' ')) {
      return res.render('register', {
        error: 'Username cannot contain spaces.',
        businessName, email, currency, username, country, firstName, lastName, referralCode
      });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.render('register', {
        error: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
        businessName, email, currency, username, country, firstName, lastName, referralCode
      });
    }

    const existingAdmin = await db.collection('admins').findOne({ $or: [{ username }, { email }] });
    if (existingAdmin) {
      return res.render('register', {
        error: 'Username or email already exists.',
        businessName, email, currency, username, country, firstName, lastName, referralCode
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = {
      businessName, email, currency, country, username,
      password: hashedPassword, firstName, lastName,
      logo: logoPath,
      role: 'admin',
      createdAt: new Date(),
    };

    await db.collection('admins').insertOne(newAdmin);

    // Send welcome email (using sendWelcomeEmailToUser since sendWelcomeEmail is not defined)
    await sendWelcomeEmailToUser(email, username, businessName);

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
    res.render('register', {
      error: 'An error occurred during registration. Please try again.',
      businessName, email, currency, username, country, firstName, lastName, referralCode
    });
  }
};

// GET /forgot-password
exports.getForgotPassword = (req, res) => {
  res.render('forgot-password', { message: null, error: null });
};

// POST /forgot-password
exports.postForgotPassword = async (req, res) => {
  try {
    const db = getDb();
    const { email } = req.body;
    const admin = await db.collection('admins').findOne({ email });

    if (!admin) {
      return res.render('forgot-password', { message: null, error: 'No account found with that email.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 3600000;

    await db.collection('password_resets').updateOne(
      { email },
      { $set: { token, expires } },
      { upsert: true }
    );

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
        <p>This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
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
};

// GET /reset-password
exports.getResetPassword = async (req, res) => {
  try {
    const db = getDb();
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
};

// POST /reset-password
exports.postResetPassword = async (req, res) => {
  try {
    const db = getDb();
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
};

// GET /reset-password/:token (superadmin-initiated reset)
exports.getResetPasswordToken = async (req, res) => {
  try {
    const db = getDb();
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
};

// POST /reset-password/:token (superadmin-initiated reset)
exports.postResetPasswordToken = async (req, res) => {
  try {
    const db = getDb();
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
};
