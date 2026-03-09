const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/user.model');
const Tour = require('./models/tour.model');

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB for seeding...');

        // Clear existing data
        await User.deleteMany({});
        await Tour.deleteMany({});
        console.log('Cleared existing data.');

        // 1. Create Users
        const gilad = await User.create({ name: 'Gilad', email: 'g.sterman.cp@gmail.com', role: 'Coordinator', password: 'coord123' });
        const judy = await User.create({ name: 'Judy', email: 'judy@tekhelet.com', role: 'Coordinator', password: 'coord123' });
        const baruch = await User.create({ name: 'Baruch', email: 'baruch.sterman@gmail.com', role: 'Standard Guide', password: 'guide123' });
        const moshe = await User.create({ name: 'Moshe', email: 'moshe@tekhelet.com', role: 'Standard Guide', password: 'guide123' });

        console.log('Seed: Users created (Gilad, Judy, Baruch, Moshe)');

        // 2. Create Sample Tours
        const today = new Date();
        const d = (daysFromNow) => {
            const date = new Date(today);
            date.setDate(today.getDate() + daysFromNow);
            return date.toLocaleDateString('en-CA');
        };

        await Tour.insertMany([
            // Tour 1: Large English family tour — tomorrow
            {
                title: 'Goldberg Family Reunion',
                date: d(1),
                startTime: '09:30',
                endTime: '11:30',
                color: '#2e7d32',
                language: 'English',
                primaryGuide: baruch._id,
                assignedGuides: [baruch._id],
                isWorkshop: true,
                specialRequests: 'Wheelchair accessible route needed for grandmother.',
                groups: [{
                    name: 'Goldberg Family',
                    type: 'Individual/Family',
                    status: 'Confirmed',
                    counts: { regular: 6, seniorSoldier: 2, child: 3 },
                    contact: {
                        leaderName: 'David Goldberg',
                        leaderEmail: 'dgoldberg@gmail.com',
                        leaderPhone: '+1-212-555-0147'
                    },
                    booking: {
                        source: 'Website',
                        totalCost: 350,
                        paymentLinkSent: true,
                        prepaid: true
                    }
                }]
            },

            // Tour 2: Hebrew school group + walk-in family — tomorrow afternoon
            {
                title: 'Beit Shemesh Day School',
                date: d(1),
                startTime: '13:00',
                endTime: '15:00',
                color: '#1565c0',
                language: 'Hebrew',
                primaryGuide: moshe._id,
                assignedGuides: [moshe._id, baruch._id],
                isWorkshop: true,
                isShiur: true,
                sensitivities: 'Young children in group — keep language age-appropriate.',
                groups: [
                    {
                        name: 'Orot Beit Shemesh 5th Grade',
                        type: 'Day School',
                        status: 'Confirmed',
                        counts: { regular: 2, seniorSoldier: 0, child: 28 },
                        contact: {
                            leaderName: 'Rivka Stern',
                            leaderPhone: '054-888-1234',
                            leaderEmail: 'rstern@orot.edu'
                        },
                        booking: {
                            source: 'Phone',
                            totalCost: 800,
                            paymentLinkSent: true,
                            prepaid: false
                        }
                    },
                    {
                        name: 'Levy Family (walk-in)',
                        type: 'Individual/Family',
                        status: 'Scheduled',
                        counts: { regular: 2, seniorSoldier: 0, child: 2 },
                        contact: {
                            leaderName: 'Yossi Levy',
                            leaderPhone: '050-777-9999'
                        },
                        booking: {
                            source: 'Walk In',
                            totalCost: 100
                        }
                    }
                ]
            },

            // Tour 3: French tourist group — 3 days from now
            {
                title: 'Lyon Congregation Visit',
                date: d(3),
                startTime: '10:00',
                endTime: '12:30',
                color: '#6a1b9a',
                language: 'French',
                primaryGuide: baruch._id,
                assignedGuides: [baruch._id],
                specialRequests: 'French-speaking guide preferred. Group arrives by bus from Jerusalem.',
                groups: [{
                    name: 'Congregation Beth Lyon',
                    type: 'Congregation/Shul',
                    status: 'Scheduled',
                    counts: { regular: 15, seniorSoldier: 5, child: 0 },
                    contact: {
                        leaderName: 'Rabbi Pierre Dubois',
                        leaderEmail: 'rabbi.dubois@bethlyon.fr',
                        leaderPhone: '+33-4-7200-5555'
                    },
                    booking: {
                        source: 'Email Inquiry',
                        totalCost: 1200,
                        paymentLinkSent: false,
                        prepaid: false
                    }
                }]
            },

            // Tour 4: Multi-group English tour — 5 days from now
            {
                title: 'NCSY Summer Trip',
                date: d(5),
                startTime: '09:00',
                endTime: '12:00',
                color: '#e65100',
                language: 'English',
                primaryGuide: moshe._id,
                assignedGuides: [moshe._id, baruch._id],
                isWorkshop: true,
                sensitivities: 'Large group — coordinate bus parking with office.',
                groups: [
                    {
                        name: 'NCSY East Coast Boys',
                        type: 'Organization',
                        status: 'Confirmed',
                        counts: { regular: 25, seniorSoldier: 0, child: 0 },
                        contact: {
                            leaderName: 'Rabbi Josh Katz',
                            leaderEmail: 'jkatz@ncsy.org',
                            leaderPhone: '+1-646-555-0200'
                        },
                        booking: {
                            source: 'Phone',
                            totalCost: 1500,
                            paymentLinkSent: true,
                            prepaid: true
                        }
                    },
                    {
                        name: 'NCSY East Coast Girls',
                        type: 'Organization',
                        status: 'Confirmed',
                        counts: { regular: 22, seniorSoldier: 0, child: 0 },
                        contact: {
                            leaderName: 'Shira Weiss',
                            leaderEmail: 'sweiss@ncsy.org',
                            leaderPhone: '+1-646-555-0201'
                        },
                        booking: {
                            source: 'Phone',
                            totalCost: 1350,
                            paymentLinkSent: true,
                            prepaid: true
                        }
                    },
                    {
                        name: 'Shapiro Family (Add-on)',
                        type: 'Individual/Family',
                        status: 'Scheduled',
                        counts: { regular: 2, seniorSoldier: 0, child: 3 },
                        contact: {
                            leaderName: 'Michael Shapiro',
                            leaderPhone: '+1-917-555-0312'
                        },
                        booking: {
                            source: 'Website',
                            totalCost: 180
                        }
                    }
                ]
            },

            // Tour 5: Small Spanish tour — next week
            {
                title: 'Buenos Aires Heritage Tour',
                date: d(7),
                startTime: '14:00',
                endTime: '15:30',
                color: '#00838f',
                language: 'Spanish',
                primaryGuide: baruch._id,
                assignedGuides: [baruch._id],
                isShiur: true,
                specialRequests: 'Group interested in purchasing tzitzit sets from the store.',
                groups: [{
                    name: 'Comunidad Bet-El Buenos Aires',
                    type: 'Tourist Group',
                    status: 'Confirmed',
                    counts: { regular: 8, seniorSoldier: 3, child: 0 },
                    contact: {
                        leaderName: 'Carlos Gutierrez',
                        leaderEmail: 'cgutierrez@betel.org.ar',
                        leaderPhone: '+54-11-4555-7890'
                    },
                    booking: {
                        source: 'Email Inquiry',
                        totalCost: 450,
                        paymentLinkSent: true,
                        prepaid: false
                    }
                }]
            }
        ]);

        console.log('Seed: 5 Sample Tours created');
        console.log('Seeding completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    }
};

seedData();
