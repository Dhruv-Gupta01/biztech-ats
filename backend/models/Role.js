const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    title: { type: String, required: true },
    department: { type: String, required: true },
    description: { type: String, default: '' },
    empType: { type: String, enum: ['Full-Time', 'Part-Time', 'Contract', 'Internship'], default: 'Full-Time' },
    openings: { type: Number, default: 1, min: 0 },
    status: { type: String, enum: ['Open', 'On-Hold', 'Closed'], default: 'Open' },
    
    interviewStages: { type: [String], default: ['Recruiter Screen', 'Technical', 'Hiring Manager'] }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Role', roleSchema);