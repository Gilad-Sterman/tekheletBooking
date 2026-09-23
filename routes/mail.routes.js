const express = require('express');
const router = express.Router();
const mailService = require('../services/mail.service');
const { sweepSentDrafts } = require('../services/automation.service');
const EmailLog = require('../models/emailLog.model');
const { auth, isCoordinator } = require('../middleware/auth.middleware');

// Connected mailbox status
router.get('/status', auth, async (req, res) => {
    const account = await mailService.getActiveAccount();
    if (!account) return res.json({ connected: false });
    res.json({
        connected: true,
        email: account.email,
        displayName: account.displayName,
        connectedAt: account.createdAt,
        lastUsedAt: account.lastUsedAt
    });
});

router.post('/disconnect', auth, isCoordinator, async (req, res) => {
    await mailService.disconnect();
    res.json({ message: 'Mailbox disconnected' });
});

// End-to-end connectivity test: create folder path, send (or draft) a message to
// the connected mailbox itself, then move it into the test folder.
// POST /api/mail/test  { "draft": true }  → creates draft instead of sending
router.post('/test', auth, isCoordinator, async (req, res) => {
    const account = await mailService.getActiveAccount();
    if (!account) return res.status(400).json({ error: 'No mailbox connected' });

    try {
        const tag = '[TB-TEST-01]';
        const folderId = await mailService.ensureFolderPath(account, [
            'Tours', 'Connectivity Test [TB-TEST]', 'Test Group [TB-TEST-01]'
        ]);

        const log = await EmailLog.create({
            templateKey: 'connectivity_test',
            to: account.email,
            subject: `Tekhelet connectivity test ${tag}`,
            mode: req.body.draft ? 'draft' : 'auto',
            status: 'queued'
        });

        let messageId, conversationId;
        if (req.body.draft) {
            const msg = await mailService.createDraft(account, {
                to: account.email,
                subject: log.subject,
                text: 'Draft-mode test: this message is waiting in Drafts for review.'
            });
            messageId = msg.id; conversationId = msg.conversationId;
            log.status = 'draft';
        } else {
            const msg = await mailService.sendMessage(account, {
                to: account.email,
                subject: log.subject,
                text: 'Automated test: folder creation, send, and filing all worked.'
            });
            messageId = msg.id; conversationId = msg.conversationId;
            try {
                await mailService.moveMessage(account, messageId, folderId);
            } catch (moveErr) {
                // The sent copy may carry a different id — find it via the conversation
                const msgs = await mailService.findByConversation(account, conversationId);
                const sentCopy = msgs.find(m => m.subject === log.subject && m.parentFolderId !== folderId);
                if (!sentCopy) throw moveErr;
                await mailService.moveMessage(account, sentCopy.id, folderId);
                messageId = sentCopy.id;
            }
            log.status = 'sent';
            log.sentAt = new Date();
        }

        log.messageId = messageId;
        log.conversationId = conversationId;
        await log.save();

        res.json({ ok: true, folderId, messageId, conversationId, status: log.status });
    } catch (err) {
        console.error('Mail test failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// Manual trigger for the sent-drafts filing sweep.
// Coordinators can hit this from the Settings page to file recently-sent drafts
// without waiting for the 30-minute cron window.
router.post('/sweep', auth, isCoordinator, async (req, res) => {
    try {
        const result = await sweepSentDrafts();
        res.json(result);
    } catch (err) {
        console.error('Sweep failed:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
