const express = require('express');
const router = express.Router();
const { uploadInvoiceFile } = require('../config/multer');
const { isAuthenticated } = require('../middleware/auth');
const invoiceController = require('../controllers/invoiceController');

router.get('/invoices', isAuthenticated, invoiceController.getInvoices);
router.post('/invoices/create', isAuthenticated, invoiceController.postCreateInvoice);
router.get('/invoices/upload', isAuthenticated, invoiceController.getInvoiceUpload);
router.post('/invoices/upload', isAuthenticated, uploadInvoiceFile, invoiceController.postInvoiceUpload);
router.post('/invoices/share', isAuthenticated, uploadInvoiceFile, invoiceController.postInvoiceShare);
router.get('/invoices/download/:saleId', isAuthenticated, invoiceController.getInvoiceDownload);
router.get('/invoices/preview/:saleId',  isAuthenticated, invoiceController.getInvoicePreview);
router.post('/invoices/update/:saleId',  isAuthenticated, invoiceController.postUpdateInvoice);
router.post('/invoices/mark-paid/:saleId', isAuthenticated, invoiceController.postMarkPaid);
router.get('/public-invoice/:saleId', invoiceController.getPublicInvoice);

module.exports = router;
