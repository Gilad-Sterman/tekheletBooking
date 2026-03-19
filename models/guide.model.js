const mongoose = require('mongoose');

const guideSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    email: { 
        type: String, 
        required: true,
        unique: true 
    },
    phone: String,
    languages: [{
        type: String,
        default: ['English']
    }],
    specialties: [String],
    isActive: { 
        type: Boolean, 
        default: true 
    },
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: false // Optional link to users collection
    },
    notes: String
}, { 
    timestamps: true 
});

// Index for efficient queries
guideSchema.index({ isActive: 1 });
// Note: email index is already created by unique: true above

module.exports = mongoose.model('Guide', guideSchema);
