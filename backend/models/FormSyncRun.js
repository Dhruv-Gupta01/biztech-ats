const mongoose = require('mongoose');

// One record per "Sync Form Responses" run (services/formSyncService.js).
// Manually triggered only (no cron) — this is purely for the status readout
// on the Candidate Pool toolbar, same idea as EtlRun for the Naukri import.
const formSyncRunSchema = new mongoose.Schema(
  {
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    status: { type: String, enum: ['running', 'success', 'failed'], default: 'running' },
    totalRows: { type: Number, default: 0 },
    matchedCount: { type: Number, default: 0 },
    unmatchedCount: { type: Number, default: 0 },
    message: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('FormSyncRun', formSyncRunSchema);
