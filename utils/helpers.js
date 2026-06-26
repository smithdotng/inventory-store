const { ObjectId } = require('mongodb');
const { getDb } = require('../config/db');

function formatCurrency(amount) {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

async function calculateOutletCommission(outletId) {
  try {
    const db = getDb();
    const result = await db.collection('commissions').aggregate([
      { $match: { outletId: new ObjectId(outletId), status: 'pending' } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]).toArray();
    return result[0]?.total || 0;
  } catch (error) {
    console.error('Error calculating commission:', error);
    return 0;
  }
}

async function getOutletsWithCommission(adminId) {
  const db = getDb();
  const outlets = await db.collection('outlets')
    .find({ adminId: new ObjectId(adminId) })
    .toArray();

  return Promise.all(outlets.map(async outlet => {
    const commissionDue = await calculateOutletCommission(outlet._id);
    return { ...outlet, commissionDue };
  }));
}

function getDashboardUrl(role) {
  switch(role) {
    case 'cashier':
      return '/pos';
    case 'stock_clerk':
      return '/inventory';
    case 'admin':
    case 'superadmin':
      return '/home';
    default:
      return '/home';
  }
}

async function getCurrentAdmin(req) {
  const db = getDb();
  if (req.user) {
    if (req.user.type === 'admin') {
      return await db.collection('admins').findOne({ _id: new ObjectId(req.user._id) });
    } else if (req.user.type === 'business_user') {
      return await db.collection('admins').findOne({ _id: new ObjectId(req.user.adminId) });
    }
  } else if (req.session.admin) {
    return await db.collection('admins').findOne({ username: req.session.admin });
  }
  return null;
}

async function getSessionAdmin(req) {
  const db = getDb();
  if (req.session.admin) {
    return db.collection('admins').findOne({ username: req.session.admin });
  }
  if (req.session.adminId) {
    return db.collection('admins').findOne({ _id: new ObjectId(req.session.adminId) });
  }
  return null;
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (err) {
    return false;
  }
}

function validateBusinessUser(userData) {
  const errors = [];

  const requiredFields = ['adminId', 'firstName', 'lastName', 'email', 'role', 'status'];
  for (const field of requiredFields) {
    if (!userData[field]) {
      errors.push(`${field} is required`);
    }
  }

  if (userData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
    errors.push('Invalid email format');
  }

  if (userData.firstName && (userData.firstName.length < 2 || userData.firstName.length > 50)) {
    errors.push('First name must be between 2 and 50 characters');
  }

  if (userData.lastName && (userData.lastName.length < 2 || userData.lastName.length > 50)) {
    errors.push('Last name must be between 2 and 50 characters');
  }

  const validRoles = ['cashier', 'stock_clerk', 'admin'];
  if (userData.role && !validRoles.includes(userData.role)) {
    errors.push(`Role must be one of: ${validRoles.join(', ')}`);
  }

  const validStatuses = ['pending', 'active', 'inactive'];
  if (userData.status && !validStatuses.includes(userData.status)) {
    errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
  }

  if (userData.permissions && Array.isArray(userData.permissions)) {
    const validPermissions = ['view_reports', 'manage_customers', 'export_data', 'view_analytics'];
    for (const perm of userData.permissions) {
      if (!validPermissions.includes(perm)) {
        errors.push(`Invalid permission: ${perm}`);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}

module.exports = {
  formatCurrency,
  getPaymentMethodIcon,
  calculateOutletCommission,
  getOutletsWithCommission,
  getDashboardUrl,
  getCurrentAdmin,
  getSessionAdmin,
  isValidUrl,
  validateBusinessUser
};
