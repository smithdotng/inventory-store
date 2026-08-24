const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const customerController = require('../controllers/customerController');

router.get('/customers', isAuthenticated, customerController.getCustomers);
router.get('/customer-details/:customerId', isAuthenticated, customerController.getCustomerDetails);
router.get('/edit-customer/:customerId', isAuthenticated, customerController.getEditCustomer);
router.post('/update-customer/:customerId', isAuthenticated, customerController.postUpdateCustomer);
router.post('/add-customer', isAuthenticated, customerController.postAddCustomer);
router.post('/delete-customer/:customerId', isAuthenticated, customerController.postDeleteCustomer);

module.exports = router;
