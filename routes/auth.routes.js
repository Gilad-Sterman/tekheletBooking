const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const User = require('../models/user.model');
const { auth } = require('../middleware/auth.middleware');

// Get current user profile
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Login route
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                googleTokens: user.googleTokens
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Redirect to Google for authentication
router.get('/google', (req, res) => {
    const { userId } = req.query;

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/calendar.events'],
        prompt: 'consent',
        state: userId // Pass the userId so we know who to save tokens to in the callback
    });
    res.redirect(url);
});

// Auth callback
router.get('/google/callback', async (req, res) => {
    const { code, state: userId } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);

        if (userId) {
            const user = await User.findById(userId);
            if (user) {
                user.googleTokens = tokens;
                await user.save();

                // Trigger catch-up sync for all existing assigned tours
                const calendarService = require('../services/calendar.service');
                await calendarService.syncAllUserTours(userId);

                return res.send(`<h1>Authentication successful for ${user.name}!</h1><p>Your calendar is being synchronized. You can close this tab.</p>`);
            }
        }

        // Fallback or if no userId was provided (e.g. manual link)
        const coordinator = await User.findOne({ role: 'Coordinator' });
        if (coordinator) {
            coordinator.googleTokens = tokens;
            await coordinator.save();
            res.send('<h1>Authentication successful!</h1><p>Tokens saved to Coordinator account.</p>');
        } else {
            res.status(404).send('User not found to save tokens.');
        }
    } catch (err) {
        console.error('Error during Google Auth:', err);
        res.status(500).send('Authentication failed.');
    }
});

// Disconnect Google Calendar
router.post('/disconnect', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (user) {
            user.googleTokens = undefined;
            await user.save();
            return res.json({ message: 'Calendar disconnected' });
        }
        res.status(404).json({ message: 'User not found' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
