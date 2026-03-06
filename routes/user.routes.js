const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { auth } = require('../middleware/auth.middleware');

router.get('/', auth, userController.getUsers);

module.exports = router;
