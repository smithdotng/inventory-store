const express = require('express');
const router = express.Router();
const clusterController = require('../controllers/clusterController');

router.get('/clusters', clusterController.getClusterIndex);
router.get('/cluster/:slug', clusterController.getClusterView);

module.exports = router;
