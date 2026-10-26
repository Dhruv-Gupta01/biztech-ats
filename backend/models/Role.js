const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    title: { type: String, required: true },
    department: { type: String, required: true },
    description: { type: String, default: '' },
    empType: { type: String, required: true, trim: true, default: 'Full-Time' },
    openings: { type: Number, default: 1, min: 0 },
    status: { type: String, enum: ['Open', 'On-Hold', 'Closed'], default: 'Open' },
    interviewStages: { type: [String], default: ['Recruiter Screen', 'Technical', 'Hiring Manager'] },
    skills: { type: [String], default: [] },
    minExperience: { type: Number, default: 0, min: 0 },
    notNegotiable: { type: String, default: '' }
  },
  { timestamps: true }
);

const registry = require('../utils/employmentRegistry');

RoleSchema.pre('save', function (next) {
  const empTypeDoc = registry.getByName(this.empType);
  // When the registry hasn't loaded yet, don't block saves (fresh install).
  if (!empTypeDoc) {
    if (registry.getEmploymentTypes().length) {
      return next(new Error(`Invalid employment type: ${this.empType}. It is not registered.`));
    }
    return next();
  }
  if (empTypeDoc.isPrefixBased && empTypeDoc.prefix) {
    if (!this.code || !this.code.toUpperCase().trim().startsWith(empTypeDoc.prefix)) {
      return next(new Error(`Role code "${this.code}" must start with prefix "${empTypeDoc.prefix}" for employment type "${this.empType}".`));
    }
  }
  next();
});

require('../utils/responseCache').invalidateOnWrite(RoleSchema);

module.exports = mongoose.model('Role', RoleSchema);