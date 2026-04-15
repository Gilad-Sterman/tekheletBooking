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
            console.log('🔧 AppConfig collection is empty, seeding all configs...');
            await seedAppConfigData();
        } else {
            console.log('🔧 Checking for missing configurations...');
            await seedMissingConfigs();
        }

        // Check Guides collection (production-safe - only seed if completely empty)
        const guidesCount = await Guide.countDocuments();
        console.log(`👥 Found ${guidesCount} Guide documents`);

        if (guidesCount === 0) {
            console.log('🔧 Guides collection is empty, seeding sample guides...');
            await seedGuidesData();
        } else {
            console.log('✅ Guides collection already has data - skipping guide seeding for production safety');
        }

        console.log('🎉 Automatic seeding check completed successfully!');
    } catch (error) {
        console.error('❌ Error during automatic seeding:', error);
        // Don't exit process - let the server continue even if seeding fails
        console.log('⚠️  Server will continue without seeding');
    }
};

/**
 * Check for and seed any missing configurations
 */
const seedMissingConfigs = async () => {
    const requiredConfigs = getRequiredConfigurations();
    let syncCount = 0;

    for (const config of requiredConfigs) {
        const existing = await AppConfig.findOne({ 
            category: config.category, 
            key: config.key 
        });

        if (!existing) {
            await AppConfig.create({
                ...config,
                isActive: true,
                lastModified: new Date()
            });
            console.log(`  ✓ Added missing config: ${config.category}/${config.key}`);
            syncCount++;
        } else {
            // Check if the value has changed (simple stringify comparison for config objects)
            const newVal = JSON.stringify(config.value);
            const oldVal = JSON.stringify(existing.value);
            
            if (newVal !== oldVal) {
                existing.value = config.value;
                existing.description = config.description || existing.description;
                existing.lastModified = new Date();
                await existing.save();
                console.log(`  🔄 Synced existing config: ${config.category}/${config.key}`);
                syncCount++;
            }
        }
    }

    if (syncCount === 0) {
        console.log('✅ All configurations are up to date');
    } else {
        console.log(`✅ Synced ${syncCount} configuration(s)`);
    }
};

/**
 * Get the list of required configurations
 */
const getRequiredConfigurations = () => {
    return [
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
                regularDuration: 60, // minutes
                workshopDuration: 90, // minutes
                maxParticipantsPerGroup: 50,
                minAdvanceBooking: 24 // hours
            },
            description: 'Default settings for tour creation'
        },

        // Booking Sources Configuration
        {
            category: 'booking_sources',
            key: 'available_options',
            value: [
                { id: 'email', label: 'Email', isActive: true },
                { id: 'walk_in', label: 'Walk in', isActive: true },
                { id: 'we_reached_out', label: 'We reached out', isActive: true },
                { id: 'agent', label: 'Tour guide / Travel Agent', isActive: true }
            ],
            description: 'Available sources for bookings'
        },

        // Payment Status Configuration
        {
            category: 'payment_status',
            key: 'available_options',
            value: [
                { id: 'pending', label: 'Pending', isActive: true },
                { id: 'paid', label: 'Paid', isActive: true },
                { id: 'partial', label: 'Partial', isActive: true },
                { id: 'cancelled', label: 'Cancelled', isActive: true },
                { id: 'refunded', label: 'Refunded', isActive: true }
            ],
            description: 'Available payment status options for post-tour tracking'
        },
        
        // Info Message Types Configuration
        {
            category: 'info_message_types',
            key: 'available_options',
            value: [
                { id: 'info', label: 'General Info', color: '#8b5cf6', isActive: true },
                { id: 'holiday', label: 'Holiday', color: '#f59e0b', isActive: true },
                { id: 'maintenance', label: 'Maintenance', color: '#ef4444', isActive: true },
                { id: 'staff', label: 'Staff Out', color: '#3b82f6', isActive: true }
            ],
            description: 'Available categories for info messages'
        }
    ];
};

/**
 * Seed AppConfig data without connecting to DB (already connected)
 */
const seedAppConfigData = async () => {
    const seedConfigurations = getRequiredConfigurations();

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
