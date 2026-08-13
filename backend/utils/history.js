// Builds audit-trail entries for whichever tracked fields actually changed.
// Used by any endpoint that mutates a candidate record, so every change —
// status, remarks, role reassignment, Slack routing — leaves a visible trace
// instead of only updating the single `updatedAt` timestamp.

const TRACKED_FIELDS = ['status', 'roleCode', 'generalRemarks', 'assessmentRemarks', 'slackGroup', 'assessmentStatus'];
function buildHistoryEntries(candidate, changes, changedBy) {
  const entries = [];
  for (const field of Object.keys(changes)) {
    if (!TRACKED_FIELDS.includes(field)) continue;
    const oldValue = candidate[field];
    const newValue = changes[field];
    if (oldValue === newValue) continue; // no actual change, don't log noise
    entries.push({
      field,
      oldValue: oldValue ?? '',
      newValue: newValue ?? '',
      changedBy: changedBy || 'Recruiter',
      changedAt: new Date()
    });
  }
  return entries;
}

module.exports = { buildHistoryEntries, TRACKED_FIELDS };