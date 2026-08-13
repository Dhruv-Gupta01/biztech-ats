const mongoose = require('mongoose');

// A single CSV row from a Naukri ETL run that failed validation (missing
// required field, bad email, unrecognized roleCode, etc.) or matched an
// existing candidate's email. Held here instead of being silently dropped so
// a recruiter can fix it in the Import Review tab and approve it into the
// candidate pool, or dismiss it. `rawData` is the untouched CSV row plus
// whatever edits the recruiter has made in the UI before approving.
const importReviewSchema = new mongoose.Schema(
  {
    sourceFile: { type: String, default: '' }, // Drive file name this row came from
    sourceRow: { type: Number, default: null }, // row number in the CSV (header + 1-indexed, matches a spreadsheet)
    rawData: { type: mongoose.Schema.Types.Mixed, default: {} },
    reasons: { type: [String], default: [] },
    status: { type: String, enum: ['pending', 'approved', 'dismissed'], default: 'pending' },
    resolvedCandidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', default: null },
    resolvedBy: { type: String, default: '' },
    resolvedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ImportReview', importReviewSchema);
