const mongoose = require('mongoose');
const AppConfig = require('../models/appConfig.model');
const Guide = require('../models/guide.model');
const User = require('../models/user.model');

/**
 * Automatic seeding system for production deployment
 * Checks if collections exist and seeds them if they're empty or missing
 */
const autoSeed = async () => {
    try {
        console.log('🌱 Starting automatic seeding check...');

        // Check AppConfig collection
        const configCount = await AppConfig.countDocuments();
        console.log(`📊 Found ${configCount} AppConfig documents`);

        if (configCount === 0) {
            console.log('🔧 AppConfig collection is empty, seeding...');
            await seedAppConfigData();
        } else {
            console.log('✅ AppConfig collection already seeded');
        }

        // Check Guides collection
        const guidesCount = await Guide.countDocuments();
        console.log(`👥 Found ${guidesCount} Guide documents`);

        if (guidesCount === 0) {
            console.log('🔧 Guides collection is empty, seeding...');
            await seedGuidesData();
        } else {
            console.log('✅ Guides collection already seeded');
        }

        console.log('🎉 Automatic seeding check completed successfully!');
    } catch (error) {
        console.error('❌ Error during automatic seeding:', error);
        // Don't exit process - let the server continue even if seeding fails
        console.log('⚠️  Server will continue without seeding');
    }
};

/**
 * Seed AppConfig data without connecting to DB (already connected)
 */
const seedAppConfigData = async () => {
    const seedConfigurations = [
        // Group Types Configuration
        {
            category: 'group_types',
            key: 'available_options',
            value: [
                { id: 'individual', label: 'Individual/Family', isActive: true },
                { id: 'bar_mitzvah', label: 'Bar/Bat Mitzvah', isActive: true },
                { id: 'day_school', label: 'Day School', isActive: true },
                { id: 'yeshiva', label: 'Yeshiva/Seminary/Kollel', isActive: true },
                { id: 'congregation', label: 'Congregation/Shul', isActive: true },
                { id: 'organization', label: 'Organization', isActive: true },
                { id: 'tourist', label: 'Tourist Group', isActive: true },
                { id: 'other', label: 'Other', isActive: true }
            ],
            description: 'Available group types for tour bookings'
        },

        // Group Status Configuration
        {
            category: 'group_status',
            key: 'available_options',
            value: [
                { id: 'scheduled', label: 'Scheduled', isActive: true },
                { id: 'confirmed', label: 'Confirmed', isActive: true },
                { id: 'cancelled', label: 'Cancelled', isActive: true },
                { id: 'no_show', label: 'No Show', isActive: true }
            ],
            description: 'Available status options for groups'
        },

        // Base Pricing Configuration
        {
            category: 'pricing',
            key: 'base_prices',
            value: {
                regular: 40,
                seniorSoldier: 30,
                child: 0,
                workshop: 200,
                currency: '₪'
            },
            description: 'Base pricing for different participant types'
        },

        // Discount Rules Configuration
        {
            category: 'pricing',
            key: 'discount_rules',
            value: {
                groupDiscount: {
                    threshold: 20,
                    percentage: 0.10,
                    description: '10% discount for groups of 20+ people'
                },
                workshopCalculation: {
                    formula: 'Math.floor(totalParticipants / 5 + 1) * workshopPrice',
                    description: 'Workshop sessions based on group size (1 session per 5 people)'
                }
            },
            description: 'Discount rules and calculation formulas'
        },

        // Languages Configuration
        {
            category: 'languages',
            key: 'available_options',
            value: [
                { id: 'english', label: 'English', isActive: true },
                { id: 'hebrew', label: 'Hebrew', isActive: true },
            ],
            description: 'Available languages for tours'
        },

        // Tour Settings Configuration
        {
            category: 'tour_settings',
            key: 'default_values',
            value: {
                defaultColor: '#134869',
                defaultDuration: 90, // minutes
                maxParticipantsPerGroup: 50,
                minAdvanceBooking: 24 // hours
            },
            description: 'Default settings for tour creation'
        }
    ];

    for (const config of seedConfigurations) {
        await AppConfig.create({
            ...config,
            isActive: true,
            lastModified: new Date()
        });
        console.log(`  ✓ Seeded ${config.category}/${config.key}`);
    }
};

/**
 * Seed Guides data without connecting to DB (already connected)
 */
const seedGuidesData = async () => {
    // Try to get guides from existing users
    const guideUsers = await User.find({ role: 'Guide' });
    console.log(`  📋 Found ${guideUsers.length} guide users to migrate`);

    if (guideUsers.length > 0) {
        const guidePromises = guideUsers.map(user => {
            return Guide.create({
                name: user.name || user.email.split('@')[0],
                email: user.email,
                phone: user.phone || '',
                languages: ['English'],
                specialties: [],
                isActive: true,
                userId: user._id,
                notes: `Auto-migrated from User collection on ${new Date().toISOString()}`
            });
        });

        await Promise.all(guidePromises);
        console.log(`  ✓ Migrated ${guideUsers.length} guide users`);
    } else {
        // Create sample guides if no users exist
        console.log('  📝 No guide users found, creating sample guides...');
        const sampleGuides = [
            {
                name: 'Moshe Stavsky',
                email: 'moshe@example.com',
                phone: '+972-50-123-4567',
                languages: ['English', 'Hebrew'],
                specialties: ['History', 'Art'],
                isActive: true
            },
            {
                name: 'David',
                email: 'david@example.com',
                phone: '+972-50-234-5678',
                languages: ['English', 'Hebrew'],
                specialties: ['Architecture', 'Culture'],
                isActive: true
            },
            {
                name: 'Baruch Sterman',
                email: 'baruch.sterman@gmail.com',
                phone: '+972-54-260-1282',
                languages: ['English', 'Hebrew'],
                specialties: ['Religious Sites', 'History'],
                isActive: true
            }
        ];

        for (const guide of sampleGuides) {
            await Guide.create(guide);
            console.log(`  ✓ Created sample guide: ${guide.name}`);
        }
    }
};

module.exports = autoSeed;
