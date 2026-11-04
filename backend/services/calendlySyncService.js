// Background Booked / Not Booked sync. Calendly only answers per invitee email, so a full pass over
// everyone whose link was sent would be thousands of API calls, and Calendly answers HTTP 429 after
// roughly 50-60 quick calls. Each run therefore goes slowly and checks:
//   1. people emailed in the last RECENT_DAYS who haven't booked yet (the ones a recruiter is waiting on), first, then
//   2. the ROTATION_SIZE least-recently-checked people with a sent link, so cancellations and older
//      sheet-imported rows get picked up over a few hours.
// It only ever moves people towards Booked (or fills a blank); it never overwrites a stored Booked.
// Calls are paced; on a 429 the run waits (Retry-After, else a minute) and carries on. Never throws.
const Candidate = require('../models/Candidate');
const { checkCalendlyStatus, calendlyConfigured } = require('./calendlyService');

const RECENT_DAYS = 14;
const ROTATION_SIZE = 100;
const PACE_MS = 1300;              // ~45 calls a minute, under the throttle seen in production
const RATE_LIMIT_WAIT_MS = 60000;
const MAX_RATE_LIMIT_WAITS = 3;    // after this many waits in one run, give up until the next run
const MAX_CONSECUTIVE_FAILURES = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let running = false;

// options are for tests: { paceMs, rateLimitWaitMs }
async function syncCalendlyBookings({ paceMs = PACE_MS, rateLimitWaitMs = RATE_LIMIT_WAIT_MS } = {}) {
  if (!calendlyConfigured()) return { ran: false, reason: 'Calendly integration not configured.' };
  if (running) return { ran: false, reason: 'A sync is already running.' };
  running = true;
  const summary = { ran: true, checked: 0, updated: 0, skipped: 0, failed: 0, rateLimitWaits: 0, stoppedEarly: false };
  const checkedIds = [];
  try {
    const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
    const fields = 'email calendlyLinkStatus';
    const [recent, rotation] = await Promise.all([
      Candidate.find({ calendlyLinkSent: 'Sent', calendlyLinkStatus: { $ne: 'Booked' }, calendlyLinkSentAt: { $gte: since } }, fields).lean(),
      Candidate.find({ calendlyLinkSent: 'Sent' }, fields).sort({ calendlyCheckedAt: 1 }).limit(ROTATION_SIZE).lean()
    ]);
    const byId = new Map();
    [...recent, ...rotation].forEach((c) => byId.set(String(c._id), c)); // recent first, so they are checked first
    const queue = [...byId.values()];

    let consecutiveFailures = 0;
    for (let i = 0; i < queue.length; i += 1) {
      const c = queue[i];
      const r = await checkCalendlyStatus(c.email);
      if (r.rateLimited) {
        if (summary.rateLimitWaits >= MAX_RATE_LIMIT_WAITS) { summary.stoppedEarly = true; break; }
        summary.rateLimitWaits += 1;
        await sleep(Math.max(rateLimitWaitMs, (r.retryAfter || 0) * 1000));
        i -= 1; // retry the same person
        continue;
      }
      summary.checked += 1;
      if (r.available) {
        consecutiveFailures = 0;
        checkedIds.push(c._id);
        // Calendly finding nothing under this email is not proof they never booked (they may have booked with
        // another address, or before Calendly's records start), so a stored Booked is never downgraded here.
        if (c.calendlyLinkStatus === 'Booked' && r.status !== 'Booked') {
          summary.keptBooked = (summary.keptBooked || 0) + 1;
        } else if (r.status !== c.calendlyLinkStatus) {
          // updateOne so the cached candidate list is dropped when a status really changes.
          await Candidate.updateOne({ _id: c._id }, { $set: { calendlyLinkStatus: r.status, updatedAt: new Date() } });
          summary.updated += 1;
        }
      } else if (r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 403) {
        // Calendly rejected this one person's lookup (e.g. an address it won't accept). Stamp them so they
        // rotate to the back instead of blocking the front of the queue on every run.
        summary.skipped += 1;
        checkedIds.push(c._id);
      } else {
        summary.failed += 1;
        consecutiveFailures += 1;
        summary.lastError = r.reason;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) { summary.stoppedEarly = true; break; }
      }
      if (paceMs) await sleep(paceMs);
    }
  } catch (err) {
    console.error('[CalendlySync] failed:', err);
    summary.error = err.message;
  } finally {
    // Bookkeeping only: bulkWrite skips the cache-invalidating hooks on purpose, otherwise every run would
    // empty the 15MB candidate-list cache even when nothing changed. Runs even after an early stop so the
    // people already checked are not repeated.
    try {
      if (checkedIds.length) {
        await Candidate.bulkWrite([{ updateMany: { filter: { _id: { $in: checkedIds } }, update: { $set: { calendlyCheckedAt: new Date() } } } }]);
      }
    } catch (err) {
      console.error('[CalendlySync] could not record checked times:', err);
    }
    running = false;
  }
  lastRun = { at: new Date().toISOString(), ...summary };
  return summary;
}

let lastRun = null;
const getLastRun = () => lastRun;

module.exports = { syncCalendlyBookings, getLastRun };
