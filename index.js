const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

const path = require('path');

const logger = require('./middleware/logger.middleware');

// Middleware
app.use(logger);
app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tourBooking')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.get('/api/status', (req, res) => {
    res.json({ message: 'Tour Management API is running...' });
});

// Import routes
const tourRoutes = require('./routes/tour.routes');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');

// Use routes
app.use('/api/tours', tourRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Catch-all to serve React app for SPA routing
app.get(/^(?!\/api).+/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
