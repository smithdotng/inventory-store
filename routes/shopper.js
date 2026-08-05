const express = require('express');
const router = express.Router();
const shopper = require('../controllers/shopperController');
const invoiceController = require('../controllers/invoiceController');

router.get('/shopper/register', shopper.getRegister);
router.post('/shopper/register', shopper.postRegister);
router.get('/shopper/verify-email', shopper.getVerifyEmail);
router.post('/shopper/verify-email', shopper.postVerifyEmail);
router.post('/shopper/verify-email/resend', shopper.resendVerifyEmail);
router.get('/shopper/login', shopper.getLogin);
router.post('/shopper/login', shopper.postLogin);
router.get('/shopper/logout', shopper.logout);
router.get('/shopper/account', shopper.requireShopper, shopper.getAccount);
router.get('/shopper/orders/:saleId/invoice', shopper.requireShopper, invoiceController.getShopperInvoice);

module.exports = router;
