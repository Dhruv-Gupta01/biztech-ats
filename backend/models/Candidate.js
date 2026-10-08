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
  designation: { type: String, default: '' },
  company: { type: String, default: '' },
  education: { type: String, default: '' },
  resumeUrl: { type: String, default: '' },
  resumeData: { type: Buffer, default: null },
  resumeText: { type: String, default: '' },
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
      'Rejected'
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

module.exports = mongoose.model('Candidate', candidateSchema);