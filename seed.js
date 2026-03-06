const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/user.model');
const TourType = require('./models/tourType.model');
const Tour = require('./models/tour.model');

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB for seeding...');

        // Clear existing data
        await User.deleteMany({});
        await TourType.deleteMany({});
        await Tour.deleteMany({});
        console.log('Cleared existing data.');

        // 1. Create Users
        const users = [];
        users.push(await User.create({ name: 'Alice Coordinator', email: 'coordinator@example.com', role: 'Coordinator', password: 'coord123' }));
        users.push(await User.create({ name: 'Bob Lead', email: 'lead@example.com', role: 'Lead Guide', password: 'guide123' }));
        users.push(await User.create({ name: 'Charlie Guide', email: 'guide@example.com', role: 'Standard Guide', password: 'guide123' }));

        console.log('Seed: Users created');

        // 2. Create Tour Types
        const tourTypes = await TourType.insertMany([
            { name: 'Family Tour', basePrice: 150, defaultDuration: 90, color: '#4caf50' },
            { name: 'VIP Private Tour', basePrice: 500, defaultDuration: 120, color: '#f44336' },
            { name: 'Educational Group', basePrice: 300, defaultDuration: 180, color: '#2196f3' },
        ]);
        console.log('Seed: Tour Types created');

        // 3. Create Sample Tours
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        await Tour.insertMany([
            {
                title: 'Smith Family Visit',
                date: tomorrow,
                startTime: '10:00',
                endTime: '11:30',
                tourType: tourTypes[0]._id,
                participants: { name: 'John Smith', email: 'john@example.com', groupSize: 5 },
                assignedGuides: [users[1]._id],
                status: 'Scheduled',
                price: 150
            },
            {
                title: 'Tech Corp VIP Outing',
                date: tomorrow,
                startTime: '14:00',
                endTime: '16:00',
                tourType: tourTypes[1]._id,
                participants: { name: 'Sarah Tech', email: 'sarah@tech.com', groupSize: 3 },
                assignedGuides: [users[0]._id, users[1]._id],
                status: 'Confirmed',
                price: 500
            }
        ]);
        console.log('Seed: Sample Tours created');

        console.log('Seeding completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    }
};

seedData();
