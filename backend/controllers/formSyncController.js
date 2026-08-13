const Candidate = require('../models/Candidate');
const FormSyncRun = require('../models/FormSyncRun');
const { syncFormResponses, isConfigured, configurationReason } = require('../services/formSyncService');

// GET /api/form-sync/status
exports.getStatus = async (req, res) => {
  try {
    const [lastRun, submittedCount] = await Promise.all([
      FormSyncRun.findOne().sort({ createdAt: -1 }),
      Candidate.countDocuments({ 'formSubmission.submittedAt': { $ne: null } })
    ]);
    return res.status(200).json({
      success: true,
      data: {
        enabled: process.env.FORM_SYNC_ENABLED === 'true',
        configured: isConfigured(),
        configReason: isConfigured() ? null : configurationReason(),
        lastRun,
        submittedCount
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching form sync status.' });
  }
};

// POST /api/form-sync/run
// Manually triggers a sync pass against the Google Form's response Sheet.
exports.runNow = async (req, res) => {
  try {
    const result = await syncFormResponses();
    return res.status(200).json({ success: true, message: result.message || result.reason || 'Sync complete.', data: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while syncing form responses.' });
  }
};
