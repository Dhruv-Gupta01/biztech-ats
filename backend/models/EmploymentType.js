const mongoose = require('mongoose');

const EmploymentTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    label: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    isPrefixBased: { type: Boolean, default: false },
    prefix: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
    description: { type: String, trim: true },
    isDefault: { type: Boolean, default: false }
  },
  { timestamps: true }
);

EmploymentTypeSchema.index({ name: 1, isActive: 1 });
EmploymentTypeSchema.index({ prefix: 1, isPrefixBased: 1 });

module.exports = mongoose.model('EmploymentType', EmploymentTypeSchema);