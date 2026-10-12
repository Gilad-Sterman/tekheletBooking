const Tour = require('../models/tour.model');
const User = require('../models/user.model');
const calendarService = require('../services/calendar.service');
const automationService = require('../services/automation.service');

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
            .populate('primaryGuide', 'name email role')
            .populate('assignedGuides', 'name email role');
        res.json(tours);
    } catch (err) {
        console.error('Error fetching tours:', err);
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
        if (overlap && !req.body.forceCreate) {
            return res.status(409).json({
                conflict: true,
                message: `This tour overlaps with "${overlap.title}" (${overlap.startTime}-${overlap.endTime}). This may be intentional for groups in different stages.`,
                conflictingTour: {
                    title: overlap.title,
                    startTime: overlap.startTime,
                    endTime: overlap.endTime,
                    date: overlap.date
                }
            });
        }

        const data = { ...req.body };
        if (data.primaryGuide === '') data.primaryGuide = null;
        if (data.assignedGuides) {
            data.assignedGuides = data.assignedGuides.filter(id => id !== '');
        }

        const tour = new Tour(data);
        await tour.populate('primaryGuide');
        await calendarService.syncTourToGuides(tour);

        const newTour = await tour.save();
        // Fire-and-forget: automation runs async, never blocks the response
        automationService.onTourCreated(newTour).catch(e =>
            console.error('[automation] onTourCreated error:', e.message)
        );
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
        if (overlap && !req.body.forceUpdate) {
            return res.status(409).json({
                conflict: true,
                message: `This tour overlaps with "${overlap.title}" (${overlap.startTime}-${overlap.endTime}). This may be intentional for groups in different stages.`,
                conflictingTour: {
                    title: overlap.title,
                    startTime: overlap.startTime,
                    endTime: overlap.endTime,
                    date: overlap.date
                }
            });
        }

        const oldTour = await Tour.findById(req.params.id);
        if (!oldTour) return res.status(404).json({ message: 'Tour not found' });

        const oldGuideIds = oldTour.assignedGuides.map(id => id.toString());

        const data = { ...req.body };
        if (data.primaryGuide === '') data.primaryGuide = null;
        if (data.assignedGuides) {
            data.assignedGuides = data.assignedGuides.filter(id => id !== '');
        }

        // mailFolderId is automation-owned — re-inject the stored values so a
        // client holding a stale copy can't wipe folder links on save.
        data.mailFolderId = oldTour.mailFolderId || '';
        if (Array.isArray(data.groups)) {
            const oldFolderById = new Map(
                oldTour.groups.map(g => [g._id.toString(), g.mailFolderId || ''])
            );
            data.groups = data.groups.map(g => ({
                ...g,
                mailFolderId: (g._id && oldFolderById.get(g._id.toString())) || ''
            }));
        }

        const updatedTour = await Tour.findByIdAndUpdate(
            req.params.id,
            data,
            { returnDocument: 'after' }
        ).populate('primaryGuide');

        if (updatedTour) {
            await calendarService.syncTourToGuides(updatedTour, oldGuideIds);
            // Fire-and-forget: automation runs async, never blocks the response
            automationService.onTourUpdated(oldTour, updatedTour).catch(e =>
                console.error('[automation] onTourUpdated error:', e.message)
            );
        }

        res.json(updatedTour);
    } catch (err) {
        console.error('Error updating tour:', err);
        res.status(400).json({ message: err.message });
    }
};

// Move a group to another tour (or a new tour) — add-then-remove.
// The group is appended to the destination BEFORE removal from the source,
// so a mid-flight failure can only duplicate it, never lose it.
// The group is read from the DB — client payloads are never trusted.
exports.moveGroup = async (req, res) => {
    try {
        const { id: sourceId, groupId } = req.params;
        const { destinationId, date, startTime, endTime } = req.body;

        if (destinationId !== 'new' && String(destinationId) === String(sourceId)) {
            return res.status(400).json({ message: 'Cannot move a group to the same tour' });
        }

        const source = await Tour.findById(sourceId);
        if (!source) return res.status(404).json({ message: 'Source tour not found' });
        const group = source.groups.id(groupId);
        if (!group) return res.status(404).json({ message: 'Group not found in source tour' });

        const groupData = group.toObject();
        groupData.mailFolderId = ''; // fresh folder under the destination tour
        const sourceGuideIds = source.assignedGuides.map(g => g.toString());

        // 1) Add to destination (or create it) — nothing is lost if this fails
        let destination, destBefore = null, destCreated = false;
        if (destinationId === 'new') {
            destination = await Tour.create({
                title: group.name || source.title,
                date: date || source.date,
                startTime: startTime || source.startTime,
                endTime: endTime || source.endTime,
                language: source.language,
                color: source.color,
                primaryGuide: source.primaryGuide || null,
                customGuideName: source.customGuideName || '',
                isWorkshop: source.isWorkshop,
                isShiur: source.isShiur,
                groups: [groupData]
            });
            destCreated = true;
        } else {
            destination = await Tour.findById(destinationId);
            if (!destination) return res.status(404).json({ message: 'Destination tour not found' });
            destBefore = destination.toObject();
            // Idempotent: if the group is already there (retry after a partial move), don't push it twice
            if (!destination.groups.id(groupId)) {
                destination.groups.push(groupData);
                await destination.save();
            }
        }

        // 2) Remove from source — worst case now is a duplicate, never a loss
        let duplicated = false, sourceDeleted = false, updatedSource = null;
        try {
            updatedSource = await Tour.findByIdAndUpdate(
                sourceId,
                { $pull: { groups: { _id: group._id } } },
                { returnDocument: 'after' }
            );
            if (updatedSource.groups.length === 0) {
                // Sync removals BEFORE deleting — same as deleteTour, so guide GCal events get cleaned up
                try {
                    source.assignedGuides = [];
                    await calendarService.syncTourToGuides(source, sourceGuideIds);
                } catch (syncErr) {
                    console.error('[move-group] source-delete calendar sync failed:', syncErr.message);
                }
                await Tour.findByIdAndDelete(sourceId);
                sourceDeleted = true;
            }
        } catch (removeErr) {
            console.error(`[move-group] Added to destination but could not remove from source ${sourceId}:`, removeErr.message);
            duplicated = true;
        }

        // 3) Calendar sync + automation hooks — same semantics as the old flow
        try {
            await calendarService.syncTourToGuides(destination);
            if (destCreated) {
                automationService.onTourCreated(destination).catch(e =>
                    console.error('[automation] onTourCreated error:', e.message)
                );
            } else {
                automationService.onTourUpdated(destBefore, destination).catch(e =>
                    console.error('[automation] onTourUpdated error:', e.message)
                );
            }
            if (!sourceDeleted && updatedSource) {
                await calendarService.syncTourToGuides(updatedSource, sourceGuideIds);
                automationService.onTourUpdated(source, updatedSource).catch(e =>
                    console.error('[automation] onTourUpdated error:', e.message)
                );
            }
        } catch (postErr) {
            console.error('[move-group] post-move sync/automation error:', postErr.message);
        }

        res.json({ moved: true, duplicated, sourceDeleted, destinationId: destination._id });
    } catch (err) {
        console.error('Error moving group:', err);
        res.status(500).json({ message: err.message });
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
