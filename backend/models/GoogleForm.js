const mongoose = require('mongoose');

const googleFormSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  formUrl: { type: String, required: true, trim: true },
  formEmailEntryId: { type: String, required: true, trim: true },
  responseSheetId: { type: String, required: true, trim: true },
  roleCode: { type: String, default: '' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('GoogleForm', googleFormSchema);
