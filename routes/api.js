const express = require('express');
const router = express.Router();
const { isAuthenticated, isSuperAdmin, requireRole } = require('../middleware/auth');
const { uploadProductImages, uploadLogo } = require('../config/multer');
const apiController = require('../controllers/apiController');

// Subscribe (rate limited)
router.post('/api/subscribe', apiController.subscribeLimiter, express.json(), apiController.postSubscribe);

// Auth API
router.post('/api/auth/login', apiController.postAuthLogin);
router.post('/api/auth/logout', apiController.postAuthLogout);
router.get('/api/auth/me', isAuthenticated, apiController.getAuthMe);

// Admin dashboard API
router.get('/api/admin/overview', isAuthenticated, apiController.getAdminOverview);
router.get('/api/admin/products', isAuthenticated, apiController.getAdminProducts);
router.post('/api/admin/products', isAuthenticated, uploadProductImages, apiController.postAdminProduct);
router.patch('/api/admin/products/:id', isAuthenticated, apiController.patchAdminProduct);
router.delete('/api/admin/products/:id', isAuthenticated, apiController.deleteAdminProduct);
router.get('/api/admin/transactions', isAuthenticated, apiController.getAdminTransactions);
router.post('/api/admin/transactions/:saleId/mark-paid', isAuthenticated, apiController.postAdminMarkPaid);
router.get('/api/admin/customers', isAuthenticated, apiController.getAdminCustomers);
router.post('/api/admin/customers', isAuthenticated, apiController.postAdminCustomer);
router.get('/api/admin/invoices', isAuthenticated, apiController.getAdminInvoices);
router.post('/api/admin/invoices', isAuthenticated, apiController.postAdminInvoice);
router.get('/api/admin/profile', isAuthenticated, apiController.getAdminProfile);
router.post('/api/admin/profile', isAuthenticated, uploadLogo, apiController.postAdminProfile);
router.get('/api/admin/team', isAuthenticated, requireRole('admin', 'superadmin'), apiController.getAdminTeam);
router.post('/api/admin/team/:id/:action', isAuthenticated, requireRole('admin', 'superadmin'), apiController.postAdminTeamAction);

// Public store API
router.get('/api/public/store/:username', apiController.getPublicStore);
router.get('/api/public/store/:username/product/:id', apiController.getPublicStoreProduct);
router.get('/api/public/store/:username/order/:saleId', apiController.getPublicOrder);
router.get('/api/public/store/:username/order/:saleId/invoice.pdf', apiController.getPublicOrderInvoicePdf);

// Inventory API
router.get('/api/inventory', isAuthenticated, apiController.getApiInventory);

// Search APIs
router.get('/api/search/suggestions', apiController.getSearchSuggestions);
router.get('/api/products/search', apiController.getProductsSearch);
router.get('/api/stores/search', apiController.getStoresSearch);

// Debug APIs
router.get('/api/debug/search-test', apiController.getDebugSearchTest);
router.get('/api/debug/stores', apiController.getDebugStores);
router.get('/api/debug/products', apiController.getDebugProducts);

// Fix APIs
router.get('/api/fix/activate-stores', isAuthenticated, isSuperAdmin, apiController.getFixActivateStores);

// Public invoice
const { getPublicInvoice } = require('../controllers/invoiceController');
router.get('/public-invoice/:saleId', getPublicInvoice);

module.exports = router;
