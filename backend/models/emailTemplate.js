const mongoose = require('mongoose');

// A template attachment is one of two shapes, told apart by `type`:
//
//   { type: 'link', name, url }
//     A plain URL (Google Drive, careers page, JD page). Rendered as a
//     clickable link inside the email body.
//
//   { type: 'file', attachmentId, name, size }
//     A file a recruiter uploaded from their device. Stored once in the
//     OutreachAttachment collection and referenced by id, so templates stay
//     small and a file can be re-used or swapped without editing every
//     template that references it.
const EmailTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  attachments: [{
    type: { type: String, enum: ['link', 'file'], default: 'link' },
    // link
    name: { type: String, default: '' },
    url: { type: String, default: '' },
    // file
    attachmentId: { type: String, default: '' },
    size: { type: Number, default: 0 }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('EmailTemplate', EmailTemplateSchema);
