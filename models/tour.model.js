const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, required: true }, // e.g., Individual/Family, Day School, etc.
    status: {
        type: String,
        enum: ['Scheduled', 'Confirmed', 'Cancelled'],
        default: 'Scheduled'
    },
    counts: {
        regular: { type: Number, default: 0 },
        seniorSoldier: { type: Number, default: 0 },
        child: { type: Number, default: 0 }
    },
    location: {
        country: String,
        city: String
    },
    affiliation: String, // Religious affiliation
    visitorStatus: String, // First-Time / Returning
    referral: {
        source: String,
        referrer: String
    },
    vipGuests: String,
    contact: {
        leaderName: String,
        leaderPhone: String,
        leaderEmail: String,
        externalGuide: String,
        externalGuidePhone: String,
        externalGuideEmail: String
    },
    booking: {
        source: String,
        date: String,
        subtotalReg: Number,
        subtotalSenior: Number,
        subtotalWorkshop: Number,
        totalCost: { type: Number, default: 0 },
        priceReason: String,
        paymentLinkSent: { type: Boolean, default: false },
        prepaid: { type: Boolean, default: false },
        history: [String]
    },
    visitDetails: {
        incidents: String,
        mediaLinks: [String]
    },
    engagement: {
        storeVisit: { type: Boolean, default: false },
        tekheletItems: [String],
        otherItems: [String]
    },
    postVisit: {
        paymentStatus: { type: String, default: 'Pending' },
        donation: {
            done: { type: Boolean, default: false },
            amount: { type: Number, default: 0 }
        },
        reviewRequested: { type: Boolean, default: false },
        reviewReceived: { type: Boolean, default: false },
        reviewText: String,
        newsletterOptIn: { type: Boolean, default: false },
        socialMediaMention: { type: Boolean, default: false },
        ambassador: { type: Boolean, default: false },
        improvements: String
    }
});

const tourSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: String, required: true }, // Format: "YYYY-MM-DD"
    startTime: { type: String, required: true }, // e.g., "10:00"
    endTime: { type: String, required: true },   // e.g., "11:30"
    color: { type: String, default: '#134869' }, // Default calendar color

    language: { type: String, required: true, default: 'English' },
    primaryGuide: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedGuides: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    isWorkshop: { type: Boolean, default: false },
    isShiur: { type: Boolean, default: false },

    specialRequests: String,
    sensitivities: String,
    timeAlteration: String,

    groups: [groupSchema],

    googleEvents: {
        type: Map,
        of: String,
        default: {}
    },

    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

// Virtual for FullCalendar compatibility
tourSchema.virtual('start').get(function () {
    if (!this.startTime || !this.date) return null;
    return `${this.date}T${this.startTime}`;
});

// Virtual for total participants across all groups
tourSchema.virtual('totalParticipants').get(function () {
    if (!this.groups || this.groups.length === 0) return 0;
    return this.groups.reduce((sum, group) => {
        const counts = group.counts || {};
        return sum + (counts.regular || 0) + (counts.seniorSoldier || 0) + (counts.child || 0);
    }, 0);
});

tourSchema.set('toJSON', { virtuals: true });
tourSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Tour', tourSchema);
