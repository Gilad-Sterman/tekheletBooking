const express = require('express');
const router = express.Router();
const configController = require('../controllers/config.controller');
const { auth } = require('../middleware/auth.middleware');

// Get all configurations
router.get('/', auth, configController.getAllConfigurations);

module.exports = router;
