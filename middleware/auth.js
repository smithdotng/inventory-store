const { ObjectId } = require('mongodb');
const { getDb } = require('../config/db');
const { isAccountLocked } = require('../utils/subscription');

// Paths an admin/business_user should always be able to reach even when their
// store is locked for non-payment — otherwise they could never fix it.
const LOCKOUT_ALLOWLIST = ['/billing', '/billing/subscribe', '/billing/callback', '/admin-logout', '/account-locked'];

// Session validation middleware - validates every authenticated request
function setupSessionValidation(app) {
  app.use(async (req, res, next) => {
    console.log('=== SESSION VALIDATION MIDDLEWARE ===');
    console.log('Path:', req.path);
    console.log('Session data:', {
      admin: req.session.admin,
      userId: req.session.userId,
      adminId: req.session.adminId,
      role: req.session.role,
      username: req.session.username
    });

    // Skip for non-authenticated routes
    const publicRoutes = [
      '/',
      '/admin-login',
      '/admin-register',
      '/verify-email',
      '/verify-email/resend',
      '/blog',
      '/contact',
      '/forgot-password',
      '/reset-password',
      '/referrals/login',
      '/referrals/signup',
      '/referrals/forgot-password',
      '/referrals/reset-password',
      '/setup-account',
      '/manifest.json',
      '/sw.js',
      '/offline.html',
      '/site.webmanifest',
      '/status',
      '/health',
      '/buyer',
      '/buyer/login',
      '/buyer/logout',
      '/cart',
      '/cart/count'
    ];

    const publicRoutePrefixes = [
      '/store/',
      '/outlet/',
      '/api/',
      '/blog/',
      '/public-invoice/',
      '/search',
      '/buyer/',
      '/shopper/',
      '/cart/',
      '/webhooks/'
    ];

    const isExactPublicRoute = publicRoutes.some(route => req.path === route);
    const isPrefixPublicRoute = publicRoutePrefixes.some(prefix => {
      if (prefix.endsWith('/')) {
        return req.path.startsWith(prefix);
      }
      return req.path === prefix;
    });

    const isPublicRoute = isExactPublicRoute || isPrefixPublicRoute;

    console.log('Route check:', { path: req.path, isExactPublicRoute, isPrefixPublicRoute, isPublicRoute });

    if (isPublicRoute) {
      console.log('✅ Skipping validation for public route');
      return next();
    }

    console.log('🔒 Route requires authentication, validating session...');

    if (req.session.admin || req.session.userId) {
      console.log('🔍 User has session, validating...');

      try {
        const db = getDb();
        let user = null;
        let userType = null;

        if (req.session.admin) {
          console.log('Looking for admin with username:', req.session.admin);
          user = await db.collection('admins').findOne({ username: req.session.admin });
          userType = 'admin';
        } else if (req.session.userId) {
          console.log('Looking for business user with ID:', req.session.userId);

          if (!ObjectId.isValid(req.session.userId)) {
            console.error('❌ Invalid ObjectId in session.userId:', req.session.userId);
            req.session.destroy();
            return res.redirect('/admin-login?error=Invalid session. Please log in again.');
          }

          user = await db.collection('business_users').findOne({
            _id: new ObjectId(req.session.userId)
          });
          userType = 'business_user';

          if (user && user.status !== 'active') {
            console.log(`⚠️ Business user found but status is "${user.status}", not "active"`);
            user = null;
          }
        }

        console.log('User found:', user ? '✅ YES' : '❌ NO');
        console.log('User type:', userType);

        if (!user) {
          console.warn('❌ Invalid session - user not found in database');
          req.session.destroy();
          return res.redirect('/admin-login?error=Session expired. Please log in again.');
        }

        req.user = {
          _id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          type: userType,
          _original: user
        };

        let ownerAdminDoc = null;

        if (userType === 'admin') {
          req.user.businessName = user.businessName;
          req.user.logo = user.logo;
          req.user.currency = user.currency;
          req.user.country = user.country;
          req.user.applyVat = user.applyVat;
          req.user.vatRate = user.vatRate;
          ownerAdminDoc = user;
        } else if (userType === 'business_user') {
          req.user.adminId = user.adminId;
          req.user.businessName = user.businessName;
          req.user.firstName = user.firstName;
          req.user.lastName = user.lastName;
          req.user.permissions = user.permissions || [];

          if (user.adminId) {
            const admin = await db.collection('admins').findOne({
              _id: new ObjectId(user.adminId)
            });
            if (admin) {
              ownerAdminDoc = admin;
              req.user.adminDetails = {
                businessName: admin.businessName,
                logo: admin.logo,
                currency: admin.currency,
                country: admin.country,
                applyVat: admin.applyVat,
                vatRate: admin.vatRate
              };
            }
          }
        }

        // ── Subscription lockout — full lockout of dashboard access once a
        // store owner's trial/subscription has lapsed. Superadmins and the
        // billing/logout pages themselves are always reachable.
        if (user.role !== 'superadmin' && !LOCKOUT_ALLOWLIST.includes(req.path) && isAccountLocked(ownerAdminDoc)) {
          console.log('🔒 Subscription locked — blocking', req.path);
          if (userType === 'admin') {
            return res.redirect('/billing?locked=1');
          }
          return res.status(403).render('account-locked', {
            businessName: (ownerAdminDoc && (ownerAdminDoc.businessName || ownerAdminDoc.username)) || 'This store',
            forBusinessUser: true
          });
        }

        if (!req.session.role && user.role) req.session.role = user.role;
        if (!req.session.username && user.username) req.session.username = user.username;

        if (userType === 'business_user') {
          if (!req.session.adminId && user.adminId) req.session.adminId = user.adminId.toString();
          if (!req.session.firstName && user.firstName) req.session.firstName = user.firstName;
        }

        console.log('✅ Session validated successfully');
        next();

      } catch (error) {
        console.error('❌ Session validation error:', error);
        req.session.destroy();
        return res.redirect('/admin-login?error=Session error. Please log in again.');
      }
    } else {
      console.log('❌ No session found, redirecting to login');
      res.redirect('/admin-login');
    }
  });
}

function isAuthenticated(req, res, next) {
  console.log('=== isAuthenticated middleware ===');
  console.log('Path:', req.path);
  console.log('Session:', { userId: req.session.userId, admin: req.session.admin, role: req.session.role });

  if (req.session.admin || req.session.userId) {
    console.log('✅ User is authenticated');
    return next();
  }

  console.log('❌ User not authenticated');
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.redirect('/admin-login');
}

function requireRole(...roles) {
  return async function(req, res, next) {
    const isApi = req.path.startsWith('/api/');
    if (!req.session.admin && !req.session.userId) {
      return isApi
        ? res.status(401).json({ error: 'Not authenticated' })
        : res.redirect('/admin-login');
    }

    if (req.session.role === 'superadmin' || req.session.role === 'admin') {
      return next();
    }

    if (!req.session.role || !roles.includes(req.session.role)) {
      if (isApi) {
        return res.status(403).json({ error: 'You do not have permission for this action' });
      }
      return res.status(403).render('403', {
        message: 'You do not have permission to access this page',
        role: req.session.role,
        requiredRoles: roles
      });
    }
    next();
  };
}

function isSuperAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect('/admin-login');
  }
  (async () => {
    try {
      const db = getDb();
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

function isOutletAuthenticated(req, res, next) {
  if (req.session.outletId) return next();
  res.redirect('/outlet-login');
}

module.exports = {
  setupSessionValidation,
  isAuthenticated,
  requireRole,
  isSuperAdmin,
  isAffiliateAuthenticated,
  isOutletAuthenticated
};
