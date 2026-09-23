/**
 * automation.service.js
 * Event-driven email automation for tour groups.
 *
 * Triggered by the tour controller after create/update.
 * All functions are fire-and-forget — errors log but never propagate to HTTP responses.
 *
 * Phase B triggers:
 *   - New group added    → create mail folders, lookup prior inquiry, queue first email
 *   - Group status change → queue confirmation / cancellation email
 *   - Tour rescheduled   → queue reschedule notice to all active groups
 */

const mailService = require('./mail.service');
const EmailLog = require('../models/emailLog.model');
const EmailTemplate = require('../models/emailTemplate.model');
const AppConfig = require('../models/appConfig.model');
const Tour = require('../models/tour.model');
const { buildVars, renderTemplate } = require('./mailTemplates');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Wrap a plain-text body in a minimal RTL HTML shell.
 * `white-space: pre-wrap` preserves the line breaks and spacing from the
 * plain-text template while letting the email client render RTL correctly.
 */
const escapeHtml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const wrapRtlHtml = (body) => {
    // Outlook's Word-based renderer ignores white-space:pre-wrap, so we must
    // convert newlines and multi-space alignment runs to explicit HTML equivalents.
    const html = escapeHtml(body)
        .replace(/ {2,}/g, m => '&nbsp;'.repeat(m.length)) // preserve column alignment
        .replace(/\n/g, '<br>\n');                           // explicit line breaks
    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"></head>
<body style="direction:rtl;text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;margin:0;padding:16px;">
<div dir="rtl" style="direction:rtl;text-align:right;">${html}</div>
</body>
</html>`;
};

// ─── Folder helpers ──────────────────────────────────────────────────────────

/**
 * Derive a short stable tag for a group.
 * Format: [TB-xxxx-NN] where xxxx = last 4 hex chars of tour._id (stable per tour)
 *                              NN   = 1-based group position, zero-padded
 */
const makeGroupTag = (tourId, groupIdx) =>
    `[TB-${tourId.toString().slice(-4)}-${String(groupIdx + 1).padStart(2, '0')}]`;

/**
 * Ensure the Tour folder and Group subfolder exist in the mailbox.
 * IDs are persisted back to the DB so we never re-create them on future calls.
 * Returns { tourFolderId, groupFolderId, groupTag }.
 */
const ensureGroupFolders = async (account, tour, group, groupIdx) => {
    const tourShort = tour._id.toString().slice(-4);
    const groupTag = makeGroupTag(tour._id, groupIdx);
    const tourFolderName = `${tour.title} - ${tour.date} [TB-${tourShort}]`;
    const groupFolderName = `${group.name || 'Group'} ${groupTag}`;

    // Tour-level folder under Tours/
    let tourFolderId = tour.mailFolderId;
    if (!tourFolderId) {
        tourFolderId = await mailService.ensureFolderPath(account, ['Tours', tourFolderName]);
        await Tour.updateOne({ _id: tour._id }, { $set: { mailFolderId: tourFolderId } });
        tour.mailFolderId = tourFolderId; // reflect in-memory
    }

    // Group-level folder (child of tour folder)
    let groupFolderId = group.mailFolderId;
    if (!groupFolderId) {
        groupFolderId = await mailService.ensureChildFolder(account, tourFolderId, groupFolderName);
        await Tour.updateOne(
            { _id: tour._id, 'groups._id': group._id },
            { $set: { 'groups.$.mailFolderId': groupFolderId } }
        );
        group.mailFolderId = groupFolderId; // reflect in-memory
    }

    return { tourFolderId, groupFolderId, groupTag };
};

// ─── Email sending ───────────────────────────────────────────────────────────

/**
 * Render and send/draft one email for a specific group.
 * opts.groupTag:      the [TB-…] tag string (required for subject/body rendering)
 * opts.groupFolderId: destination folder for auto-sent messages
 * opts.inquiryConvId: if set and mode=auto, reply on this thread instead of sending fresh
 */
const sendGroupEmail = async (account, templateKey, tour, group, groupIdx, opts = {}) => {
    const { groupTag, groupFolderId, inquiryConvId, reviewLink } = opts;

    const lang = (tour.language || '').toLowerCase().startsWith('heb') ? 'he' : 'en';
    const template = await EmailTemplate.findOne({ key: templateKey, language: lang });
    if (!template || template.mode === 'off') return;

    const to = group.contact?.leaderEmail || group.contact?.externalGuideEmail;
    if (!to) {
        console.warn(`[automation] No recipient for group ${group._id} — skipping ${templateKey}`);
        return;
    }

    const vars = buildVars(tour, group, groupTag, { reviewLink });
    const subject = renderTemplate(template.subject, vars);
    const body = renderTemplate(template.body, vars);

    // Store the group tag as a hidden header — invisible to the recipient but
    // readable via Graph for the filing sweep. Strip brackets for the header value.
    const headerTag = (groupTag || '').replace(/[\[\]]/g, '');

    // Hebrew emails need RTL direction which plain text cannot express.
    // Wrap in a minimal HTML shell so the email client renders it correctly.
    const msgPayload = lang === 'he'
        ? { to, subject, html: wrapRtlHtml(body), tag: headerTag }
        : { to, subject, text: body, tag: headerTag };

    const log = await EmailLog.create({
        tourId: tour._id,
        groupId: group._id,
        templateKey,
        to,
        subject,
        mode: template.mode,
        status: 'queued'
    });

    try {
        if (template.mode === 'draft') {
            // Create a draft in Drafts folder; employee reviews and hits send.
            // The nightly filing sweep (Phase C) will move it once sent.
            const msg = await mailService.createDraft(account, msgPayload);
            log.messageId = msg.id;
            log.conversationId = msg.conversationId;
            log.status = 'draft';
        } else {
            // auto mode: reply on inquiry thread when possible, otherwise send fresh
            if (inquiryConvId) {
                const thread = await mailService.findByConversation(account, inquiryConvId);
                if (thread.length > 0) {
                    await mailService.replyToMessage(account, thread[0].id, msgPayload);
                    log.conversationId = inquiryConvId;
                    log.status = 'sent';
                    log.sentAt = new Date();
                    await log.save();
                    return;
                }
            }
            const msg = await mailService.sendMessage(account, msgPayload);
            if (groupFolderId) {
                await mailService.moveMessage(account, msg.id, groupFolderId).catch(e =>
                    console.warn('[automation] Could not file sent message:', e.message)
                );
            }
            log.messageId = msg.id;
            log.conversationId = msg.conversationId;
            log.status = 'sent';
            log.sentAt = new Date();
        }
    } catch (e) {
        log.status = 'failed';
        log.error = e.message;
        console.error(`[automation] ${templateKey} failed for group ${group._id}:`, e.message);
    }

    await log.save();
};

// ─── Event handlers ──────────────────────────────────────────────────────────

/**
 * Called when a new group is added to a tour.
 * Creates folders, looks up any prior inquiry email, queues the appropriate first email.
 */
const handleNewGroup = async (account, tour, group, groupIdx) => {
    // Detect group-move: this group appears as "new" in this tour but has prior
    // email history from a different tour (coordinator used the Move Group modal).
    // The group's _id is preserved when moved, so EmailLog still links to it.
    // In this case send a reschedule instead of an awaiting-confirmation.
    if (group._id) {
        const priorLog = await EmailLog.findOne({
            groupId: group._id,
            tourId: { $ne: tour._id }
        }).lean();
        if (priorLog) {
            console.log(`[automation] Group ${group._id} was moved from another tour — sending reschedule`);
            const { groupFolderId, groupTag } = await ensureGroupFolders(account, tour, group, groupIdx);
            await sendGroupEmail(account, 'reschedule', tour, group, groupIdx, { groupTag, groupFolderId });
            return;
        }
    }

    const { groupFolderId, groupTag } = await ensureGroupFolders(account, tour, group, groupIdx);

    // Inquiry lookup: find the email that started the booking conversation (up to 30 days back).
    // Only auto-file when exactly one thread matches — multiple results risk false matches.
    let inquiryConvId = null;
    const email = group.contact?.leaderEmail || group.contact?.externalGuideEmail;
    if (email) {
        const msgs = await mailService.findBySender(account, email, 30).catch(() => []);
        if (msgs.length === 1) {
            inquiryConvId = msgs[0].conversationId;
            await mailService.moveMessage(account, msgs[0].id, groupFolderId).catch(e =>
                console.warn('[automation] Could not file inquiry email:', e.message)
            );
        } else if (msgs.length > 1) {
            console.log(`[automation] ${msgs.length} prior emails from ${email} — skipping auto-file to avoid false match`);
        }
    }

    // Choose the right template based on the group's initial status
    const key = group.status === 'Confirmed' ? 'confirmed'
        : group.status === 'Awaiting Confirmation' ? 'awaiting_confirmation'
        : null;
    if (key) {
        await sendGroupEmail(account, key, tour, group, groupIdx, { groupTag, groupFolderId, inquiryConvId });
    }
};

/**
 * Called when an existing group's status changes.
 */
const handleStatusChange = async (account, tour, group, groupIdx) => {
    const { groupFolderId, groupTag } = await ensureGroupFolders(account, tour, group, groupIdx);
    const key = group.status === 'Confirmed' ? 'confirmed'
        : group.status === 'Awaiting Confirmation' ? 'awaiting_confirmation'
        : group.status === 'Cancelled' ? 'cancellation'
        : null;
    if (key) {
        await sendGroupEmail(account, key, tour, group, groupIdx, { groupTag, groupFolderId });
    }
};

/**
 * Called when a tour's date or start time changes for a specific active group.
 */
const handleReschedule = async (account, tour, group, groupIdx) => {
    const { groupFolderId, groupTag } = await ensureGroupFolders(account, tour, group, groupIdx);
    await sendGroupEmail(account, 'reschedule', tour, group, groupIdx, { groupTag, groupFolderId });
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call after a new tour is saved.
 * Processes all groups in the tour.
 */
const onTourCreated = async (tour) => {
    const account = await mailService.getActiveAccount();
    if (!account) return;

    for (let i = 0; i < tour.groups.length; i++) {
        await handleNewGroup(account, tour, tour.groups[i], i);
    }
};

/**
 * Call after a tour is updated.
 * Detects new groups, status changes, and date/time reschedules.
 * If a reschedule happened, the reschedule email takes priority over a
 * simultaneous status-change email to avoid duplicate sends.
 */
const onTourUpdated = async (oldTour, newTour) => {
    const account = await mailService.getActiveAccount();
    if (!account) return;

    const oldGroupIds = new Set(oldTour.groups.map(g => g._id.toString()));
    const oldGroupMap = new Map(oldTour.groups.map(g => [g._id.toString(), g]));
    const rescheduled = oldTour.date !== newTour.date || oldTour.startTime !== newTour.startTime;

    for (let i = 0; i < newTour.groups.length; i++) {
        const group = newTour.groups[i];
        const gid = group._id.toString();

        if (!oldGroupIds.has(gid)) {
            await handleNewGroup(account, newTour, group, i);
            continue;
        }

        const oldGroup = oldGroupMap.get(gid);
        const active = !['Cancelled', 'No Show'].includes(group.status);

        if (rescheduled && active) {
            // Reschedule takes priority — don't also send a status-change email
            await handleReschedule(account, newTour, group, i);
        } else if (oldGroup.status !== group.status) {
            await handleStatusChange(account, newTour, group, i);
        }
    }
};

/**
 * Phase C — Filed sent-drafts sweep.
 *
 * When a coordinator manually sends a draft from Outlook it lands in Sent Items.
 * This sweep finds every EmailLog still marked 'draft', checks via Graph whether
 * the message has left the Drafts folder, and if so moves it into the correct
 * group folder and marks the log 'sent'.
 *
 * Safe to run repeatedly — messages already in the group folder are left alone.
 * Called by the node-cron job in index.js every 30 min, and by the manual
 * POST /api/mail/sweep endpoint so coordinators can trigger it on-demand.
 */
const sweepSentDrafts = async () => {
    const account = await mailService.getActiveAccount();
    if (!account) return { swept: 0, total: 0 };

    const draftLogs = await EmailLog.find({
        status: 'draft',
        messageId: { $exists: true, $ne: null }
    }).lean();

    if (!draftLogs.length) return { swept: 0, total: 0 };

    // Fetch the well-known Drafts folder id once for the entire sweep.
    let draftsFolderId;
    try {
        draftsFolderId = await mailService.getDraftsFolderId(account);
    } catch (e) {
        console.error('[sweep] Could not resolve Drafts folder:', e.message);
        return { swept: 0, total: draftLogs.length };
    }

    let swept = 0;
    for (const log of draftLogs) {
        try {
            // Resolve the group's mail folder from the tour document.
            const tour = await Tour.findById(log.tourId, 'groups').lean();
            const group = tour?.groups?.find(g => g._id.toString() === log.groupId?.toString());
            const folderId = group?.mailFolderId;
            if (!folderId) {
                console.warn(`[sweep] No mailFolderId for group ${log.groupId} — skipping`);
                continue;
            }

            // Fetch the message — null means deleted or ID no longer valid.
            const msg = await mailService.getMessage(account, log.messageId);
            if (!msg) continue;

            // Still sitting in Drafts — coordinator hasn't sent it yet.
            if (msg.parentFolderId === draftsFolderId || msg.isDraft) continue;

            // Message has left Drafts (was sent).  Move to group folder if not already there.
            if (msg.parentFolderId !== folderId) {
                await mailService.moveMessage(account, msg.id, folderId).catch(e =>
                    console.warn(`[sweep] Could not file message ${msg.id}:`, e.message)
                );
            }

            await EmailLog.updateOne(
                { _id: log._id },
                { $set: { status: 'sent', sentAt: msg.sentDateTime ? new Date(msg.sentDateTime) : new Date() } }
            );
            swept++;
        } catch (e) {
            console.warn(`[sweep] Failed on log ${log._id}:`, e.message);
        }
    }

    console.log(`[sweep] Done: ${swept} / ${draftLogs.length} draft(s) filed`);
    return { swept, total: draftLogs.length };
};

// ─── Scheduled emails (Phase C) ──────────────────────────────────────────────

const SITE_TZ = process.env.SITE_TZ || 'Asia/Jerusalem';

// Current date/time in the site timezone as 'YYYY-MM-DD' + 'HH:MM' strings.
// Tour dates/times are stored as local wall-clock strings, so all comparisons
// are done in site-local terms — safe regardless of the server's own timezone.
const siteNow = () => {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: SITE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(new Date()).map(p => [p.type, p.value])
    );
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};

// Shift a 'YYYY-MM-DD' string by N days (UTC math is safe at day precision).
const shiftDays = (dateStr, days) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

const getAutomationConfig = async () => {
    const docs = await AppConfig.find({ category: 'email_automation', isActive: true }).lean();
    const map = Object.fromEntries(docs.map(d => [d.key, d.value]));
    return {
        reminderDaysBefore: Number(map.reminder_days_before ?? 2),
        postTourDaysAfter: Number(map.post_tour_days_after ?? 0),
        reviewLink: map.google_review_link || ''
    };
};

// True if this group already has a log for this template (any non-failed state).
const alreadySent = (tourId, groupId, templateKey) =>
    EmailLog.exists({ tourId, groupId, templateKey, status: { $in: ['queued', 'draft', 'sent'] } });

// Only groups that were actually booked in — not awaiting confirmation, cancelled, or no-show.
const isBookedGroup = (g) => ['Scheduled', 'Confirmed'].includes(g.status);

// Start of the current site-local day as a UTC timestamp. Site days are what
// matter — an email sent yesterday shouldn't block today's reminder, but a
// confirmation sent this morning should.
const siteDayStartMs = () => {
    const tzName = new Intl.DateTimeFormat('en-US', { timeZone: SITE_TZ, timeZoneName: 'longOffset' })
        .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || 'GMT+00:00';
    const m = tzName.match(/GMT([+-])(\d{2}):(\d{2})/);
    const offsetMin = m ? (Number(m[2]) * 60 + Number(m[3])) * (m[1] === '-' ? -1 : 1) : 0;
    return Date.parse(`${siteNow().date}T00:00:00Z`) - offsetMin * 60000;
};

// True if this group got ANY automated email today (site-local day) — prevents
// back-to-back emails (e.g. confirmation + same-day reminder, or reschedule +
// thank-you when a group is moved to a tour in the past).
const emailedToday = (tourId, groupId) =>
    EmailLog.exists({ tourId, groupId, createdAt: { $gte: new Date(siteDayStartMs()) } });

/**
 * Hourly job: pre-tour reminders + post-tour thank-you emails.
 *
 * Reminder: fires once per group for tours landing within [today, today+N days].
 * Post-visit: fires once per group once the tour's end time + N days has passed.
 * Both dedupe via EmailLog so an hourly cron never double-sends.
 */
const runScheduledEmails = async () => {
    const account = await mailService.getActiveAccount();
    if (!account) return { reminders: 0, postVisit: 0 };

    const cfg = await getAutomationConfig();
    const now = siteNow();
    let reminders = 0, postVisit = 0;

    // ── Pre-tour reminders ──
    const reminderEnd = shiftDays(now.date, cfg.reminderDaysBefore);
    const upcoming = await Tour.find({ date: { $gte: now.date, $lte: reminderEnd } }).lean();

    for (const tour of upcoming) {
        for (let i = 0; i < (tour.groups || []).length; i++) {
            const group = tour.groups[i];
            if (!isBookedGroup(group)) continue;
            if (await alreadySent(tour._id, group._id, 'reminder')) continue;
            // Skip groups emailed today (e.g. booked this morning — the
            // confirmation already went out, a same-day reminder is redundant).
            if (await emailedToday(tour._id, group._id)) continue;
            const { groupFolderId, groupTag } = await ensureGroupFolders(account, tour, group, i);
            await sendGroupEmail(account, 'reminder', tour, group, i, { groupTag, groupFolderId });
            reminders++;
        }
    }

    // ── Post-tour thank-you ──
    // tourEnd <= cutoff means the tour ended at least postTourDaysAfter ago.
    // The floor prevents mass retroactive emails for old tours on first deploy.
    const cutoffStr = `${shiftDays(now.date, -cfg.postTourDaysAfter)}T${now.time}`;
    const floorDate = shiftDays(now.date, -cfg.postTourDaysAfter - 3);
    const ended = await Tour.find({ date: { $gte: floorDate, $lte: now.date } }).lean();

    for (const tour of ended) {
        const tourEnd = `${tour.date}T${tour.endTime || '23:59'}`;
        if (tourEnd > cutoffStr) continue;
        for (let i = 0; i < (tour.groups || []).length; i++) {
            const group = tour.groups[i];
            if (!isBookedGroup(group)) continue;
            if (await alreadySent(tour._id, group._id, 'post_visit')) continue;
            if (await emailedToday(tour._id, group._id)) continue;
            const { groupFolderId, groupTag } = await ensureGroupFolders(account, tour, group, i);
            await sendGroupEmail(account, 'post_visit', tour, group, i, {
                groupTag, groupFolderId, reviewLink: cfg.reviewLink
            });
            postVisit++;
        }
    }

    if (reminders || postVisit) {
        console.log(`[automation] Scheduled emails: ${reminders} reminder(s), ${postVisit} post-visit`);
    }
    return { reminders, postVisit };
};

module.exports = { onTourCreated, onTourUpdated, sweepSentDrafts, runScheduledEmails };
