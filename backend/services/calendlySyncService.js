// Background Booked / Not Booked sync.
//
// Step 1 (bookings): ask Calendly for the org's recent and upcoming scheduled events, read who booked each
// one, and match those emails to candidates. Whoever is found becomes Booked, and Calendly Link Sent = Sent
// if it wasn't already (a booking proves they got the link). This works for everyone, including people whose
// link was sent outside the ATS, and an event is only read once (cached by uuid + updated_at).
// Step 2 (lookups): Calendly only answers per invitee email, so a full pass over
// everyone whose link was sent would be thousands of API calls, and Calendly answers HTTP 429 after
// roughly 50-60 quick calls. Each run therefore goes slowly and checks:
//   1. people emailed in the last RECENT_DAYS who haven't booked yet (the ones a recruiter is waiting on), first, then
//   2. the ROTATION_SIZE least-recently-checked people with a sent link, so cancellations and older
//      sheet-imported rows get picked up over a few hours.
// It only ever moves people towards Booked (or fills a blank); it never overwrites a stored Booked.
// Calls are paced; on a 429 the run waits (Retry-After, else a minute) and carries on. Never throws.
const Candidate = require('../models/Candidate');
const { checkCalendlyStatus, calendlyConfigured, listRecentEvents, listEventInvitees, describeAccounts } = require('./calendlyService');

const RECENT_DAYS = 14;
const EVENT_LOOKBACK_DAYS = 14;    // events that started up to this long ago, plus everything upcoming
const ROTATION_SIZE = 100;
const PACE_MS = 1300;              // ~45 calls a minute, under the throttle seen in production
const RATE_LIMIT_WAIT_MS = 60000;
const MAX_RATE_LIMIT_WAITS = 3;    // after this many waits in one run, give up until the next run
const MAX_CONSECUTIVE_FAILURES = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let running = false;
// uuid -> updated_at of events whose invitees were already read, so repeat runs only fetch new/changed events.
const seenEvents = new Map();

// Retries one Calendly call when it answers 429, using the shared per-run wait budget.
async function withRateLimitWait(fn, summary, rateLimitWaitMs) {
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 429 && summary.rateLimitWaits < MAX_RATE_LIMIT_WAITS) {
        summary.rateLimitWaits += 1;
        await sleep(Math.max(rateLimitWaitMs, (err.retryAfter || 0) * 1000));
        continue;
      }
      throw err;
    }
  }
}

// Step 1. Returns nothing; counts go on `summary`. Never throws (a failure here must not block step 2).
async function syncFromBookings(summary, { paceMs, rateLimitWaitMs }) {
  try {
    const sinceIso = new Date(Date.now() - EVENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const events = await withRateLimitWait(() => listRecentEvents(sinceIso), summary, rateLimitWaitMs);
    summary.eventsSeen = events.length;
    if (events.accountErrors && events.accountErrors.length) summary.accountErrors = events.accountErrors;
    const hosts = new Set();
    const emails = new Set();
    const bookings = new Map(); // email -> { account, bookedAt }
    let accountNames = [];
    try { accountNames = (await describeAccounts()).map((a) => a.name || null); } catch (err) { /* account names are optional */ }
    for (const ev of events) {
      (ev.event_memberships || []).forEach((m) => m && m.user && hosts.add(m.user));
      const uuid = String(ev.uri || '').split('/').pop();
      if (!uuid) continue;
      if (seenEvents.get(uuid) === ev.updated_at) continue; // already read this version of the event
      const invitees = await withRateLimitWait(() => listEventInvitees(uuid, ev._account), summary, rateLimitWaitMs);
      invitees.forEach((i) => {
        if (!i || !i.email) return;
        const email = String(i.email).toLowerCase().trim();
        emails.add(email);
        // Remember which account the booking is on and when it was made (earliest booking wins).
        const at = i.created_at ? new Date(i.created_at) : null;
        const prev = bookings.get(email);
        if (!prev || (at && prev.bookedAt && at < prev.bookedAt)) bookings.set(email, { account: accountNames[ev._account] || null, bookedAt: at });
      });
      seenEvents.set(uuid, ev.updated_at);
      summary.eventsRead = (summary.eventsRead || 0) + 1;
      if (paceMs) await sleep(paceMs);
    }
    summary.hostsSeen = hosts.size;
    summary.inviteesRead = emails.size;
    if (emails.size === 0) return;

    const found = await Candidate.find({ email: { $in: [...emails] } }, 'email calendlyLinkStatus calendlyLinkSent calendlyAccount').lean();
    const matched = new Set(found.map((c) => c.email));
    summary.bookingsUnmatched = [...emails].filter((e) => !matched.has(e)).length; // count only: emails stay out of the status endpoint
    summary.bookingsMatched = matched.size;
    for (const c of found) {
      const set = {};
      if (c.calendlyLinkStatus !== 'Booked') set.calendlyLinkStatus = 'Booked';
      if (c.calendlyLinkSent !== 'Sent') { set.calendlyLinkSent = 'Sent'; set.calendlyLinkSentAt = new Date(); }
      const statusChanged = Object.keys(set).length > 0;
      const info = bookings.get(c.email) || {};
      if (info.account && c.calendlyAccount !== info.account) set.calendlyAccount = info.account;
      // $min keeps the earliest booking date, and fills it in for people who were already Booked before dates were tracked.
      const update = {};
      if (Object.keys(set).length > 0) update.$set = { ...set, updatedAt: new Date() };
      if (info.bookedAt) update.$min = { 'stageDates.booked': info.bookedAt };
      if (!update.$set && !update.$min) continue;
      await Candidate.updateOne({ _id: c._id }, update);
      if (statusChanged) summary.bookedFromEvents = (summary.bookedFromEvents || 0) + 1;
    }
  } catch (err) {
    summary.bookingsError = err.message;
  }
}

// options are for tests: { paceMs, rateLimitWaitMs }
async function syncCalendlyBookings({ paceMs = PACE_MS, rateLimitWaitMs = RATE_LIMIT_WAIT_MS } = {}) {
  if (!calendlyConfigured()) return { ran: false, reason: 'Calendly integration not configured.' };
  if (running) return { ran: false, reason: 'A sync is already running.' };
  running = true;
  const summary = { ran: true, checked: 0, updated: 0, skipped: 0, failed: 0, rateLimitWaits: 0, stoppedEarly: false };
  const checkedIds = [];
  try {
    await syncFromBookings(summary, { paceMs, rateLimitWaitMs });
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
          const upd = { $set: { calendlyLinkStatus: r.status, updatedAt: new Date() } };
          if (r.status === 'Booked') upd.$min = { 'stageDates.booked': new Date() };
          await Candidate.updateOne({ _id: c._id }, upd);
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
