const mongoose = require('mongoose');

/**
 * Stores the subject + body for each automated email type, keyed by (key, language).
 * Templates support {{mergeVar}} placeholders — see mailTemplates.js for the var set.
 * mode: 'draft' → create a draft for employee review
 *       'auto'  → send immediately
 *       'off'   → do not send at all
 */
const emailTemplateSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        // awaiting_confirmation, confirmed, reschedule, cancellation
        // reminder_2day, payment_link, thank_you (Phase C+)
    },
    language: { type: String, enum: ['en', 'he'], required: true },
    mode: { type: String, enum: ['draft', 'auto', 'off'], default: 'draft' },
    subject: { type: String, required: true },
    body: { type: String, required: true }
}, { timestamps: true });

emailTemplateSchema.index({ key: 1, language: 1 }, { unique: true });

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
