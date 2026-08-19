// Real outbound email via SMTP (Nodemailer). Self-serve — works with a Gmail
// app password, a free Ethereal test account, or any SMTP provider, no partner
// approval needed (unlike LinkedIn's Talent Solutions API). Sends ONE email
// per recipient, never CC'ing candidates together.
//
// Until real SMTP credentials are set, this safely no-ops and reports why —
// same pattern as linkedinService.js.

const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return cachedTransporter;
}

function fillTemplate(str, vars) {
  return str.replace(/{{(.*?)}}/g, (_, key) => vars[key.trim()] ?? `{{${key.trim()}}}`);
}

// Sends one personalized email per candidate. Returns a per-recipient result
// array so a partial failure (one bad address) doesn't hide as a full success.
async function sendOutreachEmails(recipients, rawSubject, rawBody) {
  if (process.env.EMAIL_ENABLED !== 'true') {
    return recipients.map((r) => ({
      email: r.email,
      sent: false,
      reason: 'Email sending disabled. Set EMAIL_ENABLED=true in .env with real SMTP credentials to go live.'
    }));
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return recipients.map((r) => ({ email: r.email, sent: false, reason: 'Missing SMTP_HOST, SMTP_USER, or SMTP_PASS in .env.' }));
  }

  const transporter = getTransporter();
  const results = [];

  for (const r of recipients) {
    const subject = fillTemplate(rawSubject, r.vars);
    let body = fillTemplate(rawBody, r.vars);
    // If a Form link was computed but the template body doesn't reference
    // {{formLink}}, still append it so it's never silently dropped from the email.
    if (r.vars.formLink && !rawBody.includes('{{formLink}}')) {
      body += `\n\nGoogle Form link: ${r.vars.formLink}`;
    }
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
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