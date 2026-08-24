const express = require('express');
const router = express.Router();
const { isAuthenticated, isOutletAuthenticated } = require('../middleware/auth');
const outletController = require('../controllers/outletController');

router.get('/create-outlet', isAuthenticated, outletController.getCreateOutlet);
router.post('/create-outlet', isAuthenticated, outletController.postCreateOutlet);
router.post('/delete-outlet/:outletId', isAuthenticated, outletController.postDeleteOutletForm);
router.post('/delete-outlet', isAuthenticated, outletController.postDeleteOutlet);
router.get('/outlet-login', outletController.getOutletLogin);
router.get('/outlet-logout', outletController.getOutletLogout);
router.post('/outlet-login', outletController.postOutletLogin);
router.get('/outlet-details/:outletId', isAuthenticated, outletController.getOutletDetails);
router.get('/dispense-to-outlet/:outletId', isAuthenticated, outletController.getDispenseToOutlet);
router.post('/dispense-to-outlet/:outletId', isAuthenticated, outletController.postDispenseToOutlet);
router.post('/dispense', isOutletAuthenticated, outletController.postDispense);
// Note: /outlet/sales-form must come before /outlet/:outletUsername to avoid conflicts
router.get('/outlet/sales-form', isOutletAuthenticated, outletController.getOutletSalesForm);
router.post('/outlet/sales-form', isOutletAuthenticated, outletController.postOutletSalesForm);
router.get('/outlet/:outletId/stock-view', isOutletAuthenticated, outletController.getOutletStockView);
router.get('/outlet/:outletUsername', outletController.getOutletStorefront);
router.get('/outlet-transactions/:outletId', isOutletAuthenticated, outletController.getOutletTransactions);
router.get('/outlet-customers/:outletId', isOutletAuthenticated, outletController.getOutletCustomers);
router.post('/pay-commission/:outletId', isAuthenticated, outletController.postPayCommission);

module.exports = router;
