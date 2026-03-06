const { google } = require('googleapis');
const User = require('../models/user.model');
const Tour = require('../models/tour.model');

const getOAuthClient = (tokens) => {
    const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    client.setCredentials(tokens);
    return client;
};

const calendarService = {
    async getCalendar(userId = null) {
        // Find the coordinator tokens
        const user = userId
            ? await User.findById(userId)
            : await User.findOne({ role: 'Coordinator' });

        if (!user || !user.googleTokens || (!user.googleTokens.access_token && !user.googleTokens.refresh_token)) {
            console.warn(`Google tokens not found or incomplete for user ${userId || 'Coordinator'}. Skipping sync.`);
            return null;
        }

        const auth = getOAuthClient(user.googleTokens);
        return google.calendar({ version: 'v3', auth });
    },

    async createEvent(tour, userId) {
        const calendar = await this.getCalendar(userId);
        if (!calendar) return null;

        const event = {
            summary: tour.title,
            description: `Tour: ${tour.tourType?.name || 'Standard'}\n` +
                `Group Size: ${tour.participants?.groupSize || 1}\n` +
                `Contact: ${tour.participants?.name || 'N/A'} (${tour.participants?.email || 'No email'})\n` +
                `Notes: ${tour.participants?.notes || 'None'}`,
            start: {
                dateTime: `${tour.date}T${tour.startTime}:00`,
                timeZone: 'UTC'
            },
            end: {
                dateTime: `${tour.date}T${tour.endTime}:00`,
                timeZone: 'UTC'
            }
        };

        try {
            const res = await calendar.events.insert({
                calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
                resource: event,
            });
            return res.data.id;
        } catch (err) {
            console.error(`Error creating GCal event for user ${userId}:`, err);
            return null;
        }
    },

    async updateEvent(tour, userId, eventId) {
        const calendar = await this.getCalendar(userId);
        if (!calendar) return;

        const event = {
            summary: tour.title,
            description: `Tour: ${tour.tourType?.name || 'Standard'}\n` +
                `Group Size: ${tour.participants?.groupSize || 1}\n` +
                `Contact: ${tour.participants?.name || 'N/A'} (${tour.participants?.email || 'No email'})\n` +
                `Notes: ${tour.participants?.notes || 'None'}`,
            start: {
                dateTime: `${tour.date}T${tour.startTime}:00`,
                timeZone: 'UTC'
            },
            end: {
                dateTime: `${tour.date}T${tour.endTime}:00`,
                timeZone: 'UTC'
            }
        };

        try {
            await calendar.events.update({
                calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
                eventId: eventId,
                resource: event,
            });
        } catch (err) {
            console.error(`Error updating GCal event ${eventId} for user ${userId}:`, err);
        }
    },

    async deleteEvent(userId, eventId) {
        if (!eventId || !userId) return;

        const calendar = await this.getCalendar(userId);
        if (!calendar) return;

        try {
            await calendar.events.delete({
                calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
                eventId: eventId,
            });
        } catch (err) {
            console.error(`Error deleting GCal event ${eventId} for user ${userId}:`, err);
        }
    },

    async syncTourToGuides(tour, oldGuideIds = []) {
        const currentGuideIds = tour.assignedGuides.map(id => id.toString());
        const removedGuideIds = oldGuideIds.filter(id => !currentGuideIds.includes(id));
        const addedGuideIds = currentGuideIds.filter(id => !oldGuideIds.includes(id));
        const existingGuideIds = currentGuideIds.filter(id => oldGuideIds.includes(id));

        // 1. Handle Removals
        for (const userId of removedGuideIds) {
            const eventId = tour.googleEvents?.get(userId);
            if (eventId) {
                await this.deleteEvent(userId, eventId);
                tour.googleEvents.delete(userId);
            }
        }

        // 2. Handle Additions
        for (const userId of addedGuideIds) {
            const eventId = await this.createEvent(tour, userId);
            if (eventId) {
                if (!tour.googleEvents) tour.googleEvents = new Map();
                tour.googleEvents.set(userId, eventId);
            }
        }

        // 3. Handle Updates for existing
        for (const userId of existingGuideIds) {
            const eventId = tour.googleEvents?.get(userId);
            if (eventId) {
                await this.updateEvent(tour, userId, eventId);
            } else {
                // If ID is missing for some reason, try to create it
                const newId = await this.createEvent(tour, userId);
                if (newId) tour.googleEvents.set(userId, newId);
            }
        }

        await tour.save();
    },

    async syncAllUserTours(userId) {
        try {
            const mongoose = require('mongoose');
            const tours = await Tour.find({
                assignedGuides: new mongoose.Types.ObjectId(userId)
            }).populate('tourType');

            console.log(`[Catch-up Sync] Found ${tours.length} tours for user ${userId}. Checking status...`);

            for (const tour of tours) {
                // Ensure googleEvents exists and is a Map
                if (!tour.googleEvents || !(tour.googleEvents instanceof Map)) {
                    tour.googleEvents = new Map();
                }

                const eventId = tour.googleEvents.get(userId);

                if (!eventId) {
                    console.log(`[Catch-up Sync] No event ID for tour ${tour._id}. Creating...`);
                    const newId = await this.createEvent(tour, userId);
                    if (newId) {
                        tour.googleEvents.set(userId, newId);
                        await tour.save();
                        console.log(`[Catch-up Sync] Successfully synced tour ${tour._id} (Event: ${newId})`);
                    }
                } else {
                    console.log(`[Catch-up Sync] Tour ${tour._id} already synced (Event: ${eventId})`);
                }
            }
        } catch (err) {
            console.error(`[Catch-up Sync Error] for user ${userId}:`, err);
        }
    }
};

module.exports = calendarService;
