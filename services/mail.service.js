const axios = require('axios');
const MailAccount = require('../models/mailAccount.model');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'openid profile offline_access User.Read Mail.ReadWrite Mail.Send';
const EXPIRY_BUFFER_MS = 2 * 60 * 1000;

const tenant = () => process.env.MS_TENANT || 'consumers';

// ---------- OAuth ----------

const getAuthUrl = (state = '') => {
    const params = new URLSearchParams({
        client_id: process.env.MS_CLIENT_ID,
        response_type: 'code',
        redirect_uri: process.env.MS_REDIRECT_URI,
        response_mode: 'query',
        scope: SCOPES,
        state
    });
    return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${params}`;
};

const tokenRequest = async (fields) => {
    const res = await axios.post(
        `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
        new URLSearchParams({
            client_id: process.env.MS_CLIENT_ID,
            client_secret: process.env.MS_CLIENT_SECRET,
            redirect_uri: process.env.MS_REDIRECT_URI,
            scope: SCOPES,
            ...fields
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const t = res.data;
    return {
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        token_type: t.token_type,
        scope: t.scope,
        expiry_date: Date.now() + (t.expires_in || 3600) * 1000
    };
};

// Exchange the consent code, fetch the mailbox profile, persist as MailAccount.
const connectFromCode = async (code, connectedBy = null) => {
    const tokens = await tokenRequest({
        grant_type: 'authorization_code',
        code
    });

    const profile = await axios.get(`${GRAPH}/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const email = profile.data.mail || profile.data.userPrincipalName;
    // Deactivate any previously connected account before activating the new one
    // so there is never more than one active mailbox at a time.
    await MailAccount.updateMany({ provider: 'microsoft' }, { isActive: false });
    const account = await MailAccount.findOneAndUpdate(
        { provider: 'microsoft', email },
        {
            email,
            displayName: profile.data.displayName || '',
            externalUserId: profile.data.id,
            connectedBy,
            tokens,
            isActive: true
        },
        { upsert: true, returnDocument: 'after' }
    );
    return account;
};

const disconnect = async () => {
    await MailAccount.updateMany({ provider: 'microsoft' }, { isActive: false, tokens: {} });
};

const getActiveAccount = () => MailAccount.findOne({ provider: 'microsoft', isActive: true });

// Refresh if expired (or near), persist rotated tokens back — the part the old
// Google sync got wrong.
const ensureFreshToken = async (account) => {
    if (account.tokens?.access_token && account.tokens.expiry_date > Date.now() + EXPIRY_BUFFER_MS) {
        return account.tokens.access_token;
    }
    if (!account.tokens?.refresh_token) {
        throw new Error('Mail account has no refresh token — reconnect the mailbox');
    }
    const tokens = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: account.tokens.refresh_token
    });
    // Microsoft may omit a rotated refresh token — keep the old one if so
    if (!tokens.refresh_token) tokens.refresh_token = account.tokens.refresh_token;
    account.tokens = tokens;
    account.lastUsedAt = new Date();
    await account.save();
    return tokens.access_token;
};

// ---------- Graph request wrapper ----------

const graph = async (account, method, path, { data, params } = {}, retried = false) => {
    const token = await ensureFreshToken(account);
    try {
        const res = await axios({
            method,
            url: `${GRAPH}${path}`,
            headers: {
                Authorization: `Bearer ${token}`,
                // Keep message ids stable across folder moves / draft→send transitions
                Prefer: 'IdType="ImmutableId"'
            },
            data,
            params
        });
        account.lastUsedAt = new Date();
        await account.save();
        return res.data;
    } catch (err) {
        if (err.response?.status === 401 && !retried) {
            account.tokens.expiry_date = 0; // force refresh and retry once
            return graph(account, method, path, { data, params }, true);
        }
        const detail = err.response?.data?.error?.message || err.message;
        throw new Error(`Graph ${method} ${path} failed: ${detail}`);
    }
};

const me = (path) => `/me${path}`;

// ---------- Folders ----------

const findChildFolder = async (account, name, parentId = null) => {
    const path = parentId
        ? me(`/mailFolders/${parentId}/childFolders`)
        : me('/mailFolders');
    const res = await graph(account, 'GET', path, {
        params: { $filter: `displayName eq '${name.replace(/'/g, "''")}'`, $top: 1, $select: 'id,displayName' }
    });
    return res.value?.[0] || null;
};

const createFolder = async (account, name, parentId = null) => {
    const path = parentId
        ? me(`/mailFolders/${parentId}/childFolders`)
        : me('/mailFolders');
    return graph(account, 'POST', path, { data: { displayName: name } });
};

// Ensure a nested path like ['Tours', '2026-09-28 - Morning', 'Cohen'] exists.
// Returns the deepest folder's id.
const ensureFolderPath = async (account, segments) => {
    let parentId = null;
    let folder = null;
    for (const name of segments) {
        folder = await findChildFolder(account, name, parentId);
        if (!folder) folder = await createFolder(account, name, parentId);
        parentId = folder.id;
    }
    return parentId;
};

// Find or create a single child folder under a known parent id.
// More efficient than re-walking the full path when the parent id is already stored.
const ensureChildFolder = async (account, parentId, name) => {
    const existing = await findChildFolder(account, name, parentId);
    if (existing) return existing.id;
    const created = await createFolder(account, name, parentId);
    return created.id;
};

// ---------- Messages ----------

// Create a draft message (lands in Drafts). Returns { id, conversationId }.
// tag (optional): stored as a hidden X-TB-Tag internet message header — invisible
// to recipients but readable via Graph for the filing sweep.
// When both html and text are provided, Graph sends multipart/alternative which
// improves deliverability (spam filters penalise HTML-only messages).
const createDraft = async (account, { to, subject, text, html, tag }) => {
    const data = {
        subject,
        // Use HTML body when provided; plain-text fallback is stored via the
        // singleValueExtendedProperties workaround if needed, but Graph also
        // auto-generates a plain-text version for HTML messages in most cases.
        body: { contentType: html ? 'HTML' : 'Text', content: html || text },
        toRecipients: [{ emailAddress: { address: to } }],
        // Set a human display name on the From address so the email doesn't
        // arrive with a bare email address, which looks automated to spam filters.
        from: {
            emailAddress: {
                name: process.env.MAIL_FROM_NAME || 'Tekhelet Visiting Center',
                address: account.email
            }
        },
        replyTo: [{
            emailAddress: {
                name: process.env.MAIL_FROM_NAME || 'Tekhelet Visiting Center',
                address: account.email
            }
        }]
    };
    if (tag) data.internetMessageHeaders = [{ name: 'X-TB-Tag', value: tag }];
    return graph(account, 'POST', me('/messages'), { data });
};

// Send a draft we created (keeps the same message/conversation ids).
const sendDraft = (account, messageId) =>
    graph(account, 'POST', me(`/messages/${messageId}/send`));

// Convenience: create + send in one call. Returns the message { id, conversationId }.
const sendMessage = async (account, args) => {
    const msg = await createDraft(account, args);
    await sendDraft(account, msg.id);
    return msg;
};

// Reply on an existing thread (sends immediately).
// Accepts { text } for plain text or { html } for HTML replies.
// tag (optional): stored as hidden X-TB-Tag header on the reply.
const replyToMessage = (account, messageId, { text, html, tag }) => {
    const message = { body: { contentType: html ? 'HTML' : 'Text', content: html || text } };
    if (tag) message.internetMessageHeaders = [{ name: 'X-TB-Tag', value: tag }];
    return graph(account, 'POST', me(`/messages/${messageId}/createReply`), { data: { message } })
        .then(draft => graph(account, 'POST', me(`/messages/${draft.id}/send`)));
};

const moveMessage = (account, messageId, destinationFolderId) =>
    graph(account, 'POST', me(`/messages/${messageId}/move`), {
        data: { destinationId: destinationFolderId }
    });

// Fetch a single message by ID. Returns null if not found (404).
const getMessage = async (account, messageId) => {
    try {
        return await graph(account, 'GET', me(`/messages/${messageId}`), {
            params: { $select: 'id,parentFolderId,sentDateTime,isDraft' }
        });
    } catch (e) {
        if (e.message.includes('404') || e.message.includes('not found')) return null;
        throw e;
    }
};

// Returns the well-known Drafts folder ID for this mailbox.
const getDraftsFolderId = async (account) => {
    const res = await graph(account, 'GET', me('/mailFolders/drafts'), {
        params: { $select: 'id' }
    });
    return res.id;
};

const findBySender = async (account, senderEmail, sinceDays = 30) => {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
    const res = await graph(account, 'GET', me('/messages'), {
        params: {
            $filter: `from/emailAddress/address eq '${senderEmail.replace(/'/g, "''")}' and receivedDateTime ge ${since}`,
            $select: 'id,conversationId,subject,receivedDateTime,from',
            $top: 50,
            $orderby: 'receivedDateTime desc'
        }
    });
    return res.value || [];
};

const findByConversation = async (account, conversationId) => {
    const res = await graph(account, 'GET', me('/messages'), {
        params: {
            $filter: `conversationId eq '${conversationId}'`,
            $select: 'id,conversationId,subject,receivedDateTime,parentFolderId'
        }
    });
    return res.value || [];
};

const findBySubjectTag = async (account, tag) => {
    const res = await graph(account, 'GET', me('/messages'), {
        params: {
            $filter: `contains(subject,'${tag.replace(/'/g, "''")}')`,
            $select: 'id,conversationId,subject,receivedDateTime,parentFolderId',
            $top: 100
        }
    });
    return res.value || [];
};

module.exports = {
    getAuthUrl,
    connectFromCode,
    disconnect,
    getActiveAccount,
    ensureFolderPath,
    ensureChildFolder,
    createDraft,
    sendDraft,
    sendMessage,
    replyToMessage,
    moveMessage,
    getMessage,
    getDraftsFolderId,
    findBySender,
    findByConversation,
    findBySubjectTag
};
