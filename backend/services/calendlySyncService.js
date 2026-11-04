// Background Booked / Not Booked sync. Calendly only answers per invitee email, so a full pass over
// everyone whose link was sent would be thousands of API calls. Each run instead checks:
//   1. people emailed in the last RECENT_DAYS who haven't booked yet (the ones a recruiter is waiting on), and
//   2. the ROTATION_SIZE least-recently-checked people with a sent link, so cancellations and older
//      sheet-imported rows get picked up over a few hours.
// Never throws; stops early if Calendly starts refusing calls (rate limit / bad token).
const Candidate = require('../models/Candidate');
const { checkCalendlyStatus, calendlyConfigured } = require('./calendlyService');

const RECENT_DAYS = 14;
const ROTATION_SIZE = 100;
const CONCURRENCY = 5;
const MAX_CONSECUTIVE_FAILURES = 5;

let running = false;

async function syncCalendlyBookings() {
  if (!calendlyConfigured()) return { ran: false, reason: 'Calendly integration not configured.' };
  if (running) return { ran: false, reason: 'A sync is already running.' };
  running = true;
  const summary = { ran: true, checked: 0, updated: 0, failed: 0, stoppedEarly: false };
  try {
    const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
    const fields = 'email calendlyLinkStatus';
    const [recent, rotation] = await Promise.all([
      Candidate.find({ calendlyLinkSent: 'Sent', calendlyLinkStatus: { $ne: 'Booked' }, calendlyLinkSentAt: { $gte: since } }, fields).lean(),
      Candidate.find({ calendlyLinkSent: 'Sent' }, fields).sort({ calendlyCheckedAt: 1 }).limit(ROTATION_SIZE).lean()
    ]);
    const byId = new Map();
    [...recent, ...rotation].forEach((c) => byId.set(String(c._id), c));
    const queue = [...byId.values()];

    const checkedIds = [];
    let consecutiveFailures = 0;
    for (let i = 0; i < queue.length && !summary.stoppedEarly; i += CONCURRENCY) {
      await Promise.all(queue.slice(i, i + CONCURRENCY).map(async (c) => {
        const r = await checkCalendlyStatus(c.email);
        summary.checked += 1;
        if (!r.available) { summary.failed += 1; consecutiveFailures += 1; return; }
        consecutiveFailures = 0;
        checkedIds.push(c._id);
        if (r.status !== c.calendlyLinkStatus) {
          // updateOne so the cached candidate list is dropped when a status really changes.
          await Candidate.updateOne({ _id: c._id }, { $set: { calendlyLinkStatus: r.status, updatedAt: new Date() } });
          summary.updated += 1;
        }
      }));
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) summary.stoppedEarly = true;
    }

    // Bookkeeping only: bulkWrite skips the cache-invalidating hooks on purpose, otherwise every run would
    // empty the 15MB candidate-list cache even when nothing changed.
    if (checkedIds.length) {
      await Candidate.bulkWrite([{ updateMany: { filter: { _id: { $in: checkedIds } }, update: { $set: { calendlyCheckedAt: new Date() } } } }]);
    }
  } catch (err) {
    console.error('[CalendlySync] failed:', err);
    summary.error = err.message;
  } finally {
    running = false;
  }
  return summary;
}

module.exports = { syncCalendlyBookings };
