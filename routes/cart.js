const express = require('express');
const router = express.Router();
const cart = require('../controllers/cartController');
const { requireShopper } = require('../controllers/shopperController');

router.get('/cart', requireShopper, cart.getCart);
router.get('/cart/count', cart.getCount);
router.post('/cart/add', requireShopper, cart.postAdd);
router.post('/cart/update', requireShopper, cart.postUpdate);
router.post('/cart/remove', requireShopper, cart.postRemove);
router.post('/cart/checkout', requireShopper, cart.postCheckout);
router.get('/cart/checkout/callback', requireShopper, cart.getCheckoutCallback);

module.exports = router;
