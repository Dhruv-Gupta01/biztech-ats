const mongoose = require('mongoose');

const slackMappingSchema = new mongoose.Schema(
  {
    roleCode: { type: String, required: true, uppercase: true, trim: true },
    channel: { type: String, required: true, trim: true },
    webhook: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SlackMapping', slackMappingSchema);