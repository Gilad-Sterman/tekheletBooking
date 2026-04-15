const mongoose = require('mongoose');

const infoMessageSchema = new mongoose.Schema({
    text: { type: String, required: true },
    date: { type: String, required: true }, // Format: "YYYY-MM-DD"
    startTime: { type: String }, // e.g., "10:00"
    endTime: { type: String },   // e.g., "11:30"
    allDay: { type: Boolean, default: false },
    isRecurring: { type: Boolean, default: false },
    recurringType: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'none'],
        default: 'none'
    },
    type: { type: String, default: 'info' }, // for future categories
    color: { type: String, default: '#475569' }, // default slate gray for info messages
}, { timestamps: true });

// Virtual for FullCalendar compatibility
infoMessageSchema.virtual('start').get(function () {
    if (this.allDay) return this.date;
    if (!this.startTime || !this.date) return this.date;
    return `${this.date}T${this.startTime}`;
});

infoMessageSchema.virtual('end').get(function () {
    if (this.allDay) return null;
    if (!this.endTime || !this.date) return null;
    return `${this.date}T${this.endTime}`;
});

infoMessageSchema.set('toJSON', { virtuals: true });
infoMessageSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('InfoMessage', infoMessageSchema);
