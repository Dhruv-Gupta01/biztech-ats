const mongoose = require('mongoose');

// One record per Naukri Drive-CSV ETL run (daily 9am cron, or a manual
// "Run Import Now"). Purely for observability — the Import Review tab shows
// the latest row so a recruiter can see when the job last ran and what it did
// without digging through server logs.
const etlRunSchema = new mongoose.Schema(
  {
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    status: { type: String, enum: ['running', 'success', 'failed', 'skipped'], default: 'running' },
    triggeredBy: { type: String, enum: ['cron', 'manual'], default: 'cron' },
    sourceFileName: { type: String, default: '' },
    sourceFileId: { type: String, default: '' },
    totalRows: { type: Number, default: 0 },
    insertedCount: { type: Number, default: 0 },
    flaggedCount: { type: Number, default: 0 },
    duplicateCount: { type: Number, default: 0 },
    message: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('EtlRun', etlRunSchema);
