const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { getDb } = require('../config/db');
const { transporter } = require('../config/mailer');
const { formatCurrency } = require('../utils/helpers');
const { sendPasswordResetEmail } = require('../utils/emailHelpers');

// POST /superadmin/subscription/:id/comp — manually grant/revoke free access,
// e.g. for a store owner you've agreed to comp or want to unblock by hand.
exports.postCompSubscription = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ _id: new ObjectId(req.params.id) });
    if (!admin) {
      req.flash('error', 'Admin not found.');
      return res.redirect('/superadmin/dashboard');
    }

    if (!admin.subscription || admin.subscription.legacyAccount) {
      req.flash('error', 'This admin is not on the subscription system.');
      return res.redirect('/superadmin/dashboard');
    }

    const undo = req.body.undo === '1';
    await db.collection('admins').updateOne(
      { _id: admin._id },
      { $set: { 'subscription.status': undo ? 'expired' : 'comped' } }
    );

    req.flash('success', undo ? `Removed comp access for ${admin.username}.` : `Granted free access to ${admin.username}.`);
    res.redirect('/superadmin/dashboard');
  } catch (err) {
    console.error('Comp subscription error:', err);
    req.flash('error', 'Could not update subscription.');
    res.redirect('/superadmin/dashboard');
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const db = getDb();
    console.log('Accessing /superadmin/dashboard for user:', req.session.admin);

    const admins = await db.collection('admins').find().toArray();
    if (!admins.length) console.warn('No admins found in database');

    const adminIds = admins.map(admin => admin._id);

    const loginLogs = await db.collection('login_logs')
      .aggregate([
        { $match: { adminId: { $in: adminIds } } },
        { $group: { _id: '$adminId', lastLogin: { $max: '$loginTime' }, loginCount: { $sum: 1 } } }
      ]).toArray();

    const sales = await db.collection('sales')
      .aggregate([
        { $match: { adminId: { $in: adminIds } } },
        {
          $group: {
            _id: { adminId: '$adminId', source: '$source' },
            totalSales: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
            sales: { $push: {
              saleId: '$_id', customerName: '$customerName', totalAmount: '$totalAmount',
              paymentMethod: '$paymentMethod', paymentStatus: '$paymentStatus', date: '$date', items: '$items'
            }}
          }
        }
      ]).toArray();

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
        posSales: { count: posSales.totalSales, revenue: posSales.totalRevenue, sales: posSales.sales },
        onlineSales: { count: onlineSales.totalSales, revenue: onlineSales.totalRevenue, sales: onlineSales.sales }
      };
    });

    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!currentAdmin) {
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
};

exports.getAffiliates = async (req, res) => {
  try {
    const db = getDb();
    const affiliates = await db.collection('affiliates').find().toArray();
    const affiliateIds = affiliates.map(affiliate => affiliate._id);

    const clickLogs = await db.collection('referral_activities')
      .aggregate([
        { $match: { affiliateId: { $in: affiliateIds }, action: 'Referral Link Clicked' } },
        { $group: { _id: '$affiliateId', clickCount: { $sum: 1 } } }
      ]).toArray();

    const signupLogs = await db.collection('referral_activities')
      .aggregate([
        { $match: { affiliateId: { $in: affiliateIds }, action: 'New Admin Signup' } },
        { $group: { _id: '$affiliateId', signupCount: { $sum: 1 } } }
      ]).toArray();

    const enrichedAffiliates = affiliates.map(affiliate => {
      const clickData = clickLogs.find(log => log._id.toString() === affiliate._id.toString()) || {};
      const signupData = signupLogs.find(log => log._id.toString() === affiliate._id.toString()) || {};
      return { ...affiliate, clickCount: clickData.clickCount || 0, signupCount: signupData.signupCount || 0 };
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
};

exports.getOutlets = async (req, res) => {
  try {
    const db = getDb();
    const outlets = await db.collection('outlets').find().toArray();
    const admins = await db.collection('admins').find().toArray();

    const adminMap = new Map(admins.map(admin => [admin._id.toString(), admin]));
    const adminIds = admins.map(admin => admin._id);

    const loginLogs = await db.collection('login_logs')
      .aggregate([
        { $match: { adminId: { $in: adminIds } } },
        { $group: { _id: '$adminId', lastLogin: { $max: '$loginTime' }, loginCount: { $sum: 1 } } }
      ]).toArray();

    const loginMap = new Map(loginLogs.map(log => [log._id.toString(), log]));

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

    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!currentAdmin) return res.status(401).send('Unauthorized');

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
};

exports.getSentMessages = async (req, res) => {
  try {
    const db = getDb();
    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!currentAdmin) {
      req.flash('error', 'Session invalid. Please log in again.');
      return res.redirect('/superadmin/login');
    }

    const messages = await db.collection('messages')
      .find({ senderId: new ObjectId(currentAdmin._id) })
      .sort({ createdAt: -1 })
      .toArray();

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
      currentAdmin,
      success: req.flash('success') || [],
      error: req.flash('error') || []
    });
  } catch (err) {
    console.error('Error fetching sent messages:', err);
    req.flash('error', 'Failed to load sent messages.');
    res.redirect('/superadmin/dashboard');
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const db = getDb();
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
      sender: sender.username,
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
};

exports.getAdminDetails = async (req, res) => {
  try {
    const db = getDb();
    const adminUsername = req.params.adminUsername;

    if (!adminUsername || typeof adminUsername !== 'string' || adminUsername.trim() === '') {
      req.session.error = ['Invalid admin username'];
      return res.redirect('/superadmin/dashboard');
    }

    const admin = await db.collection('admins').findOne({
      username: { $regex: `^${adminUsername}$`, $options: 'i' }
    });

    if (!admin) {
      req.session.error = ['Admin not found'];
      return res.redirect('/superadmin/dashboard');
    }

    if (admin.username !== adminUsername) {
      return res.redirect(`/superadmin/admin/${encodeURIComponent(admin.username)}`);
    }

    const transactions = await db.collection('transactions').find({ adminId: new ObjectId(admin._id) }).toArray().catch(err => {
      console.error('Transaction query error:', err);
      return [];
    });

    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!currentAdmin) {
      req.session.error = ['Current admin not found'];
      return res.redirect('/admin-login');
    }

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
            style: 'currency', currency: currency || 'NGN', minimumFractionDigits: 2
          }).format(amount || 0);
        } catch (e) {
          return `${currency || '₦'} ${parseFloat(amount || 0).toFixed(2)}`;
        }
      }
    });

    req.session.success = null;
    req.session.error = null;

  } catch (error) {
    console.error('Error in admin details route:', error.stack);
    req.session.error = [`Failed to load admin details: ${error.message}`];
    res.redirect('/superadmin/dashboard');
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const db = getDb();
    const adminId = req.params.id;

    if (!ObjectId.isValid(adminId)) {
      req.session.error = ['Valid admin ID'];
      return res.redirect('/superadmin/dashboard');
    }

    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!currentAdmin) {
      req.session.error = ['Current admin not found'];
      return res.redirect('/superadmin/dashboard');
    }
    if (currentAdmin._id.toString() === adminId) {
      req.session.error = ['Cannot delete your own account'];
      return res.redirect('/superadmin/dashboard');
    }

    const adminToDelete = await db.collection('admins').findOne({ _id: new ObjectId(adminId) });
    if (!adminToDelete) {
      req.session.error = ['Admin not found'];
      return res.redirect('/superadmin/dashboard');
    }

    const result = await db.collection('admins').deleteOne({ _id: new ObjectId(adminId) });

    if (result.deletedCount === 1) {
      req.session.success = ['Admin deleted successfully'];
    } else {
      req.session.error = ['Admin not found'];
    }

    res.redirect('/superadmin/dashboard');
  } catch (error) {
    console.error('Error deleting admin:', error);
    req.session.error = ['Failed to delete admin'];
    res.redirect('/superadmin/dashboard');
  }
};

exports.updateAdmin = async (req, res) => {
  try {
    const db = getDb();
    const adminId = req.params.id;
    const { businessName, currency, role, username, phone } = req.body;

    if (!username || !role) {
      req.flash('error', 'Username and role are required.');
      return res.redirect('/superadmin/dashboard');
    }

    if (!['admin', 'superadmin'].includes(role)) {
      req.flash('error', 'Role must be either "admin" or "superadmin".');
      return res.redirect('/superadmin/dashboard');
    }

    const existingAdmin = await db.collection('admins').findOne({
      username,
      _id: { $ne: new ObjectId(adminId) }
    });
    if (existingAdmin) {
      req.flash('error', 'Username already exists.');
      return res.redirect('/superadmin/dashboard');
    }

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
};

exports.resetAdminPassword = async (req, res) => {
  try {
    const db = getDb();
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
};

// ── Featured Ads ─────────────────────────────────────────────────────────────

exports.getAds = async (req, res) => {
  try {
    const db = getDb();
    const currentAdmin = await db.collection('admins').findOne({ username: req.session.admin });
    const ads = await db.collection('featured_ads').find({}).sort({ createdAt: -1 }).toArray();
    const admins = await db.collection('admins').find({ role: { $ne: 'superadmin' } }, { projection: { username: 1, businessName: 1 } }).toArray();
    res.render('superadmin-ads', {
      ads, admins, currentAdmin,
      success: req.flash('success'),
      error: req.flash('error')
    });
  } catch (err) {
    console.error('Error loading ads:', err);
    req.flash('error', 'Failed to load ads.');
    res.redirect('/superadmin/dashboard');
  }
};

exports.postCreateAd = async (req, res) => {
  try {
    const db = getDb();
    const { productName, description, imageUrl, price, currency, storeUrl, businessName, position } = req.body;
    if (!productName || !storeUrl) {
      req.flash('error', 'Product name and store URL are required.');
      return res.redirect('/superadmin/ads');
    }
    await db.collection('featured_ads').insertOne({
      productName: productName.trim(),
      description: (description || '').trim(),
      imageUrl: (imageUrl || '').trim(),
      price: parseFloat(price) || 0,
      currency: (currency || '₦').trim(),
      storeUrl: storeUrl.trim(),
      businessName: (businessName || '').trim(),
      position: position || 'both',
      isActive: true,
      createdAt: new Date()
    });
    req.flash('success', 'Ad created successfully.');
    res.redirect('/superadmin/ads');
  } catch (err) {
    console.error('Error creating ad:', err);
    req.flash('error', 'Failed to create ad.');
    res.redirect('/superadmin/ads');
  }
};

exports.postToggleAd = async (req, res) => {
  try {
    const db = getDb();
    const ad = await db.collection('featured_ads').findOne({ _id: new ObjectId(req.params.id) });
    if (!ad) { req.flash('error', 'Ad not found.'); return res.redirect('/superadmin/ads'); }
    await db.collection('featured_ads').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { isActive: !ad.isActive } }
    );
    req.flash('success', `Ad ${ad.isActive ? 'deactivated' : 'activated'}.`);
    res.redirect('/superadmin/ads');
  } catch (err) {
    console.error('Error toggling ad:', err);
    req.flash('error', 'Failed to update ad.');
    res.redirect('/superadmin/ads');
  }
};

exports.postDeleteAd = async (req, res) => {
  try {
    const db = getDb();
    await db.collection('featured_ads').deleteOne({ _id: new ObjectId(req.params.id) });
    req.flash('success', 'Ad deleted.');
    res.redirect('/superadmin/ads');
  } catch (err) {
    console.error('Error deleting ad:', err);
    req.flash('error', 'Failed to delete ad.');
    res.redirect('/superadmin/ads');
  }
};

exports.getCreateAdmin = (req, res) => {
  res.render('create-admin', { error: null });
};

exports.postCreateAdmin = async (req, res) => {
  const db = getDb();
  const { username, password, role } = req.body;
  const logoPath = req.file ? `/uploads/${req.file.filename}` : null;
  const existingAdmin = await db.collection('admins').findOne({ username });
  if (existingAdmin) return res.render('create-admin', { error: 'Username already exists' });

  const hashedPassword = await bcrypt.hash(password, 10);
  await db.collection('admins').insertOne({
    username, password: hashedPassword,
    role: role || 'superadmin',
    logo: logoPath,
    createdAt: new Date()
  });
  res.redirect('/superadmin/dashboard');
};

exports.getEditAdmin = async (req, res) => {
  const db = getDb();
  const adminId = req.params.id;
  const admin = await db.collection('admins').findOne({ _id: new ObjectId(adminId) });
  res.render('edit-admin', { admin, error: null });
};

exports.postEditAdmin = async (req, res) => {
  const db = getDb();
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
};

exports.broadcastSocialUpdate = async (req, res) => {
  let broadcastLog;
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({
      username: req.session.admin,
      role: 'superadmin'
    });

    if (!admin) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Only superadmins can broadcast' });
    }

    const users = await db.collection('admins').find({
      email: { $exists: true, $ne: '' },
      status: { $ne: 'test' }
    }).toArray();

    if (users.length === 0) {
      return res.json({ success: true, message: 'No valid users found to broadcast to', successCount: 0, failCount: 0, skipped: 0 });
    }

    let successCount = 0;
    let failCount = 0;
    const failedEmails = [];
    const batchSize = 5;
    const delayBetweenBatches = 3000;

    broadcastLog = await db.collection('broadcast_logs').insertOne({
      type: 'social_update',
      initiatedBy: admin._id,
      startTime: new Date(),
      totalRecipients: users.length,
      status: 'processing'
    });

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      const batchPromises = batch.map(async (user) => {
        try {
          const mailOptions = {
            from: `"Stanley [at] Shed" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: '🌟 New Feature: Social Media Integration!',
            html: `<p>New features available on Shed!</p>`
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

      const batchResults = await Promise.all(batchPromises);

      await db.collection('broadcast_progress').insertOne({
        broadcastId: broadcastLog._id,
        batchIndex: i / batchSize,
        processed: batch.length,
        successes: batchResults.filter(r => r.success).length,
        failures: batchResults.filter(r => !r.success).length,
        timestamp: new Date()
      });

      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    await db.collection('broadcast_logs').updateOne(
      { _id: broadcastLog._id },
      { $set: { endTime: new Date(), status: 'completed', successCount, failCount, failedEmails } }
    );

    res.json({
      success: true,
      message: `Broadcast completed successfully to ${successCount} users`,
      successCount, failCount,
      failedEmails: failedEmails.length > 0 ? failedEmails : undefined
    });

  } catch (error) {
    console.error('Broadcast failed:', error);
    if (broadcastLog?._id) {
      const db = getDb();
      await db.collection('broadcast_logs').updateOne(
        { _id: broadcastLog._id },
        { $set: { endTime: new Date(), status: 'failed', error: error.message } }
      );
    }
    res.status(500).json({ success: false, message: 'Broadcast failed', error: error.message });
  }
};
