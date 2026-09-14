const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');

router.get('/search', storeController.getSearch);
router.get('/store/:adminUsername', storeController.getStore);
router.get('/store/:adminUsername/product/:productId', storeController.getStoreProduct);
router.post('/store/:adminUsername/checkout', storeController.postCheckout);
router.get('/store/:adminUsername/confirmation/:saleId', storeController.getStoreConfirmation);

module.exports = router;
