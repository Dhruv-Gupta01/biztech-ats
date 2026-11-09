// Keeps the freelance status columns in step with what outreach emails actually contained, so the
// recruiter doesn't have to mark them by hand after sending:
//   - a calendly.com link          -> Calendly Link Sent = Sent
//   - NDA / ICA wording or file    -> NDA & ICA = Sent
//   - a slack.com invite link      -> Slack = Invited
// Only recipients the email provider accepted are touched, and a column that already holds a later
// state (Signed, Joined, Not Interested, ...) is never moved back.
const Candidate = require('../models/Candidate');

const NDA_ICA = /\b(nda|ica)\b|non[- ]?disclosure|contractor agreement/i;
// A domain written as a link, with or without https:// (recruiters often type "calendly.com/name/30min"). The
// leading guard and trailing lookahead keep look-alikes such as notcalendly.com or calendly.com.evil.io out.
const domainRegex = (domain) => new RegExp(`(^|[^a-z0-9-])(?:[a-z0-9-]+\\.)*${domain.replace('.', '\\.')}(?=[/\\s?#:]|$)`, 'i');
const CALENDLY_LINK = domainRegex('calendly.com');
const SLACK_LINK = domainRegex('slack.com');

// links: [{name, url}] link attachments; files: [{name}] attached files.
function detectSignals({ subject = '', body = '', links = [], files = [] }) {
  const linkText = [...links.map((l) => l.url).filter(Boolean), String(body)].join('\n');
  const ndaText = [subject, body, ...links.map((l) => l.name), ...files.map((f) => f.name)].filter(Boolean).join('\n');
  return {
    calendly: CALENDLY_LINK.test(linkText),
    ndaIca: NDA_ICA.test(ndaText),
    slack: SLACK_LINK.test(linkText)
  };
}

// emails: addresses the provider accepted. Returns { modified, candidates } where candidates carry the
// four status fields so the UI can update rows straight away.
async function applyOutreachSignals(emails, signals) {
  const list = [...new Set((emails || []).map((e) => String(e).toLowerCase().trim()).filter(Boolean))];
  const modified = { calendlyLinkSent: 0, ndaIca: 0, slackStatus: 0 };
  if (list.length === 0 || !(signals.calendly || signals.ndaIca || signals.slack)) return { modified, candidates: [] };
  const now = new Date();
  const base = { email: { $in: list } };

  if (signals.calendly) {
    const r = await Candidate.updateMany(base, { $set: { calendlyLinkSent: 'Sent', calendlyLinkSentAt: now, updatedAt: now } });
    modified.calendlyLinkSent = r.modifiedCount || 0;
  }
  if (signals.ndaIca) {
    const r = await Candidate.updateMany({ ...base, ndaIca: { $in: [null, 'Not Sent'] } }, { $set: { ndaIca: 'Sent', updatedAt: now } });
    modified.ndaIca = r.modifiedCount || 0;
  }
  if (signals.slack) {
    const r = await Candidate.updateMany({ ...base, slackStatus: null }, { $set: { slackStatus: 'Invited', updatedAt: now } });
    modified.slackStatus = r.modifiedCount || 0;
  }

  const candidates = await Candidate.find(base, 'calendlyLinkSent calendlyLinkSentAt calendlyLinkStatus ndaIca slackStatus updatedAt').lean();
  return { modified, candidates };
}

module.exports = { detectSignals, applyOutreachSignals };
