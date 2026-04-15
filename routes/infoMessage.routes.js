const express = require('express');
const router = express.Router();
const infoMessageController = require('../controllers/infoMessage.controller');
const { auth, isCoordinator } = require('../middleware/auth.middleware');

router.get('/', auth, infoMessageController.getInfoMessages);
router.post('/', auth, isCoordinator, infoMessageController.createInfoMessage);
router.put('/:id', auth, isCoordinator, infoMessageController.updateInfoMessage);
router.delete('/:id', auth, isCoordinator, infoMessageController.deleteInfoMessage);

module.exports = router;
