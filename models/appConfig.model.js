const mongoose = require('mongoose');

const appConfigSchema = new mongoose.Schema({
    category: { 
        type: String, 
        required: true,
        enum: ['group_types', 'group_status', 'pricing', 'languages', 'tour_settings', 'payment_status', 'booking_sources']
    },
    key: { 
        type: String, 
        required: true 
    },
    value: { 
        type: mongoose.Schema.Types.Mixed, 
        required: true 
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },
    description: String,
    lastModified: { 
        type: Date, 
        default: Date.now 
    },
    modifiedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    }
}, { 
    timestamps: true 
});

// Compound index for efficient queries
appConfigSchema.index({ category: 1, key: 1 }, { unique: true });
appConfigSchema.index({ isActive: 1 });

module.exports = mongoose.model('AppConfig', appConfigSchema);
