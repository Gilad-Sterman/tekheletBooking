const express = require('express');
const router = express.Router();
const tourController = require('../controllers/tour.controller');
const { auth, isCoordinator } = require('../middleware/auth.middleware');

router.get('/', auth, tourController.getTours);
router.post('/', auth, isCoordinator, tourController.createTour);
router.put('/:id', auth, tourController.updateTour);
router.delete('/:id', auth, isCoordinator, tourController.deleteTour);

router.get('/types', auth, tourController.getTourTypes);

module.exports = router;
