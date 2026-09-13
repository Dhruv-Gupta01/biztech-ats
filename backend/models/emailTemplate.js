const mongoose = require('mongoose');

const EmailTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  attachments: [{
    name: { type: String, default: '' },
    url: { type: String, required: true, trim: true }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('EmailTemplate', EmailTemplateSchema);