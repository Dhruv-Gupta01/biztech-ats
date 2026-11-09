const express = require('express');
const router = express.Router();
const { syncCalendlyBookings, getLastRun } = require('../services/calendlySyncService');
const { calendlyConfigured, describeAccounts } = require('../services/calendlyService');

// Connected accounts only change when the server's settings do, so look them up at most every 10 minutes.
let accountsCache = { at: 0, value: [] };

// GET /api/calendly/sync-status — which Calendly accounts are connected (name + booking page, no secrets) and what
// the last background sync did (not persisted: resets on restart).
router.get('/sync-status', async (req, res) => {
  const configured = calendlyConfigured();
  if (configured && Date.now() - accountsCache.at > 10 * 60 * 1000) {
    accountsCache = { at: Date.now(), value: await describeAccounts().catch(() => []) };
  }
  res.status(200).json({ success: true, configured, accounts: configured ? accountsCache.value : [], lastRun: getLastRun() });
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
