const express = require('express');
const router = express.Router();
const configController = require('../controllers/config.controller');
const { auth, isCoordinator } = require('../middleware/auth.middleware');

// Get all configurations
router.get('/', auth, configController.getAllConfigurations);

// Update a single config value (editable categories only — coordinator)
router.put('/:category/:key', auth, isCoordinator, configController.updateConfigValue);

module.exports = router;
