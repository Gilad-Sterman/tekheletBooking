const mongoose = require('mongoose');

const tourSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: String, required: true }, // Format: "YYYY-MM-DD"
    startTime: { type: String, required: true }, // e.g., "10:00"
    endTime: { type: String, required: true },   // e.g., "11:30"
    tourType: { type: mongoose.Schema.Types.ObjectId, ref: 'TourType', required: true },

    participants: {
        name: String,
        contact: String,
        email: String,
        groupSize: { type: Number, default: 1 },
        notes: String
    },

    assignedGuides: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    status: {
        type: String,
        enum: ['Scheduled', 'Confirmed', 'Completed', 'Cancelled'],
        default: 'Scheduled'
    },

    price: { type: Number, default: 0 },

    googleEvents: {
        type: Map,
        of: String,
        default: {}
    }, // Sync references: { userId: eventId }

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

tourSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Tour', tourSchema);
