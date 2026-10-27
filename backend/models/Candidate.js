const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, index: true },
  phone: { type: String, required: true },
  location: { type: String },
  roleCode: { type: String, required: true, uppercase: true, trim: true },
  employmentType: {
    type: String,
    required: true,
    trim: true,
    default: 'Full-Time'
  },
  yearsOfExperience: { type: Number, required: true, min: 0 },
  ctcCurrent: { type: Number, default: 0 },
  ctcExpected: { type: Number, default: 0 },
  noticePeriod: { type: String, default: '' }, // e.g. "30 days"
  skills: { type: [String], default: [] },
  designation: { type: String, default: '' },
  company: { type: String, default: '' },
  education: { type: String, default: '' },
  resumeUrl: { type: String, default: '' },
  resumeData: { type: Buffer, default: null },
  resumeText: { type: String, default: '' },
  
  // FREELANCE CODING specific fields.
  // No `default` here on purpose: an empty string is not a valid enum value, so
  // defaulting to '' made every save of an existing document fail validation.
  // Unset means "not yet chosen" — Mongoose skips enum validation for
  // undefined/null on these optional paths, and the UI stores null for "—".
  screeningInterview: { type: String, enum: ['Pass', 'Fail', 'Not Appeared', 'Rescheduled', 'Not interested', 'Referred to another position', 'Invited – not booked', 'Booked – no result yet', 'Appeared – result not recorded'], default: null },
  calendlyLinkSent: { type: String, enum: ['Sent', 'Not Sent'], default: null },
  calendlyLinkStatus: { type: String, enum: ['Booked', 'Not Booked'], default: null },
  ndaIca: { type: String, enum: ['Sent', 'Not Sent', 'Signed', 'Not Signed', 'Doubt', 'Not Interested'], default: null },
  slackStatus: { type: String, enum: ['Joined', 'Not Joined', 'Not Interested'], default: null },
  bootcampAttempts: { type: String, enum: ['Attempt 1', 'Attempt 2', 'Attempt 3'], default: null },
  bootcampStatus: { type: String, enum: ['Pass', 'Fail', 'Full Fail', 'Not Active', 'Active', 'Direct to client'], default: null },
  onboarding: { type: String, enum: ['Sent', 'Not Sent', 'Not Interested', 'Done'], default: null },
  project: { type: String, default: null },
  projectStatus: { type: String, enum: ['On Hold', 'Complete', 'Not Active', 'In Pipeline', 'Banned / Disqualified'], default: null },

  // MEDICAL HIRING specific fields.
  resumeAnalyzerStatus: { type: String, enum: ['Selected', 'Not selected'], default: null },
  medicalAssessments: { type: String, enum: ['Sent', 'Not Sent'], default: null },
  medicalAssessmentsSubmission: { type: String, enum: ['Received', 'Not received', 'Not interested'], default: null },
  medicalAssessmentsSubmissionNote: { type: String, default: '' },
  medicalSubmissionsEvaluation: { type: String, enum: ['Pass', 'Fail', 'Pending'], default: null },
  medicalOnboarding: { type: String, enum: ['Sent', 'Not sent', 'Done', 'Not done', 'Not interested'], default: null },
  medicalSlack: { type: String, enum: ['Joined', 'Not joined', 'Not interested'], default: null },

  status: {
    type: String,
    enum: [
      'Naukri Response',
      'Information Form Response',
      'Interview 1',
      'Interview 1 Shortlisted',
      'Interview 2',
      'Interview 2 Shortlisted',
      'Assessment 1',
      'Assessment 1 Shortlisted',
      'Assessment 1 Passed',
      'Assessment 2',
      'Assessment 2 Shortlisted',
      'Assessment 2 Passed',
      'Final Round Shortlisted',
      'Selected',
      'Rejected',
      'Not Appeared',
      'Rescheduled',
      'Refered for other position',
      'Not interested'
    ],
    default: 'Information Form Response'
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
    assessmentStatus: { type: String, enum: ['Not Set', 'Selected', 'Rejected', 'Not Appeared', 'Rescheduled', 'Not interested', 'Refered for other position'], default: 'Not Set' },
    cvScreening: { type: String, enum: ['Not Set', 'Selected', 'Rejected', 'Refered for other position'], default: 'Not Set' },
   interviewRounds: { type: mongoose.Schema.Types.Mixed, default: {} },
   joiningDateTentative: { type: Date, default: null },
   joiningDateConfirm: { type: Date, default: null },
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
  // response Sheet back to this candidate by that email. `formSubmissions`
  // is an array so multiple forms can be synced per candidate. Null until
  // a matching submission has been synced.
  formSubmissions: [
    {
      formId: { type: String, default: '' },
      formName: { type: String, default: '' },
      submittedAt: { type: Date, default: null },
      matchedEmail: { type: String, default: '' },
      responses: { type: mongoose.Schema.Types.Mixed, default: null }
    }
  ],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for the list/filter/sort paths (GET /candidates sorts by createdAt, the
// dashboard/statistics sort by updatedAt, and the pool filters on these fields).
candidateSchema.index({ createdAt: -1 });
candidateSchema.index({ updatedAt: -1 });
candidateSchema.index({ roleCode: 1, createdAt: -1 });
candidateSchema.index({ employmentType: 1 });
candidateSchema.index({ status: 1 });
candidateSchema.index({ source: 1 });

// Role codes starting with "F" / "M" (etc.) are always tied to the prefix-based
// employment type registered for that prefix. This keeps employmentType in sync
// whether the candidate arrives via resume upload, CSV import, the apply form, or
// a manual recruiter edit. The set of prefixes is now read from the dynamic
// EmploymentType registry instead of a hardcoded constant.
const registry = require('../utils/employmentRegistry');

candidateSchema.pre('save', function applyRoleCodePrefix(next) {
  if (this.roleCode) {
    const resolved = registry.resolveByPrefix(this.roleCode);
    if (resolved) {
      this.employmentType = resolved;
    }
  }
  next();
});

// Same rule for updateCandidate's direct .save() path and any findOneAndUpdate
// usage elsewhere in the app.
function enforcePrefixForRoleCode(doc) {
  if (doc && doc.roleCode) {
    const resolved = registry.resolveByPrefix(doc.roleCode);
    if (resolved) {
      doc.employmentType = resolved;
    }
  }
}
candidateSchema.post('init', enforcePrefixForRoleCode);

require('../utils/responseCache').invalidateOnWrite(candidateSchema);

module.exports = mongoose.model('Candidate', candidateSchema);