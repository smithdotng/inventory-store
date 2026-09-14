const express = require('express');
const router = express.Router();
const { uploadProductImages } = require('../config/multer');
const { isAuthenticated, requireRole } = require('../middleware/auth');
const inventoryController = require('../controllers/inventoryController');

// /inventory replaces the old /update-stock
router.get('/inventory', isAuthenticated, requireRole('stock_clerk', 'admin', 'superadmin'), inventoryController.getInventory);
router.post('/inventory', isAuthenticated, inventoryController.postInventory);
router.post('/add-product', isAuthenticated, uploadProductImages, inventoryController.addProduct);
router.post('/delete-stock', isAuthenticated, inventoryController.deleteStock);
router.post('/delete-product', isAuthenticated, inventoryController.deleteStock);
router.get('/store-view', isAuthenticated, inventoryController.getStoreView);
router.post('/update-description', isAuthenticated, inventoryController.updateDescription);

module.exports = router;
