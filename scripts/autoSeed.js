const mongoose = require('mongoose');
const AppConfig = require('../models/appConfig.model');
const Guide = require('../models/guide.model');
const User = require('../models/user.model');
const EmailTemplate = require('../models/emailTemplate.model');

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

        // Patch group_status to include Awaiting Confirmation if missing
        await patchGroupStatusConfig();

        // Seed email templates
        await seedMissingEmailTemplates();

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
        }
        // Existing configs are intentionally never overwritten —
        // values may have been customized in the DB (e.g. colors, labels)
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
        },

        // Email Automation Timing Configuration (editable via the Settings page)
        {
            category: 'email_automation',
            key: 'reminder_days_before',
            value: 2,
            description: 'Days before the tour to send the reminder email'
        },
        {
            category: 'email_automation',
            key: 'post_tour_days_after',
            value: 0,
            description: 'Days after the tour ends to send the thank-you email (0 = same day, once end time has passed)'
        },
        {
            category: 'email_automation',
            key: 'google_review_link',
            value: '',
            description: 'Google review URL included in the post-visit email (leave empty to omit the review request)'
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

/**
 * Additive patch: insert 'Awaiting Confirmation' into the group_status AppConfig
 * array if it isn't already present. Safe to run on every startup.
 */
const patchGroupStatusConfig = async () => {
    const config = await AppConfig.findOne({ category: 'group_status', key: 'available_options' });
    if (!config || !Array.isArray(config.value)) return;

    const already = config.value.some(o => o.id === 'awaiting_confirmation');
    if (already) return;

    // Insert after 'scheduled'
    const idx = config.value.findIndex(o => o.id === 'scheduled');
    const insertAt = idx >= 0 ? idx + 1 : 1;
    config.value.splice(insertAt, 0, { id: 'awaiting_confirmation', label: 'Awaiting Confirmation', isActive: true });
    config.markModified('value');
    await config.save();
    console.log('  ✓ Added "Awaiting Confirmation" to group_status config');
};

/**
 * Seed any email templates that don't yet exist (key + language is the unique key).
 */
const seedMissingEmailTemplates = async () => {
    const templates = getEmailTemplates();
    let added = 0;
    for (const t of templates) {
        const exists = await EmailTemplate.findOne({ key: t.key, language: t.language });
        if (!exists) {
            await EmailTemplate.create(t);
            console.log(`  ✓ Seeded email template: ${t.key} (${t.language})`);
            added++;
        }
    }
    if (added === 0) console.log('✅ Email templates are up to date');
};

const getEmailTemplates = () => {
    const en = (key, subject, body) => ({ key, language: 'en', mode: 'draft', subject, body });
    const he = (key, subject, body) => ({ key, language: 'he', mode: 'draft', subject, body });

    return [
        en('awaiting_confirmation',
            'Tekhelet Visiting Center Tour – Booking Received',
            `Thank you for booking a tour at the Tekhelet Visiting Center!

We have your booking on file with the following details:

  Group:        {{groupName}}
  Date:         {{tourDateFull}}
  Time:         {{startTime}} – {{endTime}}
  Participants: {{participantSummary}}{{programLine}}{{costLine}}

Please reply to confirm these details are correct. Once confirmed we will be in touch with next steps.

We look forward to welcoming you!

The Tekhelet Team`
        ),

        he('awaiting_confirmation',
            'סיור מרכז מבקרים פתיל תכלת – קיבלנו את ההזמנה',
            `תודה שהזמנת סיור במרכז מבקרים פתיל תכלת!

קיבלנו את פרטי ההזמנה שלך:

  קבוצה:    {{groupName}}
  תאריך:    {{tourDateFull}}
  שעה:      {{startTime}} – {{endTime}}
  משתתפים:  {{participantSummary}}{{programLine}}{{costLine}}

אנא השב/י לאימייל זה לאישור שהפרטים נכונים.

מצפים לראותך!

צוות פתיל תכלת`
        ),

        en('confirmed',
            'Tekhelet Visiting Center Tour – Booking Confirmed',
            `Great news – your tour at the Tekhelet Visiting Center is confirmed!

  Group:        {{groupName}}
  Date:         {{tourDateFull}}
  Time:         {{startTime}} – {{endTime}}
  Participants: {{participantSummary}}{{programLine}}
  Total:        ₪{{totalCost}}

We look forward to seeing you on {{tourDateFull}}.

The Tekhelet Team`
        ),

        he('confirmed',
            'סיור מרכז מבקרים פתיל תכלת – ההזמנה אושרה!',
            `בשורות טובות – הסיור שלך במרכז מבקרים פתיל תכלת אושר!

  קבוצה:         {{groupName}}
  תאריך:         {{tourDateFull}}
  שעה:           {{startTime}} – {{endTime}}
  משתתפים:       {{participantSummary}}{{programLine}}
  סה"כ לתשלום:  ₪{{totalCost}}

מצפים לקבל את פניך ב{{tourDateFull}}.

צוות פתיל תכלת`
        ),

        en('reschedule',
            'Tekhelet Visiting Center Tour – Updated Schedule',
            `We wanted to let you know that your tour at the Tekhelet Visiting Center has been rescheduled.

Updated details:
  Group:    {{groupName}}
  New Date: {{tourDateFull}}
  New Time: {{startTime}} – {{endTime}}

If you have any questions please don't hesitate to contact us.

The Tekhelet Team`
        ),

        he('reschedule',
            'סיור מרכז מבקרים פתיל תכלת – עדכון מועד הסיור',
            `ברצוננו להודיעך כי מועד הסיור שלך במרכז מבקרים פתיל תכלת עודכן.

פרטים מעודכנים:
  קבוצה:      {{groupName}}
  תאריך חדש:  {{tourDateFull}}
  שעה חדשה:   {{startTime}} – {{endTime}}

לכל שאלה, אנא פנה/י אלינו.

צוות פתיל תכלת`
        ),

        en('cancellation',
            'Tekhelet Visiting Center Tour – Cancellation Notice',
            `This is to confirm that your tour booking at the Tekhelet Visiting Center has been cancelled.

  Group: {{groupName}}
  Date:  {{tourDateFull}}
  Time:  {{startTime}}

We hope to welcome you at a future date.

The Tekhelet Team`
        ),

        he('cancellation',
            'סיור מרכז מבקרים פתיל תכלת – ביטול ההזמנה',
            `בזאת אנו מאשרים כי ההזמנה שלך לסיור במרכז מבקרים פתיל תכלת בוטלה.

  קבוצה: {{groupName}}
  תאריך: {{tourDateFull}}
  שעה:   {{startTime}}

מקווים לראותך בביקור עתידי.

צוות פתיל תכלת`
        ),

        en('reminder',
            'Tekhelet Visiting Center Tour – Upcoming Tour Reminder',
            `This is a friendly reminder about your upcoming tour at the Tekhelet Visiting Center.

  Group:        {{groupName}}
  Date:         {{tourDateFull}}
  Time:         {{startTime}} – {{endTime}}
  Participants: {{participantSummary}}{{programLine}}

If you need to make any changes, please reply to this email.

See you soon!

The Tekhelet Team`
        ),

        he('reminder',
            'סיור מרכז מבקרים פתיל תכלת – תזכורת לסיור הקרוב',
            `תזכורת ידידותית לסיור הקרוב שלך במרכז מבקרים פתיל תכלת.

  קבוצה:    {{groupName}}
  תאריך:    {{tourDateFull}}
  שעה:      {{startTime}} – {{endTime}}
  משתתפים:  {{participantSummary}}{{programLine}}

אם צריך לשנות משהו, אנא השב/י לאימייל זה.

נתראה בקרוב!

צוות פתיל תכלת`
        ),

        en('post_visit',
            'Thank you for visiting the Tekhelet Visiting Center',
            `Thank you for visiting us at the Tekhelet Visiting Center!

We hope you enjoyed your tour and discovered something new about the ancient tekhelet dye.{{reviewLine}}

We look forward to welcoming you again.

The Tekhelet Team`
        ),

        he('post_visit',
            'תודה שביקרתם במרכז מבקרים פתיל תכלת',
            `תודה שביקרתם במרכז מבקרים פתיל תכלת!

מקווים שנהניתם מהסיור ולמדתם משהו חדש על תעשיית התכלת העתיקה.{{reviewLine}}

נשמח לארח אתכם שוב.

צוות פתיל תכלת`
        ),
    ];
};

module.exports = autoSeed;
