// Real outbound email via Resend API. Self-serve — works with a Resend API key,
// no partner approval needed. Sends ONE email per recipient, never CC'ing
// candidates together.
//
// Until real credentials are set, this safely no-ops and reports why —
// same pattern as linkedinService.js.

const { Resend } = require('resend');

// Constructed lazily (not at module load) so requiring this file never
// crashes the whole server just because RESEND_API_KEY isn't set yet — same
// no-op-until-configured pattern as every other integration here. The
// Resend SDK itself throws in its constructor if the key is missing, so
// building it eagerly at the top of the file took the entire app down with
// it on startup, before the EMAIL_ENABLED/RESEND_API_KEY checks below ever
// got a chance to run.
let cachedClient = null;
function getResendClient() {
  if (!cachedClient) cachedClient = new Resend(process.env.RESEND_API_KEY);
  return cachedClient;
}

function fillTemplate(str, vars) {
  return str.replace(/{{(.*?)}}/g, (_, key) => vars[key.trim()] || `{{${key.trim()}}}`);
}

function buildAttachmentLinks(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  const links = attachments
    .filter((a) => a && a.url)
    .map((a) => `- ${a.name || a.url}: ${a.url}`);
  if (links.length === 0) return '';
  return `\n\nAttachments:\n${links.join('\n')}`;
}

// Sends one personalized email per candidate. Returns a per-recipient result
// array so a partial failure (one bad address) doesn't hide as a full success.
async function sendOutreachEmails(recipients, rawSubject, rawBody, attachments = []) {
  if (process.env.EMAIL_ENABLED !== 'true') {
    return recipients.map((r) => ({
      email: r.email,
      sent: false,
      reason: 'Email sending disabled. Set EMAIL_ENABLED=true in .env with real Resend credentials to go live.'
    }));
  }
  if (!process.env.RESEND_API_KEY) {
    return recipients.map((r) => ({ email: r.email, sent: false, reason: 'Missing RESEND_API_KEY in .env.' }));
  }

  const results = [];
  const attachmentLinks = buildAttachmentLinks(attachments);

  for (const r of recipients) {
    const subject = fillTemplate(rawSubject, r.vars);
    let body = fillTemplate(rawBody, r.vars);
    if (attachmentLinks) {
      body += attachmentLinks;
    }
    try {
      await getResendClient().emails.send({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: r.email,
        subject,
        text: body
      });
      results.push({ email: r.email, sent: true });
    } catch (err) {
      results.push({ email: r.email, sent: false, reason: err.message });
    }
  }

  return results;
}

module.exports = { sendOutreachEmails };
