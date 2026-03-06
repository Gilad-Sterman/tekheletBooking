const mongoose = require('mongoose');

const tourTypeSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,
    basePrice: { type: Number, default: 0 },
    defaultDuration: { type: Number, default: 60 }, // in minutes
    color: { type: String, default: '#3788d8' }, // for calendar display
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

module.exports = mongoose.model('TourType', tourTypeSchema);
