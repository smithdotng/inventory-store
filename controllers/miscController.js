const { ObjectId } = require('mongodb');
const path = require('path');
const { getDb } = require('../config/db');

// GET /
exports.getLanding = (req, res) => res.render('landing', { error: null });

// GET /landing
exports.getLandingPage = (req, res) => {
  res.render('landing', { admin: { currency: '$' } });
};

// GET /home redirect for non-auth
exports.getIndex = (req, res) => res.render('landing', { error: null });

// GET /status
exports.getStatus = (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'status.jpg'));
};

// GET /health
exports.getHealth = async (req, res) => {
  try {
    const db = getDb();
    if (!db) return res.status(500).json({ status: 'error', message: 'Database not initialized' });
    await db.collection('outlets').findOne({});
    res.json({ status: 'ok', message: 'Database connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// GET /manifest.json
exports.getManifest = (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'manifest.json'));
};

// GET /site.webmanifest
exports.getSiteWebmanifest = (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'site.webmanifest'));
};

// GET /sw.js
exports.getServiceWorker = (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'sw.js'));
};

// GET /offline.html
exports.getOffline = (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'offline.html'));
};

// GET /admin-messages
exports.getAdminMessages = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      req.flash('error', 'Admin not found.');
      return res.redirect('/home');
    }

    const deletedCount = await db.collection('messages').countDocuments({
      $or: [{ recipientId: admin._id }, { recipientId: null }],
      deleted: true
    });

    let query = {
      $or: [{ recipientId: admin._id }, { recipientId: null }],
      deleted: { $ne: true }
    };

    if (req.query.search) {
      const senderAdmins = await db.collection('admins')
        .find({ username: { $regex: req.query.search, $options: 'i' } })
        .project({ _id: 1 })
        .toArray();
      const senderIds = senderAdmins.map(a => a._id);
      query.$and = [{
        $or: [
          { senderId: { $in: senderIds } },
          { subject: { $regex: req.query.search, $options: 'i' } },
          { content: { $regex: req.query.search, $options: 'i' } }
        ]
      }];
    }

    const messages = await db.collection('messages').aggregate([
      { $match: query },
      { $lookup: { from: 'admins', localField: 'senderId', foreignField: '_id', as: 'senderInfo' } },
      { $project: {
        _id: 1,
        sender: { $arrayElemAt: ['$senderInfo.username', 0] },
        subject: 1, content: 1, createdAt: 1, read: 1, readAt: 1, isHtml: 1
      }},
      { $sort: { createdAt: -1 } }
    ]).toArray();

    res.render('messages', {
      username: req.session.admin,
      admin, messages, deletedCount,
      search: req.query.search || '',
      success: req.flash('success'),
      error: req.flash('error'),
      formatDate: (date) => new Date(date).toLocaleString(),
      currentPage: 'messages'
    });
  } catch (err) {
    console.error('Error in /admin-messages:', err);
    req.flash('error', 'Failed to load messages.');
    res.redirect('/home');
  }
};

// POST /admin/mark-message
exports.postMarkMessage = async (req, res) => {
  try {
    const db = getDb();
    const { _id, read } = req.body;
    await db.collection('messages').updateOne(
      { _id: new ObjectId(_id) },
      { $set: { read, readAt: read ? new Date() : null } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /admin/mark-message:', err);
    res.json({ success: false, error: 'Failed to update message status' });
  }
};

// POST /mark-as-read
exports.postMarkAsRead = async (req, res) => {
  try {
    const db = getDb();
    const { _id, read } = req.body;

    if (!_id || !ObjectId.isValid(_id)) {
      return res.status(400).json({ error: 'Invalid message ID', success: false });
    }

    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) return res.status(403).json({ error: 'Admin not found', success: false });

    const updateResult = await db.collection('messages').updateOne(
      { _id: new ObjectId(_id), $or: [{ recipientId: admin._id }, { recipientId: null }] },
      { $set: { read: read === 'false', readAt: new Date() } }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(404).json({ error: 'Message not found or no changes made', success: false });
    }

    res.json({ success: true, read: read === 'false' });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Error updating message status', success: false });
  }
};

// POST /admin/delete-message
exports.postDeleteMessage = async (req, res) => {
  try {
    const db = getDb();
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

    const result = await db.collection('messages').updateOne(
      { _id: new ObjectId(_id), $or: [{ recipientId: admin._id }, { recipientId: null }] },
      { $set: { deleted: true, deletedAt: new Date(), deletedBy: admin._id } }
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
};

// GET /admin-messages/trash
exports.getAdminMessagesTrash = async (req, res) => {
  try {
    const db = getDb();
    const admin = await db.collection('admins').findOne({ username: req.session.admin });
    if (!admin) {
      req.flash('error', 'Admin not found.');
      return res.redirect('/home');
    }

    let query = {
      $or: [{ recipientId: admin._id }, { recipientId: null }],
      deleted: true
    };

    if (req.query.search) {
      const senderAdmins = await db.collection('admins')
        .find({ username: { $regex: req.query.search, $options: 'i' } })
        .project({ _id: 1 })
        .toArray();
      const senderIds = senderAdmins.map(a => a._id);
      query.$and = [{
        $or: [
          { senderId: { $in: senderIds } },
          { subject: { $regex: req.query.search, $options: 'i' } },
          { content: { $regex: req.query.search, $options: 'i' } }
        ]
      }];
    }

    const deletedMessages = await db.collection('messages').aggregate([
      { $match: query },
      { $lookup: { from: 'admins', localField: 'senderId', foreignField: '_id', as: 'senderInfo' } },
      { $lookup: { from: 'admins', localField: 'deletedBy', foreignField: '_id', as: 'deletedByInfo' } },
      { $project: {
        _id: 1,
        sender: { $arrayElemAt: ['$senderInfo.username', 0] },
        deletedBy: { $arrayElemAt: ['$deletedByInfo.username', 0] },
        subject: 1, content: 1, createdAt: 1, deletedAt: 1, read: 1, readAt: 1, isHtml: 1
      }},
      { $sort: { deletedAt: -1 } }
    ]).toArray();

    res.render('admin-messages-trash', {
      username: req.session.admin,
      admin,
      messages: deletedMessages,
      search: req.query.search || '',
      success: req.flash('success'),
      error: req.flash('error'),
      formatDate: (date) => new Date(date).toLocaleString(),
      currentPage: 'trash'
    });
  } catch (err) {
    console.error('Error in /admin-messages/trash:', err);
    req.flash('error', 'Failed to load trash.');
    res.redirect('/admin-messages');
  }
};

// POST /admin/restore-message
exports.postRestoreMessage = async (req, res) => {
  try {
    const db = getDb();
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

    const result = await db.collection('messages').updateOne(
      { _id: new ObjectId(_id), deletedBy: admin._id },
      { $unset: { deleted: '', deletedAt: '', deletedBy: '' } }
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
};

// POST /admin/permanently-delete-message
exports.postPermanentlyDeleteMessage = async (req, res) => {
  try {
    const db = getDb();
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

    const result = await db.collection('messages').deleteOne({ _id: new ObjectId(_id), deletedBy: admin._id });

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
};

// GET /handle-link
exports.getHandleLink = (req, res) => {
  const url = req.query.url || '';
  if (url.startsWith('web+shed://invoices')) {
    res.redirect('/invoices');
  } else if (url.startsWith('web+shed://update-stock') || url.startsWith('web+shed://inventory')) {
    res.redirect('/inventory');
  } else {
    res.redirect('/home');
  }
};

// Catch-all for service workers
exports.catchAll = (req, res, next) => {
  if (req.headers['service-worker']) {
    const filePath = path.join(__dirname, '..', 'public', 'sw.js');
    return res.sendFile(filePath);
  }
  next();
};

exports.broadcastSocialUpdate = async (req, res) => {
  const { getDb } = require('../config/db');
  const { transporter } = require('../config/mailer');
  const db = getDb();
  let broadcastLog;
  try {
    const admin = await db.collection('admins').findOne({
      username: req.session.admin,
      role: 'superadmin'
    });
    if (!admin) return res.status(403).json({ success: false, message: 'Unauthorized' });

    const users = await db.collection('admins').find({
      email: { $exists: true, $ne: '' },
      status: { $ne: 'test' }
    }).toArray();

    if (users.length === 0) {
      return res.json({ success: true, message: 'No users to broadcast to', successCount: 0, failCount: 0 });
    }

    let successCount = 0;
    let failCount = 0;
    const failedEmails = [];
    const batchSize = 5;

    broadcastLog = await db.collection('broadcast_logs').insertOne({
      type: 'social_update',
      initiatedBy: admin._id,
      startTime: new Date(),
      totalRecipients: users.length,
      status: 'processing'
    });

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      await Promise.all(batch.map(async (user) => {
        try {
          await transporter.sendMail({
            from: `"Stanley [at] Shed" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: '🌟 New Feature: Social Media Integration!',
            html: `<p>Hi ${user.username}, check out the new social media integration on your Shed storefront!</p>`
          });
          successCount++;
        } catch (err) {
          failCount++;
          failedEmails.push(user.email);
        }
      }));
      if (i + batchSize < users.length) await new Promise(r => setTimeout(r, 3000));
    }

    await db.collection('broadcast_logs').updateOne(
      { _id: broadcastLog.insertedId },
      { $set: { endTime: new Date(), status: 'completed', successCount, failCount, failedEmails } }
    );

    res.json({ success: true, successCount, failCount });
  } catch (error) {
    console.error('Broadcast failed:', error);
    res.status(500).json({ success: false, message: 'Broadcast failed', error: error.message });
  }
};
