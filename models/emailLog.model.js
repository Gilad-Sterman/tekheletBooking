const mongoose = require('mongoose');

// Audit trail for every automated/manual system email.
// Metadata only — the app never stores or renders email bodies.
const emailLogSchema = new mongoose.Schema({
    tourId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tour' },
    groupId: { type: mongoose.Schema.Types.ObjectId }, // subdoc id within tour.groups
    templateKey: { type: String, default: '' }, // e.g. 'confirmation', 'reminder', 'payment_link'
    to: String,
    subject: String,
    mode: { type: String, enum: ['draft', 'auto'], default: 'auto' },
    status: {
        type: String,
        enum: ['queued', 'draft', 'sent', 'failed'],
        default: 'queued'
    },
    messageId: String,       // provider message id
    conversationId: String,  // provider conversation/thread id — used for filing + reply chaining
    error: String,
    sentAt: Date
}, { timestamps: true });

emailLogSchema.index({ tourId: 1, groupId: 1 });
emailLogSchema.index({ status: 1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);
