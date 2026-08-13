const Candidate = require('../models/Candidate');
const Role = require('../models/Role');
const { sendOutreachEmails } = require('../services/emailService');

// Builds a Google Form link with the candidate's email pre-filled into the
// form's Email question, using Google Forms' own prefill URL parameter
// (?entry.<id>=<value>). That's how formSyncService later matches a
// submission back to this exact candidate. Returns '' if the form isn't
// configured yet (GOOGLE_FORM_URL / GOOGLE_FORM_EMAIL_ENTRY_ID), so
// {{formLink}} just renders blank in the email rather than broken.
function buildFormLink(email) {
  const baseUrl = process.env.GOOGLE_FORM_URL;
  const entryId = process.env.GOOGLE_FORM_EMAIL_ENTRY_ID;
  if (!baseUrl || !entryId) return '';
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}entry.${entryId}=${encodeURIComponent(email)}`;
}

// POST /api/outreach/send
// Body: { candidateIds: [...], subject: "raw template with {{mergeFields}}", body: "raw template" }
// Looks up each candidate + their role title, merges the template per-recipient,
// and sends one individual email each via emailService. Never a single message
// with everyone visible to each other.
exports.sendOutreach = async (req, res) => {
  try {
    const { candidateIds, subject, body } = req.body;
    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      return res.status(400).json({ success: false, message: 'candidateIds must be a non-empty array.' });
    }
    if (!subject || !body) {
      return res.status(400).json({ success: false, message: 'subject and body templates are required.' });
    }

    const [candidates, roles] = await Promise.all([
      Candidate.find({ _id: { $in: candidateIds } }),
      Role.find()
    ]);
    if (candidates.length === 0) {
      return res.status(404).json({ success: false, message: 'No matching candidates found.' });
    }

    const roleTitle = (code) => {
      const r = roles.find((r) => r.code === code);
      return r ? r.title : code;
    };

    const recipients = candidates.map((c) => ({
      email: c.email,
      vars: { candidateName: c.fullName, roleTitle: roleTitle(c.roleCode), roleCode: c.roleCode, formLink: buildFormLink(c.email) }
    }));

    const results = await sendOutreachEmails(recipients, subject, body);
    const sentCount = results.filter((r) => r.sent).length;
    const failedCount = results.length - sentCount;

    return res.status(200).json({
      success: true,
      message: failedCount === 0
        ? `Sent to all ${sentCount} recipient(s).`
        : `Sent to ${sentCount} recipient(s), ${failedCount} failed.`,
      data: { sentCount, failedCount, results }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while sending outreach.' });
  }
};