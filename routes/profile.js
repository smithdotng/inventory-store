const express = require('express');
const router = express.Router();
const { uploadLogo } = require('../config/multer');
const { isAuthenticated, requireRole } = require('../middleware/auth');
const profileController = require('../controllers/profileController');

router.get('/profile', isAuthenticated, profileController.getProfile);
router.post('/profile/update', isAuthenticated, uploadLogo, profileController.postProfileUpdate);
router.get('/business-users', isAuthenticated, requireRole('admin', 'superadmin'), profileController.getBusinessUsers);
router.post('/business-users/add', isAuthenticated, requireRole('admin', 'superadmin'), profileController.postAddBusinessUser);
router.post('/business-users/activate/:userId', isAuthenticated, requireRole('admin', 'superadmin'), profileController.postActivateUser);
router.post('/business-users/deactivate/:userId', isAuthenticated, requireRole('admin', 'superadmin'), profileController.postDeactivateUser);
router.post('/business-users/resend-invite/:userId', isAuthenticated, requireRole('admin', 'superadmin'), profileController.postResendInvite);
router.get('/setup-account/:token', profileController.getSetupAccount);
router.post('/setup-account/:token', profileController.postSetupAccount);

module.exports = router;
