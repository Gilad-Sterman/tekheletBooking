const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { auth } = require('../middleware/auth.middleware');

// Get dashboard statistics
router.get('/statistics', auth, dashboardController.getDashboardStatistics);

module.exports = router;
