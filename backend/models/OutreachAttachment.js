const mongoose = require('mongoose');

// Files uploaded from a recruiter's device for outreach emails.
//
// The bytes live here (rather than on disk) because Render's filesystem is
// ephemeral — anything written to /tmp or ./uploads vanishes on redeploy or
// restart, which would silently break previously saved templates. MongoDB is
// already the durable store for everything else, so attachments live there too.
//
// Documents are referenced by id from an email template's `attachments` array
// (`{ type: 'file', attachmentId }`) or passed ad-hoc at send time.
const outreachAttachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contentType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    data: { type: Buffer, required: true },
    uploadedBy: { type: String, default: 'Recruiter' }
  },
  { timestamps: true }
);

// Email providers cap total message size (Resend ~40MB), so a single attachment
// must never get close to that on its own.
outreachAttachmentSchema.statics.MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
outreachAttachmentSchema.statics.MAX_TOTAL_SIZE = 30 * 1024 * 1024; // 30MB across one email
outreachAttachmentSchema.statics.MAX_FILES = 10;

module.exports = mongoose.model('OutreachAttachment', outreachAttachmentSchema);
