// Keeps the freelance status columns in step with what outreach emails actually contained, so the
// recruiter doesn't have to mark them by hand after sending:
//   - a calendly.com link          -> Calendly Link Sent = Sent
//   - NDA / ICA wording or file    -> NDA & ICA = Sent
//   - a slack.com invite link      -> Slack = Invited
// Only recipients the email provider accepted are touched, and a column that already holds a later
// state (Signed, Joined, Not Interested, ...) is never moved back.
const Candidate = require('../models/Candidate');

const CALENDLY_HOST = /(^|\.)calendly\.com$/i;
const SLACK_HOST = /(^|\.)slack\.com$/i;
const NDA_ICA = /\b(nda|ica)\b|non[- ]?disclosure|contractor agreement/i;
const URL_IN_TEXT = /https?:\/\/[^\s<>"')]+/gi;

function hosts(urls) {
  const out = [];
  for (const u of urls) {
    try { out.push(new URL(u).hostname); } catch { /* not a URL */ }
  }
  return out;
}

// links: [{name, url}] link attachments; files: [{name}] attached files.
function detectSignals({ subject = '', body = '', links = [], files = [] }) {
  const urls = [...links.map((l) => l.url).filter(Boolean), ...(String(body).match(URL_IN_TEXT) || [])];
  const hostList = hosts(urls);
  const ndaText = [subject, body, ...links.map((l) => l.name), ...files.map((f) => f.name)].filter(Boolean).join('\n');
  return {
    calendly: hostList.some((h) => CALENDLY_HOST.test(h)),
    ndaIca: NDA_ICA.test(ndaText),
    slack: hostList.some((h) => SLACK_HOST.test(h))
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
