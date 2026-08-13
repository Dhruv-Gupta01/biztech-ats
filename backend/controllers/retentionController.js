const { runRetentionCleanup, getRetentionDays, getRetentionMode } = require('../services/retentionService');

// GET /api/retention/status
// Reports the current policy configuration without running anything —
// used by the frontend to show "Retention: 180 days, anonymize, disabled".
exports.getStatus = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      enabled: process.env.RETENTION_ENABLED === 'true',
      retentionDays: getRetentionDays(),
      mode: getRetentionMode()
    }
  });
};

// POST /api/retention/run
// Manually triggers the same cleanup the daily cron job runs — useful for
// testing without waiting a day, or for an admin to run on demand.
exports.runNow = async (req, res) => {
  try {
    const result = await runRetentionCleanup();
    return res.status(200).json({
      success: true,
      message: result.ran
        ? `Retention cleanup complete: ${result.processedCount} candidate(s) ${result.mode}d.`
        : `Retention cleanup skipped: ${result.reason}`,
      data: result
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while running retention cleanup.' });
  }
};