const express = require('express');
const router = express.Router();
const guideController = require('../controllers/guide.controller');
const { auth } = require('../middleware/auth.middleware');

// Get all guides
router.get('/', auth, guideController.getGuides);

// Get guide by ID
router.get('/:id', auth, guideController.getGuideById);

module.exports = router;
