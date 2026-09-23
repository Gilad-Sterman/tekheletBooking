/**
 * mailTemplates.js
 * Merge-variable rendering and date/participant formatting for email templates.
 * Templates use {{varName}} placeholders.
 */

const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EN_MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const HE_DAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];
const HE_MONTHS = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

// Parse YYYY-MM-DD as a local date (not UTC) to avoid midnight roll-back issues.
const parseLocalDate = (dateStr) => {
    const [y, m, d] = (dateStr || '').split('-').map(Number);
    return new Date(y, m - 1, d);
};

const formatDateEn = (dateStr) => {
    const d = parseLocalDate(dateStr);
    return `${EN_DAYS[d.getDay()]}, ${EN_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const formatDateHe = (dateStr) => {
    const d = parseLocalDate(dateStr);
    // e.g. "יום שלישי, 28 בספטמבר 2026"
    return `${HE_DAYS[d.getDay()]}, ${d.getDate()} ב${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const participantSummaryEn = (counts = {}) => {
    const total = (counts.regular || 0) + (counts.seniorSoldier || 0)
        + (counts.group || 0) + (counts.child || 0);
    const parts = [];
    if (counts.regular)        parts.push(`${counts.regular} regular`);
    if (counts.seniorSoldier)  parts.push(`${counts.seniorSoldier} senior/soldier`);
    if (counts.group)          parts.push(`${counts.group} group`);
    if (counts.child)          parts.push(`${counts.child} child`);
    return total ? `${total} total (${parts.join(', ')})` : '—';
};

const participantSummaryHe = (counts = {}) => {
    const total = (counts.regular || 0) + (counts.seniorSoldier || 0)
        + (counts.group || 0) + (counts.child || 0);
    const parts = [];
    if (counts.regular)        parts.push(`${counts.regular} רגיל`);
    if (counts.seniorSoldier)  parts.push(`${counts.seniorSoldier} בכיר/חייל`);
    if (counts.group)          parts.push(`${counts.group} קבוצה`);
    if (counts.child)          parts.push(`${counts.child} ילד`);
    return total ? `${total} סה"כ (${parts.join(', ')})` : '—';
};

/**
 * Build the merge-variable map for a group email.
 * groupTag: the full tag string like '[TB-a1b2-01]'
 */
const buildVars = (tour, group, groupTag) => {
    const isHe = (tour.language || '').toLowerCase().startsWith('heb');
    const counts = group.counts || {};

    // programLine: appended inline after {{participantSummary}} in the template.
    // Starts with \n so it appears as a new indented line — or empty string if
    // neither workshop nor shiur is set.
    const programParts = [];
    if (tour.isWorkshop) programParts.push(isHe ? 'סדנה' : 'Workshop');
    if (tour.isShiur)    programParts.push(isHe ? 'שיעור' : 'Shiur');
    const programLine = programParts.length
        ? `\n  ${isHe ? 'כולל:    ' : 'Includes:    '}${programParts.join(', ')}`
        : '';

    // costLine: shows estimated total only when it has been entered (> 0).
    const cost = group.booking?.totalCost || 0;
    const costLine = cost > 0
        ? `\n  ${isHe ? 'מחיר משוער:  ₪' : 'Est. Total:  ₪'}${cost}`
        : '';

    return {
        leaderName: group.contact?.leaderName || group.contact?.externalGuideName || '',
        groupName: group.name || '',
        tourDateFull: isHe ? formatDateHe(tour.date) : formatDateEn(tour.date),
        startTime: tour.startTime || '',
        endTime: tour.endTime || '',
        participantSummary: isHe ? participantSummaryHe(counts) : participantSummaryEn(counts),
        totalCost: cost,
        programLine,
        costLine
    };
};

/**
 * Replace all {{varName}} placeholders with the corresponding value from vars.
 */
const renderTemplate = (templateStr, vars) =>
    templateStr.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] ?? '').toString());

module.exports = { buildVars, renderTemplate };
