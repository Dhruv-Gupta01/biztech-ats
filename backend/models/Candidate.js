const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, index: true },
  phone: { type: String, required: true },
  location: { type: String },
  roleCode: { type: String, required: true, uppercase: true, trim: true },
  employmentType: {
    type: String,
    enum: ['Full-Time', 'Part-Time', 'Contract', 'Internship'],
    default: 'Full-Time'
  },
  yearsOfExperience: { type: Number, required: true, min: 0 },
  ctcCurrent: { type: Number, default: 0 },
  ctcExpected: { type: Number, default: 0 },
  noticePeriod: { type: String, default: '' }, // e.g. "30 days"
  skills: { type: [String], default: [] },
  resumeUrl: { type: String, default: '' }, // required for /apply uploads; blank for CSV-imported candidates
  status: {
    type: String,
    enum: ['Applied', 'Screened', 'Shortlisted', 'Interviewing', 'Rejected', 'Hired'],
    default: 'Applied'
  },
  generalRemarks: { type: String, default: '' },
  assessmentRemarks: { type: String, default: '' },
  source: { type: String, default: 'Website' },
  slackGroup: { type: String, default: '' },
  // Tracks completed interview stages in order (SRD 3.9). Current stage =
  // role.interviewStages[interviewProgress.length]. Internal only — never
  // shown to candidates, per the SRD's explicit note that scorecards/stages
  // are recruiter-only.
  interviewProgress: [
    {
      stageName: { type: String, required: true },
      interviewer: { type: String, default: '' },
      rating: { type: Number, min: 1, max: 5 },
      feedback: { type: String, default: '' },
      completedAt: { type: Date, default: Date.now }
    }
  ],
  // Independent assessment status — distinct from the pipeline `status` above.
  // Tracks how the candidate is doing in evaluation specifically (SRD 3.8).
  assessmentStatus: { type: String, enum: ['Not started', 'In progress', 'Selected', 'Not selected'], default: 'Not started' }, // Slack channel name the candidate was last routed to
  history: [
    {
      field: { type: String, required: true },
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      changedBy: { type: String, default: 'Recruiter' },
      changedAt: { type: Date, default: Date.now }
    }
  ], // Website, Referral, LinkedIn, Naukri, etc.

  // Scorecard (populated by POST /:id/score)
  score: {
    skillScore: { type: Number, min: 0, max: 10, default: null },
    experienceScore: { type: Number, min: 0, max: 10, default: null },
    suitabilityRating: { type: Number, min: 0, max: 10, default: null },
    scoredAt: { type: Date, default: null }
  },

  // Populated by the Google Form response sync (services/formSyncService.js):
  // outreach emails link to a Google Form pre-filled with the candidate's
  // email; a recruiter-triggered sync matches submissions in the form's
  // response Sheet back to this candidate by that email. `responses` is the
  // raw row (question title -> answer) so new form questions show up without
  // a schema change. Null until a matching submission has been synced.
  formSubmission: {
    submittedAt: { type: Date, default: null },
    matchedEmail: { type: String, default: '' },
    responses: { type: mongoose.Schema.Types.Mixed, default: null }
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Candidate', candidateSchema);