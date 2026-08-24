const express = require('express');
const router  = express.Router();
const buyer   = require('../controllers/buyerController');

router.get( '/buyer',               buyer.getDashboard);
router.get( '/buyer/login',         buyer.getLogin);
router.post('/buyer/login/otp',     buyer.postSendOTP);
router.post('/buyer/login/verify',  buyer.postVerifyOTP);
router.get( '/buyer/logout',        buyer.logout);

module.exports = router;
