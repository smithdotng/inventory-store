const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const billing = require('../controllers/billingController');

router.get('/billing', isAuthenticated, billing.getBilling);
router.post('/billing/subscribe', isAuthenticated, billing.postSubscribe);
router.get('/billing/callback', isAuthenticated, billing.getCallback);
router.post('/webhooks/flutterwave', billing.postWebhook);

module.exports = router;
