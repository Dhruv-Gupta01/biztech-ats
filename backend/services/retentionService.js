// Data retention for rejected candidates (SRD §4 non-functional requirement).
// SRD explicitly says: "specify the actual period (recommend 6-12 months,
// confirm with BTA leadership)" and "what happens on expiry (auto-delete vs
// anonymize)". Both are configurable via .env so BTA leadership's decision
// doesn't require a code change — and RETENTION_ENABLED defaults to false
// until that decision is actually confirmed, per the SRD's own caution.

const Candidate = require('../models/Candidate');

const RETENTION_ELIGIBLE_STATUSES = ['Rejected'];

function getRetentionDays() {
  return Number(process.env.RETENTION_DAYS) || 180; // ~6 months default, per SRD's low end of the recommended range
}

function getRetentionMode() {
  return process.env.RETENTION_MODE === 'delete' ? 'delete' : 'anonymize'; // anonymize is the safer default
}

async function findExpiredCandidates() {
  const days = getRetentionDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return Candidate.find({
    status: { $in: RETENTION_ELIGIBLE_STATUSES },
    updatedAt: { $lte: cutoff }
  });
}

// Anonymize: keep the record (and its pipeline/status history for reporting)
// but strip personal data — name, email, phone, resume link, CTC, remarks.
async function anonymizeCandidate(candidate) {
  candidate.fullName = 'Anonymized Candidate';
  candidate.email = `anonymized-${candidate._id}@example.invalid`;
  candidate.phone = '';
  candidate.location = '';
  candidate.resumeUrl = '';
  candidate.ctcCurrent = 0;
  candidate.ctcExpected = 0;
  candidate.generalRemarks = '';
  candidate.assessmentRemarks = '';
  candidate.skills = [];
  candidate.history.push({ field: 'retention', oldValue: 'active', newValue: 'anonymized', changedBy: 'Retention Policy', changedAt: new Date() });
  await candidate.save();
}

// Runs the configured retention action against every eligible expired candidate.
// Returns a summary so both the cron job and the manual "Run Cleanup Now"
// endpoint can report the same thing.
async function runRetentionCleanup() {
  if (process.env.RETENTION_ENABLED !== 'true') {
    return { ran: false, reason: 'Retention policy disabled. Set RETENTION_ENABLED=true in .env once the retention period is confirmed with BTA leadership.', processedCount: 0, mode: getRetentionMode(), retentionDays: getRetentionDays() };
  }

  const expired = await findExpiredCandidates();
  const mode = getRetentionMode();

  for (const candidate of expired) {
    if (mode === 'delete') {
      await Candidate.findByIdAndDelete(candidate._id);
    } else {
      await anonymizeCandidate(candidate);
    }
  }

  return { ran: true, processedCount: expired.length, mode, retentionDays: getRetentionDays() };
}

module.exports = { runRetentionCleanup, getRetentionDays, getRetentionMode };