const express = require('express');
const router = express.Router();
const { isAuthenticated, isSuperAdmin } = require('../middleware/auth');
const miscController = require('../controllers/miscController');
const profileController = require('../controllers/profileController');

router.get('/', miscController.getLanding);
router.get('/landing', miscController.getLandingPage);
router.get('/home', isAuthenticated, profileController.getHome);
router.get('/status', miscController.getStatus);
router.get('/health', miscController.getHealth);
router.get('/manifest.json', miscController.getManifest);
router.get('/site.webmanifest', miscController.getSiteWebmanifest);
router.get('/sw.js', miscController.getServiceWorker);
router.get('/offline.html', miscController.getOffline);
router.get('/admin-messages', isAuthenticated, miscController.getAdminMessages);
router.post('/admin/mark-message', isAuthenticated, miscController.postMarkMessage);
router.post('/mark-as-read', isAuthenticated, miscController.postMarkAsRead);
router.post('/admin/delete-message', isAuthenticated, miscController.postDeleteMessage);
router.get('/admin-messages/trash', isAuthenticated, miscController.getAdminMessagesTrash);
router.post('/admin/restore-message', isAuthenticated, miscController.postRestoreMessage);
router.post('/admin/permanently-delete-message', isAuthenticated, miscController.postPermanentlyDeleteMessage);
router.post('/admin/broadcast-social-update', isAuthenticated, isSuperAdmin, miscController.broadcastSocialUpdate);

module.exports = router;
