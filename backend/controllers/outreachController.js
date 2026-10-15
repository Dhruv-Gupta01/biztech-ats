const Candidate = require('../models/Candidate');
const Role = require('../models/Role');
const GoogleForm = require('../models/GoogleForm');
const OutreachAttachment = require('../models/OutreachAttachment');
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

// POST /api/outreach/attachments  (multipart, field name "files")
// Uploads files from the recruiter's device and stores them durably in MongoDB.
// Returns metadata only — never the bytes — so the UI can show what's attached
// without pulling megabytes back over the wire.
exports.uploadAttachments = async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files received. Attach at least one file.' });
    }
    if (files.length > OutreachAttachment.MAX_FILES) {
      return res.status(400).json({ success: false, message: `You can attach at most ${OutreachAttachment.MAX_FILES} files per email.` });
    }

    const tooBig = files.filter((f) => f.size > OutreachAttachment.MAX_FILE_SIZE);
    if (tooBig.length > 0) {
      const mb = (OutreachAttachment.MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
      return res.status(400).json({
        success: false,
        message: `These files exceed the ${mb}MB per-file limit: ${tooBig.map((f) => f.originalname).join(', ')}`
      });
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > OutreachAttachment.MAX_TOTAL_SIZE) {
      const mb = (OutreachAttachment.MAX_TOTAL_SIZE / (1024 * 1024)).toFixed(0);
      return res.status(400).json({ success: false, message: `Total attachment size exceeds the ${mb}MB limit for one email.` });
    }

    const docs = await OutreachAttachment.insertMany(
      files.map((f) => ({
        name: f.originalname,
        contentType: f.mimetype,
        size: f.size,
        data: f.buffer,
        uploadedBy: 'Recruiter'
      }))
    );

    return res.status(201).json({
      success: true,
      message: `Uploaded ${docs.length} file(s).`,
      data: docs.map((d) => ({ _id: d._id, name: d.name, contentType: d.contentType, size: d.size }))
    });
  } catch (err) {
    if (err.message === 'UNSAFE_FILE_TYPE') {
      return res.status(400).json({ success: false, message: 'Executable files cannot be attached for security reasons.' });
    }
    console.error('Attachment upload failed:', err);
    return res.status(500).json({ success: false, message: 'Server error while uploading attachments.' });
  }
};

// DELETE /api/outreach/attachments/:id
// Removes a stored file. Best-effort — failing to delete never blocks anything.
exports.deleteAttachment = async (req, res) => {
  try {
    const attachment = await OutreachAttachment.findByIdAndDelete(req.params.id);
    if (!attachment) return res.status(404).json({ success: false, message: 'Attachment not found.' });
    return res.status(200).json({ success: true, message: `${attachment.name} removed.` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while deleting attachment.' });
  }
};

// GET /api/outreach/attachments
// Lists recently uploaded files so a template can re-use one without re-picking
// it from disk. Metadata only — no bytes.
exports.listAttachments = async (req, res) => {
  try {
    const attachments = await OutreachAttachment.find()
      .select('name contentType size createdAt uploadedBy')
      .sort({ createdAt: -1 })
      .limit(100);
    return res.status(200).json({ success: true, count: attachments.length, data: attachments });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while listing attachments.' });
  }
};

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

    // `attachments` is a mixed list of two shapes:
    //   { type: 'link', name, url }  — rendered as a text link in the body
    //   { type: 'file', attachmentId } — resolved below into a real file part
    // `attachmentIds` is the shortcut the UI sends when a single list of files
    // applies to the whole send (ad-hoc uploads or a template's saved files).
    const rawAttachments = Array.isArray(attachments) ? attachments : [];
    const linkAttachments = rawAttachments.filter((a) => a && a.type === 'link' && a.url);
    const fileRefs = rawAttachments.filter((a) => a && a.type === 'file' && a.attachmentId);
    const idList = Array.isArray(req.body.attachmentIds) ? req.body.attachmentIds : [];
    const wantedIds = [...new Set([...fileRefs.map((a) => String(a.attachmentId)), ...idList.map(String)])];

    let files = [];
    if (wantedIds.length > 0) {
      const stored = await OutreachAttachment.find({ _id: { $in: wantedIds } });
      files = stored.map((f) => ({
        _id: f._id,
        name: f.name,
        contentType: f.contentType,
        size: f.size,
        content: f.data
      }));
      // A missing id means the file was deleted or the doc never existed —
      // surface it rather than silently sending an email without the document.
      const missing = wantedIds.filter((id) => !stored.some((f) => String(f._id) === id));
      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          message: `${missing.length} attached file(s) could not be found. Please re-upload them.`
        });
      }
    }

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

    const results = await sendOutreachEmails(recipients, subject, body, linkAttachments, files);
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