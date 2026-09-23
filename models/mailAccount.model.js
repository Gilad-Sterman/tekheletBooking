const mongoose = require('mongoose');

// A connected mailbox the system sends/files mail through.
// For now a single active account is expected (the shared/coordinator mailbox),
// but the model supports more than one.
const mailAccountSchema = new mongoose.Schema({
    provider: { type: String, default: 'microsoft' },
    email: { type: String, required: true },
    displayName: String,
    externalUserId: String, // provider's object id for the mailbox
    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tokens: {
        access_token: String,
        refresh_token: String,
        token_type: String,
        scope: String,
        expiry_date: Number // epoch ms
    },
    isActive: { type: Boolean, default: true },
    lastUsedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('MailAccount', mailAccountSchema);
