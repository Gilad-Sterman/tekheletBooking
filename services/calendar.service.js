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

    async buildEventResource(tour) {
        const summary = `PT Tour - ${tour.title}`;

        // Build groups summary
        let groupsText = '';
        if (tour.groups && tour.groups.length > 0) {
            groupsText = '\n--- GROUPS ---\n' + tour.groups.map(g => {
                const counts = g.counts || {};
                const groupSize = (counts.regular || 0) + (counts.seniorSoldier || 0) + (counts.child || 0);
                return `- ${g.name} (${g.type}): ${groupSize} ppl\n  Status: ${g.status}\n  Leader: ${g.contact?.leaderName || 'N/A'} (${g.contact?.leaderPhone || 'No phone'})`;
            }).join('\n\n');
        }

        const appUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        const tourLink = `${appUrl}/?tourId=${tour._id}`;

        const description = `Language: ${tour.language || 'English'}\n` +
            `Total Participants: ${tour.totalParticipants || 0}\n` +
            `Workshop: ${tour.isWorkshop ? 'Yes' : 'No'}\n` +
            `Shiur: ${tour.isShiur ? 'Yes' : 'No'}\n` +
            (tour.specialRequests ? `Special Requests: ${tour.specialRequests}\n` : '') +
            (tour.sensitivities ? `Sensitivities: ${tour.sensitivities}\n` : '') +
            groupsText +
            `\n\n🔗 View Full Details: ${tourLink}`;

        return {
            summary,
            description,
            start: {
                dateTime: `${tour.date}T${tour.startTime}:00`,
                timeZone: 'UTC'
            },
            end: {
                dateTime: `${tour.date}T${tour.endTime}:00`,
                timeZone: 'UTC'
            }
        };
    },

    async createEvent(tour, userId) {
        const calendar = await this.getCalendar(userId);
        if (!calendar) return null;

        const event = await this.buildEventResource(tour);

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

        const event = await this.buildEventResource(tour);

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
            });

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
