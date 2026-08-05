const express = require('express');
const router = express.Router();
const { isAuthenticated, isSuperAdmin } = require('../middleware/auth');
const { uploadLogo } = require('../config/multer');
const superadminController = require('../controllers/superadminController');

router.get('/dashboard', isAuthenticated, isSuperAdmin, superadminController.getDashboard);
router.get('/affiliates', isAuthenticated, isSuperAdmin, superadminController.getAffiliates);
router.get('/outlets', isAuthenticated, isSuperAdmin, superadminController.getOutlets);
router.get('/sent-messages', isAuthenticated, isSuperAdmin, superadminController.getSentMessages);
router.post('/send-message', isAuthenticated, isSuperAdmin, superadminController.sendMessage);
router.get('/admin/:adminUsername', isAuthenticated, isSuperAdmin, superadminController.getAdminDetails);
router.post('/delete-admin/:id', isAuthenticated, isSuperAdmin, superadminController.deleteAdmin);
router.post('/update-admin/:id', isAuthenticated, isSuperAdmin, superadminController.updateAdmin);
router.post('/reset-password/:id', isAuthenticated, isSuperAdmin, superadminController.resetAdminPassword);
router.post('/subscription/:id/comp', isAuthenticated, isSuperAdmin, superadminController.postCompSubscription);
router.get('/ads', isAuthenticated, isSuperAdmin, superadminController.getAds);
router.post('/ads/create', isAuthenticated, isSuperAdmin, superadminController.postCreateAd);
router.post('/ads/toggle/:id', isAuthenticated, isSuperAdmin, superadminController.postToggleAd);
router.post('/ads/delete/:id', isAuthenticated, isSuperAdmin, superadminController.postDeleteAd);

router.get('/create-admin', isAuthenticated, isSuperAdmin, superadminController.getCreateAdmin);
router.post('/create-admin', isAuthenticated, isSuperAdmin, uploadLogo, superadminController.postCreateAdmin);
router.get('/edit-admin/:id', isAuthenticated, isSuperAdmin, superadminController.getEditAdmin);
router.post('/edit-admin/:id', isAuthenticated, isSuperAdmin, uploadLogo, superadminController.postEditAdmin);

module.exports = router;
