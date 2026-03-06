const Tour = require('../models/tour.model');
const TourType = require('../models/tourType.model');
const User = require('../models/user.model');
const calendarService = require('../services/calendar.service');

// Helper to check for overlapping tours
const hasOverlap = async (tourData, excludeId = null) => {
    const { date, startTime, endTime } = tourData;

    // date is now a string "YYYY-MM-DD"
    const query = {
        date: date,
        $and: [
            { startTime: { $lt: endTime } },
            { endTime: { $gt: startTime } }
        ]
    };

    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    const overlappingTour = await Tour.findOne(query);
    return overlappingTour;
};

// Get all tours
exports.getTours = async (req, res) => {
    try {
        let query = {};

        // Use req.user from auth middleware
        if (req.user && req.user.role !== 'Coordinator') {
            // Guides only see tours they are assigned to
            query = { assignedGuides: req.user._id };
        }

        const tours = await Tour.find(query)
            .populate('tourType')
            .populate('assignedGuides', 'name email role');
        res.json(tours);
    } catch (err) {
        console.error('Error fetching tours:', err);
        res.status(500).json({ message: err.message });
    }
};

// Get all tour types
exports.getTourTypes = async (req, res) => {
    try {
        const types = await TourType.find();
        res.json(types);
    } catch (err) {
        console.error('Error fetching tour types:', err);
        res.status(500).json({ message: err.message });
    }
};

// Create a new tour
exports.createTour = async (req, res) => {
    try {
        // auth.middleware handles isCoordinator for us now, 
        // but extra safety doesn't hurt or we can rely on route protection.
        const { date, startTime, endTime } = req.body;

        if (endTime <= startTime) {
            return res.status(400).json({ message: 'End time must be after start time' });
        }

        const overlap = await hasOverlap(req.body);
        if (overlap) {
            return res.status(400).json({
                message: `Scheduling conflict: overlaps with "${overlap.title}" (${overlap.startTime}-${overlap.endTime})`
            });
        }

        const tour = new Tour(req.body);
        await tour.populate('tourType');
        await calendarService.syncTourToGuides(tour);

        const newTour = await tour.save();
        res.status(201).json(newTour);
    } catch (err) {
        console.error('Error creating tour:', err);
        res.status(400).json({ message: err.message });
    }
};

// Update a tour
exports.updateTour = async (req, res) => {
    try {
        const { startTime, endTime } = req.body;

        if (startTime && endTime && endTime <= startTime) {
            return res.status(400).json({ message: 'End time must be after start time' });
        }

        const overlap = await hasOverlap(req.body, req.params.id);
        if (overlap) {
            return res.status(400).json({
                message: `Scheduling conflict: overlaps with "${overlap.title}" (${overlap.startTime}-${overlap.endTime})`
            });
        }

        const oldTour = await Tour.findById(req.params.id);
        if (!oldTour) return res.status(404).json({ message: 'Tour not found' });

        const oldGuideIds = oldTour.assignedGuides.map(id => id.toString());

        const updatedTour = await Tour.findByIdAndUpdate(
            req.params.id,
            req.body,
            { returnDocument: 'after' }
        ).populate('tourType');

        if (updatedTour) {
            await calendarService.syncTourToGuides(updatedTour, oldGuideIds);
        }

        res.json(updatedTour);
    } catch (err) {
        console.error('Error updating tour:', err);
        res.status(400).json({ message: err.message });
    }
};

// Delete a tour
exports.deleteTour = async (req, res) => {
    try {
        const tour = await Tour.findById(req.params.id);
        if (tour) {
            const oldGuideIds = tour.assignedGuides.map(id => id.toString());
            tour.assignedGuides = [];
            await calendarService.syncTourToGuides(tour, oldGuideIds);
        }

        await Tour.findByIdAndDelete(req.params.id);
        res.json({ message: 'Tour deleted' });
    } catch (err) {
        console.error('Error deleting tour:', err);
        res.status(500).json({ message: err.message });
    }
};
