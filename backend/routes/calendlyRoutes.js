const express = require('express');
const router = express.Router();
const { syncCalendlyBookings, getLastRun } = require('../services/calendlySyncService');
const { calendlyConfigured } = require('../services/calendlyService');

// GET /api/calendly/sync-status — what the last background sync did (not persisted: resets on restart).
router.get('/sync-status', (req, res) => {
  res.status(200).json({ success: true, configured: calendlyConfigured(), lastRun: getLastRun() });
});

// POST /api/calendly/sync — start a sync now instead of waiting for the 10-minute tick. Returns at once;
// poll /sync-status for the result. A run already in progress is left alone.
router.post('/sync', (req, res) => {
  if (!calendlyConfigured()) {
    return res.status(200).json({ success: true, started: false, message: 'Calendly integration not configured.' });
  }
  syncCalendlyBookings().catch((err) => console.error('[CalendlySync] manual run failed:', err));
  return res.status(202).json({ success: true, started: true, message: 'Calendly sync started.' });
});

module.exports = router;
