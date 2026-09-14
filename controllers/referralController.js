const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const moment = require('moment');
const { getDb } = require('../config/db');
const { transporter } = require('../config/mailer');

exports.getSignup = (req, res) => {
  res.render('referrals-signup', { error: req.flash('error')[0] || null });
};

exports.getSignupRoot = (req, res) => {
  res.render('referrals-signup', { error: req.flash('error')[0] || null });
};

exports.postSignup = async (req, res) => {
  let broadcastLog;
  try {
    const db = getDb();
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
      firstName, lastName, email, country, password: hashedPassword,
      countryCode, mobileNumber, referralCode, createdAt: new Date()
    };

    const result = await db.collection('affiliates').insertOne(affiliate);

    const baseUrl = process.env.BASE_URL ||
                    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
    const referralLink = `${baseUrl}/admin-register?ref=${referralCode}`;
    const dashboardLink = `${baseUrl}/referrals/dashboard?utm_source=welcome_email&utm_medium=email&utm_campaign=affiliate_onboarding`;

    broadcastLog = await db.collection('broadcast_logs').insertOne({
      type: 'affiliate_welcome',
      initiatedBy: 'system',
      startTime: new Date(),
      totalRecipients: 1,
      status: 'processing'
    });

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
            <p>Share this link to start driving signups and watch your rewards grow!</p>
            <p>Curious about your impact? Your <a href="${dashboardLink}" style="color:#eba611;text-decoration:underline;">Affiliate Dashboard</a> shows your clicks, signups, and progress in real-time.</p>
            <p>Best regards,<br>The Shed Affiliate Team</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      successCount++;

      await db.collection('broadcast_progress').insertOne({
        broadcastId: broadcastLog._id,
        batchIndex: 0, processed: 1, successes: 1, failures: 0, timestamp: new Date()
      });
    } catch (err) {
      console.error(`Failed to send welcome email to ${email}:`, err);
      failCount++;
      failedEmails.push(email);
      await db.collection('broadcast_progress').insertOne({
        broadcastId: broadcastLog._id,
        batchIndex: 0, processed: 1, successes: 0, failures: 1, timestamp: new Date()
      });
    }

    await db.collection('broadcast_logs').updateOne(
      { _id: broadcastLog._id },
      { $set: { endTime: new Date(), status: 'completed', successCount, failCount, failedEmails } }
    );

    req.session.affiliate = result.insertedId.toString();
    res.redirect('/referrals/dashboard');

  } catch (error) {
    console.error('Error signing up affiliate:', error);
    if (broadcastLog?._id) {
      const db = getDb();
      await db.collection('broadcast_logs').updateOne(
        { _id: broadcastLog._id },
        { $set: { endTime: new Date(), status: 'failed', error: error.message } }
      );
    }
    req.flash('error', 'An unexpected error occurred. Please try again later.');
    res.redirect('/referrals/signup');
  }
};

exports.getLogin = (req, res) => {
  res.render('referrals-login', { error: req.flash('error') });
};

exports.postLogin = async (req, res) => {
  try {
    const db = getDb();
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/referrals/login');
    }

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
};

exports.getDashboard = async (req, res) => {
  try {
    const db = getDb();
    const affiliate = await db.collection('affiliates').findOne({ _id: new ObjectId(req.session.affiliate) });

    if (!affiliate) {
      req.session.destroy();
      return res.redirect('/referrals/login?error=Affiliate not found');
    }

    const baseUrl = process.env.BASE_URL ||
                    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
    const referralLink = `${baseUrl}/admin-register?ref=${affiliate.referralCode || affiliate._id}`;

    const activities = await db.collection('referral_activities')
      .find({ affiliateId: affiliate._id })
      .sort({ date: -1 })
      .toArray();

    const clickCountResult = await db.collection('referral_activities')
      .aggregate([
        { $match: { affiliateId: affiliate._id, action: 'Referral Link Clicked' } },
        { $count: 'clickCount' }
      ]).toArray();
    const clickCount = clickCountResult.length > 0 ? clickCountResult[0].clickCount : 0;

    const signupCountResult = await db.collection('referral_activities')
      .aggregate([
        { $match: { affiliateId: affiliate._id, action: 'New Admin Signup' } },
        { $count: 'signupCount' }
      ]).toArray();
    const signupCount = signupCountResult.length > 0 ? signupCountResult[0].signupCount : 0;

    res.render('referrals-dashboard', {
      affiliate, referralLink, activities, clickCount, signupCount,
      sidebarVisible: true, error: null
    });
  } catch (error) {
    console.error('Error loading affiliate dashboard:', error);
    res.render('referrals-dashboard', {
      affiliate: null, referralLink: '', activities: [], clickCount: 0, signupCount: 0,
      sidebarVisible: true, error: 'An unexpected error occurred. Please try again later.'
    });
  }
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.redirect('/referrals/dashboard?error=Logout failed');
    }
    res.redirect('/referrals/login?resetSidebar=true');
  });
};

exports.getForgotPassword = (req, res) => {
  const error = req.flash('error');
  const message = req.flash('success');
  res.render('referral-forgot-password', { error, message });
};

exports.postForgotPassword = async (req, res) => {
  let broadcastLog;
  try {
    const db = getDb();
    const { email } = req.body;
    if (!email) {
      req.flash('error', 'Email is required.');
      return res.redirect('/referrals/forgot-password');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const affiliate = await db.collection('affiliates').findOne({
      email: { $regex: `^${normalizedEmail}$`, $options: 'i' }
    });

    if (!affiliate) {
      req.flash('error', 'No affiliate found with this email.');
      return res.redirect('/referrals/forgot-password');
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenExpiry = moment().add(1, 'hour').toDate();

    await db.collection('affiliates').updateOne(
      { _id: affiliate._id },
      { $set: { resetToken, resetTokenExpiry } }
    );

    const baseUrl = process.env.BASE_URL ||
                    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
    const resetLink = `${baseUrl}/referrals/reset-password/${resetToken}`;

    broadcastLog = await db.collection('broadcast_logs').insertOne({
      type: 'password_reset',
      initiatedBy: 'system',
      startTime: new Date(),
      totalRecipients: '1',
      status: 'processing'
    });

    try {
      const mailOptions = {
        from: `"Shed Affiliate Programme" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '🔒 Reset Your Shed Affiliate Password',
        html: `
          <div style="font-family: Arial; color: #333; padding: 20px; max-width: 600px; margin: auto;">
            <h1 style="color: #eba611;">Password Reset Request</h1>
            <p>Dear ${affiliate.firstName} ${affiliate.lastName},</p>
            <p>We received a request to reset your Shed Affiliate Program password. Click the link below to reset your password:</p>
            <p><a href="${resetLink}" style="background-color: #eba611; color: #333; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a></p>
            <p>This link will expire in 1 hour for security reasons.</p>
            <p>Best regards,<br>The Shed Affiliate Team</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);

      await db.collection('broadcast_progress').insertOne({
        broadcastId: broadcastLog._id,
        batchIndex: 0, processed: 1, successes: 1, failures: 0, timestamp: new Date()
      });
    } catch (err) {
      console.error(`Failed to send reset email to ${email}:`, err);
      await db.collection('broadcast_progress').insertOne({
        broadcastId: broadcastLog._id,
        batchIndex: 0, processed: 1, successes: 0, failures: 1, timestamp: new Date()
      });
    }

    await db.collection('broadcast_logs').updateOne(
      { _id: broadcastLog._id },
      { $set: { endTime: new Date(), status: 'completed' } }
    );

    req.flash('success', 'A password reset link has been sent to your email.');
    res.redirect('/referrals/forgot-password');

  } catch (error) {
    console.error('Error processing forgot password:', error);
    req.flash('error', 'An unexpected error occurred. Please try again later.');
    res.redirect('/referrals/forgot-password');
  }
};

exports.getResetPassword = async (req, res) => {
  try {
    const db = getDb();
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
};

exports.postResetPassword = async (req, res) => {
  try {
    const db = getDb();
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

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.collection('affiliates').updateOne(
      { _id: affiliate._id },
      { $set: { password: hashedPassword }, $unset: { resetToken: '', resetTokenExpiry: '' } }
    );

    req.flash('success', 'Password reset successfully. Please log in.');
    res.redirect('/referrals/login');

  } catch (error) {
    console.error('Error resetting password:', error);
    req.flash('error', 'An unexpected error occurred. Please try again.');
    res.redirect(`/referrals/referral-reset-password/${req.params.token}`);
  }
};
