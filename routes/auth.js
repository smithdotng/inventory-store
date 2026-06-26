const express = require('express');
const router = express.Router();
const { uploadLogo } = require('../config/multer');
const authController = require('../controllers/authController');

router.get('/admin-login', authController.getLogin);
router.post('/admin-login', authController.postLogin);
router.get('/admin-register', authController.getRegister);
router.post('/admin-register', uploadLogo, authController.postRegister);
router.get('/admin-logout', authController.logout);
router.get('/forgot-password', authController.getForgotPassword);
router.post('/forgot-password', authController.postForgotPassword);
router.get('/reset-password', authController.getResetPassword);
router.post('/reset-password', authController.postResetPassword);
router.get('/reset-password/:token', authController.getResetPasswordToken);
router.post('/reset-password/:token', authController.postResetPasswordToken);

module.exports = router;
