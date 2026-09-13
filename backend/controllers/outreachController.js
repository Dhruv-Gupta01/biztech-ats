const Candidate = require('../models/Candidate');
const Role = require('../models/Role');
const GoogleForm = require('../models/GoogleForm');
const { sendOutreachEmails } = require('../services/emailService');

async function buildFormLink(email, roleCode) {
  let form = null;
  if (roleCode) {
    form = await GoogleForm.findOne({ isActive: true, roleCode });
  }
  if (!form) {
    form = await GoogleForm.findOne({ isActive: true });
  }
  if (!form) {
    const baseUrl = process.env.GOOGLE_FORM_URL;
    const entryId = process.env.GOOGLE_FORM_EMAIL_ENTRY_ID;
    if (!baseUrl || !entryId) return '';
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}entry.${entryId}=${encodeURIComponent(email)}`;
  }

  const separator = form.formUrl.includes('?') ? '&' : '?';
  return `${form.formUrl}${separator}entry.${form.formEmailEntryId}=${encodeURIComponent(email)}`;
}

exports.sendOutreach = async (req, res) => {
  try {
    const { candidateIds, subject, body, attachments, formId } = req.body;
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

    const recipients = [];
    for (const c of candidates) {
      recipients.push({
        email: c.email,
        vars: {
          candidateName: c.fullName,
          roleTitle: roleTitle(c.roleCode),
          roleCode: c.roleCode,
          formLink: await buildFormLink(c.email, c.roleCode)
        }
      });
    }

    const results = await sendOutreachEmails(recipients, subject, body, Array.isArray(attachments) ? attachments : []);
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