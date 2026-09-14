const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');

router.get('/login', referralController.getLogin);
router.post('/login', referralController.postLogin);
router.get('/signup', referralController.getSignup);
router.post('/signup', referralController.postSignup);
router.get('/forgot-password', referralController.getForgotPassword);
router.post('/forgot-password', referralController.postForgotPassword);
router.get('/reset-password', referralController.getResetPassword);
router.post('/reset-password', referralController.postResetPassword);
router.get('/dashboard', referralController.getDashboard);
router.get('/logout', referralController.logout);

module.exports = router;
