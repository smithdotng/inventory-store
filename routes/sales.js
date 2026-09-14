const express = require('express');
const router = express.Router();
const { isAuthenticated, requireRole } = require('../middleware/auth');
const salesController = require('../controllers/salesController');

router.get('/pos-debug', salesController.getPosDebug);
router.get('/pos', requireRole('cashier', 'stock_clerk', 'admin', 'superadmin'), salesController.getPos);
router.post('/admin/sales-form', isAuthenticated, salesController.postSalesForm);
router.get('/payment-sales-confirmation/:saleId', isAuthenticated, requireRole('cashier', 'stock_clerk', 'admin', 'superadmin'), salesController.getPaymentConfirmation);
router.post('/confirm-sale', isAuthenticated, salesController.postConfirmSale);
router.post('/admin/confirm-sale', isAuthenticated, requireRole('stock_clerk', 'admin', 'superadmin'), salesController.postAdminConfirmSale);
router.get('/sale-success/:saleId', isAuthenticated, salesController.getSaleSuccess);
router.post('/send-receipt-email/:saleId', isAuthenticated, salesController.postSendReceiptEmail);
router.get('/receipt/:saleId', isAuthenticated, salesController.getReceipt);
router.get('/transactions', isAuthenticated, salesController.getTransactions);
router.post('/transactions/mark-paid/:saleId', isAuthenticated, salesController.postMarkPaid);
router.get('/commission-reports', isAuthenticated, salesController.getCommissionReports);

module.exports = router;
