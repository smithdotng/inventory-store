const { ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/db');
const { uploadsDir } = require('../config/multer');
const { getOutletsWithCommission, formatCurrency } = require('../utils/helpers');
const { BUSINESS_CATEGORIES } = require('../utils/categories');

// GET /home
exports.getHome = async (req, res) => {
  try {
    const db = getDb();
    console.log('Admin ID from session:', req.session.adminId);
    const admin = await db.collection('admins').findOne({ _id: new ObjectId(req.session.adminId) });
    if (!admin) throw new Error('Admin not found');

    let outlets = await db.collection('outlets').find({ adminId: new ObjectId(req.session.adminId) }).toArray();

    const outletsWithCommission = await Promise.all(outlets.map(async (outlet) => {
      const pendingCommissions = await db.collection('commissions').aggregate([
        { $match: { outletId: outlet._id, status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).toArray();

      const totalCommissionDue = pendingCommissions[0]?.total || 0;
      return { ...outlet, totalCommissionDue };
    }));

    res.render('home', {
      username: req.session.admin,
      admin,
      outlets: outletsWithCommission,
      error: req.query.error,
      formatCurrency
    });
  } catch (error) {
    console.error('Error loading admin home:', error);
    res.render('home', {
      username: req.session.admin,
      admin: { currency: '₦' },
      outlets: [],
      error: 'Failed to load outlets. Please try again.',
      formatCurrency
    });
  }
};

// GET /profile
exports.getProfile = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      req.session.error = 'Admin not found.';
      return res.redirect('/admin-login');
    }

    const error = req.session.error;
    const success = req.session.success;
    req.session.error = null;
    req.session.success = null;

    const clusters = await db.collection('market_clusters').find({ isActive: true }).sort({ name: 1 }).toArray();

    res.render('profile', {
      username: req.session.admin, admin, error, success,
      categories: BUSINESS_CATEGORIES, clusters
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    req.session.error = 'Failed to load profile. Please try again.';
    res.redirect('/admin-login');
  }
};

// POST /profile/update
exports.postProfileUpdate = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      req.session.error = 'Admin not found.';
      req.session.success = null;
      return res.redirect('/profile');
    }

    const {
      firstName, lastName, businessName, currency, phone, email,
      address, country,
      primaryBankAccountName, primaryAccountNumber, primaryBankName,
      secondaryBankAccountName, secondaryAccountNumber, secondaryBankName,
      facebook, instagram, twitter,
      publicPhone, publicEmail, publicAddress,
      applyVat, vatRate, croppedImageData,
      category, clusterId
    } = req.body;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      req.session.error = 'Please enter a valid email address';
      req.session.success = null;
      return res.redirect('/profile');
    }

    if (applyVat === 'on') {
      const vatRateValue = parseFloat(vatRate);
      if (isNaN(vatRateValue) || vatRateValue < 0 || vatRateValue > 100) {
        req.session.error = 'Please enter a valid VAT rate between 0 and 100';
        req.session.success = null;
        return res.redirect('/profile');
      }
    }

    const isValidUrl = (url) => {
      if (!url) return true;
      try { new URL(url); return true; } catch (e) { return false; }
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

    // Business category + market cluster — both optional, validated against
    // the known lists so a tampered form value can't store junk.
    const safeCategory = (category && BUSINESS_CATEGORIES.includes(category)) ? category : null;
    let safeClusterId = null;
    if (clusterId && ObjectId.isValid(clusterId)) {
      const cluster = await db.collection('market_clusters').findOne({ _id: new ObjectId(clusterId), isActive: true });
      if (cluster) safeClusterId = cluster._id;
    }

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
      applyVat: applyVat === 'on',
      vatRate: applyVat === 'on' ? parseFloat(vatRate) : (admin.vatRate || 0),
      category: safeCategory,
      clusterId: safeClusterId,
      updatedAt: new Date()
    };

    if (req.file) {
      if (admin.logo) {
        const oldLogoPath = path.join(__dirname, '..', 'public', admin.logo);
        if (fs.existsSync(oldLogoPath)) fs.unlinkSync(oldLogoPath);
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
        const oldLogoPath = path.join(__dirname, '..', 'public', admin.logo);
        if (fs.existsSync(oldLogoPath)) fs.unlinkSync(oldLogoPath);
      }

      fs.writeFileSync(filePath, buffer);
      updateData.logo = `/uploads/${filename}`;
    }

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

    await db.collection('admins').updateOne({ _id: admin._id }, { $set: updateData });

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
};

// GET /admin-logout
exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/admin-login'));
};

// GET /business-users
exports.getBusinessUsers = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const users = await db.collection('business_users')
      .find({ adminId: admin._id })
      .sort({ createdAt: -1 })
      .toArray();

    res.render('business-users', {
      username: req.session.admin,
      admin,
      users,
      success: req.flash('success') || null,
      error: req.flash('error') || null
    });
  } catch (error) {
    console.error('Error fetching business users:', error);
    req.flash('error', 'Failed to load users');
    res.redirect('/home');
  }
};

// POST /business-users/add
exports.postAddBusinessUser = async (req, res) => {
  try {
    const db = getDb();
    const crypto = require('crypto');
    const bcrypt = require('bcrypt');
    const { sendUserInvitationEmail } = require('../utils/emailHelpers');

    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const { firstName, lastName, email, role, permissions = [] } = req.body;

    if (!firstName || !lastName || !email || !role) {
      req.flash('error', 'All fields are required');
      return res.redirect('/business-users');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      req.flash('error', 'Invalid email format');
      return res.redirect('/business-users');
    }

    const existingUser = await db.collection('business_users').findOne({ email, adminId: admin._id });
    if (existingUser) {
      req.flash('error', 'Email already exists in your business');
      return res.redirect('/business-users');
    }

    const tempPassword = crypto.randomBytes(8).toString('hex');
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationExpires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const username = email.split('@')[0] + '_' + Date.now().toString().slice(-6);

    const newUser = {
      adminId: admin._id,
      businessName: admin.businessName,
      firstName, lastName, email, username,
      password: hashedPassword,
      role,
      permissions: Array.isArray(permissions) ? permissions : [permissions],
      status: 'pending',
      invitationToken,
      invitationExpires,
      tempPassword: tempPassword,
      createdAt: new Date(),
      createdBy: admin._id
    };

    await db.collection('business_users').insertOne(newUser);
    await sendUserInvitationEmail(email, firstName, admin, invitationToken, tempPassword);

    req.flash('success', `User added successfully. Invitation email sent to ${email}`);
    res.redirect('/business-users');
  } catch (error) {
    console.error('Error adding business user:', error);
    req.flash('error', 'Failed to add user');
    res.redirect('/business-users');
  }
};

// POST /business-users/activate/:userId
exports.postActivateUser = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    await db.collection('business_users').updateOne(
      { _id: new ObjectId(req.params.userId), adminId: admin._id },
      { $set: { status: 'active' } }
    );
    req.flash('success', 'User activated successfully');
    res.redirect('/business-users');
  } catch (error) {
    console.error('Error activating user:', error);
    req.flash('error', 'Failed to activate user');
    res.redirect('/business-users');
  }
};

// POST /business-users/deactivate/:userId
exports.postDeactivateUser = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    await db.collection('business_users').updateOne(
      { _id: new ObjectId(req.params.userId), adminId: admin._id },
      { $set: { status: 'inactive' } }
    );
    req.flash('success', 'User deactivated successfully');
    res.redirect('/business-users');
  } catch (error) {
    console.error('Error deactivating user:', error);
    req.flash('error', 'Failed to deactivate user');
    res.redirect('/business-users');
  }
};

// POST /business-users/resend-invite/:userId
exports.postResendInvite = async (req, res) => {
  try {
    const db = getDb();
    const crypto = require('crypto');
    const { sendUserInvitationEmail } = require('../utils/emailHelpers');

    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    const user = await db.collection('business_users').findOne({
      _id: new ObjectId(req.params.userId),
      adminId: admin._id,
      status: 'pending'
    });

    if (!user) {
      req.flash('error', 'User not found or already active');
      return res.redirect('/business-users');
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

    await db.collection('business_users').updateOne(
      { _id: user._id },
      { $set: { invitationToken: newToken, invitationExpires: newExpiry } }
    );

    await sendUserInvitationEmail(user.email, user.firstName, admin, newToken, user.tempPassword);

    req.flash('success', 'Invitation resent successfully');
    res.redirect('/business-users');
  } catch (error) {
    console.error('Error resending invitation:', error);
    req.flash('error', 'Failed to resend invitation');
    res.redirect('/business-users');
  }
};

// GET /setup-account/:token
exports.getSetupAccount = async (req, res) => {
  try {
    const db = getDb();
    const { token } = req.params;
    const user = await db.collection('business_users').findOne({
      invitationToken: token,
      invitationExpires: { $gt: Date.now() },
      status: 'pending'
    });

    if (!user) {
      return res.render('setup-account', { error: 'Invalid or expired invitation link', token: null, user: null });
    }

    res.render('setup-account', {
      error: null, token,
      user: { email: user.email, firstName: user.firstName, businessName: user.businessName }
    });
  } catch (error) {
    console.error('Error loading setup page:', error);
    res.render('setup-account', { error: 'Error loading setup page', token: null, user: null });
  }
};

// POST /setup-account/:token
exports.postSetupAccount = async (req, res) => {
  try {
    const db = getDb();
    const bcrypt = require('bcrypt');
    const { sendWelcomeEmailToUser } = require('../utils/emailHelpers');
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.render('setup-account', { error: 'Both password fields are required', token, user: null });
    }

    if (password !== confirmPassword) {
      return res.render('setup-account', { error: 'Passwords do not match', token, user: null });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.render('setup-account', {
        error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character',
        token, user: null
      });
    }

    const user = await db.collection('business_users').findOne({
      invitationToken: token,
      invitationExpires: { $gt: Date.now() },
      status: 'pending'
    });

    if (!user) {
      return res.render('setup-account', { error: 'Invalid or expired invitation link', token: null, user: null });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.collection('business_users').updateOne(
      { _id: user._id },
      {
        $set: { password: hashedPassword, status: 'active', activatedAt: new Date() },
        $unset: { invitationToken: '', invitationExpires: '', tempPassword: '' }
      }
    );

    await sendWelcomeEmailToUser(user.email, user.firstName, user.businessName);
    res.redirect('/admin-login?message=Account setup successful! You can now log in.');
  } catch (error) {
    console.error('Error setting up account:', error);
    res.render('setup-account', { error: 'Error setting up account', token: req.params.token, user: null });
  }
};
