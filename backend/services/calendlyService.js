// Calendly integration for the FREELANCE CODING pipeline.
//
// Goal: when a recruiter views a candidate's "Calendly Link Status" we want to
// know whether they actually booked a slot. Calendly's public REST API (v2)
// answers this: we query scheduled events filtered by `invitee_email` — the
// person who booked. Any non-cancelled event → "Booked", else "Not Booked".
//
// Do NOT match on `event_memberships[].user_email`: that is the HOST's email
// (the Calendly account owning the event), not the candidate's.
//
// This is intentionally OPT-IN. It needs a personal access token from Calendly
// (https://calendly.com/integrations/api_webhooks). When it isn't configured the
// service reports `available: false` and the UI keeps using the
// recruiter-selected dropdown value — never blocking.
//
// Matching by USER vs ORGANIZATION:
//   - scheduling events are filtered server-side by the host. Passing `user`
//     only returns events hosted by that one Calendly user.
//   - passing `organization` returns events hosted by ANY member of the org, so
//     a candidate who booked with a different interviewer still resolves.
//   We therefore prefer CALENDLY_ORGANIZATION when set, otherwise derive it from
//   /users/me (which reports the caller's current_organization).
//
// SEVERAL CALENDLY ACCOUNTS: a personal access token can only read its own account's bookings, and
// separate (e.g. free) accounts are separate organisations. When recruiters use booking links from more
// than one account, put one token per account in CALENDLY_API_TOKENS (comma-separated); CALENDLY_API_TOKEN
// still works and is added to the list. A candidate counts as Booked if ANY account has their booking.
//
// CALENDLY_USER_URI and CALENDLY_ORGANIZATION are both OPTIONAL — if they are
// blank we discover them from GET /users/me on the first call. To see the
// actual values for your account, run:  npm run calendly:whoami

const CALENDLY_API_URL = process.env.CALENDLY_API_URL || 'https://api.calendly.com';
const EVENT_STATUSES = ['active', 'scheduled']; // cancelled/attended-in-the-past don't count as booked
const MAX_PAGES = 5; // 100 events per page; enough for most recruiters' pipelines

// One token per Calendly account, in the order given (CALENDLY_API_TOKENS first, then CALENDLY_API_TOKEN).
function getTokens() {
  const raw = [process.env.CALENDLY_API_TOKENS, process.env.CALENDLY_API_TOKEN].filter(Boolean).join(',');
  return [...new Set(raw.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean))];
}

function accountCount() {
  return getTokens().length;
}

function calendlyConfigured() {
  return Boolean(process.env.CALENDLY_API_ENABLED === 'true' && getTokens().length > 0);
}

// `account` is the index into getTokens(), so tokens themselves never travel through the call sites.
async function calendlyGet(path, account = 0) {
  const token = getTokens()[account];
  if (!token) throw new Error(`No Calendly token configured for account ${account}.`);
  const res = await fetch(`${CALENDLY_API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Calendly API responded ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    err.retryAfter = Number(res.headers.get('retry-after')) || 0;
    throw err;
  }
  return res.json();
}

// Resolves which scope to query events by, per account. Uses .env overrides when present (only meaningful
// with a single account), otherwise discovers them from GET /users/me. Cached per process because the
// caller's user/org never change while the server is running.
const scopeCache = new Map(); // token -> scope
async function resolveScope(account = 0) {
  const tokens = getTokens();
  const token = tokens[account];
  if (!token) throw new Error(`No Calendly token configured for account ${account}.`);
  if (scopeCache.has(token)) return scopeCache.get(token);

  if (tokens.length === 1 && process.env.CALENDLY_USER_URI && process.env.CALENDLY_ORGANIZATION) {
    const scope = {
      scopeParam: `user=${encodeURIComponent(process.env.CALENDLY_USER_URI)}`,
      userUri: process.env.CALENDLY_USER_URI,
      organization: process.env.CALENDLY_ORGANIZATION,
      source: 'env'
    };
    scopeCache.set(token, scope);
    return scope;
  }

  const me = await calendlyGet('/users/me', account);
  const resource = (me && me.resource) || {};
  const userUri = (tokens.length === 1 && process.env.CALENDLY_USER_URI) || resource.uri;
  const organization = (tokens.length === 1 && process.env.CALENDLY_ORGANIZATION) || resource.current_organization;

  if (!userUri && !organization) {
    throw new Error('Could not resolve a Calendly user URI or organization URI from /users/me.');
  }

  // Organization is preferred when known so bookings with any team member count.
  const scopeParam = organization
    ? `organization=${encodeURIComponent(organization)}`
    : `user=${encodeURIComponent(userUri)}`;

  const scope = { scopeParam, userUri, organization, source: 'discovered', name: resource.name || null, schedulingUrl: resource.scheduling_url || null };
  scopeCache.set(token, scope);
  return scope;
}

// Which Calendly accounts the ATS is connected to: public profile info only (name + booking page), never
// tokens or emails. An account whose token fails shows the error instead.
async function describeAccounts() {
  const out = [];
  for (let i = 0; i < accountCount(); i++) {
    try {
      const scope = await resolveScope(i);
      out.push({ name: scope.name, schedulingUrl: scope.schedulingUrl });
    } catch (err) {
      out.push({ error: err.status ? `Calendly API responded ${err.status}` : err.message });
    }
  }
  return out;
}

// Lists scheduled events for one invitee email in one account, following pagination so large
// pipelines aren't cut off at the first 100 rows.
//
// We filter server-side with `invitee_email` — that is the person who booked,
// i.e. the candidate. NOTE: `event_memberships[].user_email` is the *host's*
// email (the Calendly account that owns the event), so it is never a reliable
// way to identify a candidate and must not be used for matching.
async function listScheduledEvents(inviteeEmail, account = 0) {
  const { scopeParam } = await resolveScope(account);
  const events = [];
  let pageToken = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      count: '100',
      sort: 'start_time:desc' // /scheduled_events only accepts start_time
    });
    if (inviteeEmail) params.append('invitee_email', inviteeEmail);
    // scopeParam is pre-encoded as `key=value` pairs.
    scopeParam.split('&').forEach((pair) => {
      const [k, v] = pair.split('=');
      params.append(k, decodeURIComponent(v || ''));
    });
    if (pageToken) params.append('page_token', pageToken);

    const data = await calendlyGet(`/scheduled_events?${params.toString()}`, account);
    events.push(...((data && data.collection) || []));
    pageToken = data && data.pagination && data.pagination.next_page_token;
    if (!pageToken) break;
  }

  return events;
}

// Scheduled events starting from `sinceIso` onwards (so upcoming bookings are included), across every
// connected account; each event is tagged with `_account` so its invitees are read with the right token.
// Unlike checkCalendlyStatus this THROWS on a 429 (err.status / err.retryAfter) so the background sync can
// pace itself and wait. Any other per-account failure skips that account and is listed in
// `events.accountErrors`; it only throws when no account could be read at all.
async function listRecentEvents(sinceIso) {
  const events = [];
  const accountErrors = [];
  for (let account = 0; account < accountCount(); account++) {
    try {
      const { scopeParam } = await resolveScope(account);
      let pageToken = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({ count: '100', sort: 'start_time:asc', status: 'active', min_start_time: sinceIso });
        scopeParam.split('&').forEach((pair) => {
          const [k, v] = pair.split('=');
          params.append(k, decodeURIComponent(v || ''));
        });
        if (pageToken) params.append('page_token', pageToken);
        const data = await calendlyGet(`/scheduled_events?${params.toString()}`, account);
        ((data && data.collection) || []).forEach((ev) => events.push({ ...ev, _account: account }));
        pageToken = data && data.pagination && data.pagination.next_page_token;
        if (!pageToken) break;
      }
    } catch (err) {
      if (err.status === 429) throw err;
      accountErrors.push(`account ${account + 1}: ${err.status ? `Calendly API responded ${err.status}` : err.message}`);
    }
  }
  if (accountErrors.length && accountErrors.length === accountCount()) throw new Error(accountErrors.join('; '));
  events.accountErrors = accountErrors;
  return events;
}

// Active invitees (the people who booked) of one event, read with that event's account. Throws like listRecentEvents.
async function listEventInvitees(eventUuid, account = 0) {
  const data = await calendlyGet(`/scheduled_events/${encodeURIComponent(eventUuid)}/invitees?count=100&status=active`, account);
  return (data && data.collection) || [];
}

// Returns the Booked/Not Booked status for one candidate email, looking in every connected account.
// Booked if ANY account has an active booking; Not Booked only when every account answered and none did
// (an account we couldn't read must not turn into a false "Not Booked").
// Never throws — on any failure it returns { available: false, reason } so the
// caller can keep the recruiter's manual value untouched.
async function checkCalendlyStatus(email) {
  if (!calendlyConfigured()) {
    return { available: false, reason: 'Calendly integration not configured. Set CALENDLY_API_ENABLED=true and CALENDLY_API_TOKEN (or CALENDLY_API_TOKENS) in .env.' };
  }
  if (!email) {
    return { available: false, reason: 'Candidate has no email address.' };
  }

  const candidateEmail = email.toLowerCase().trim();
  const outcomes = await Promise.all(Array.from({ length: accountCount() }, async (_, account) => {
    try {
      // Calendly matches invitee_email case-insensitively server-side.
      const events = await listScheduledEvents(candidateEmail, account);
      // Only count events that are actually on. A cancellation keeps the invitee
      // record but flips status to "canceled", which must read as Not Booked.
      const booked = events.some((event) => EVENT_STATUSES.includes((event.status || '').toLowerCase()));
      return { ok: true, booked, checked: events.length, scope: await resolveScope(account) };
    } catch (err) {
      return { ok: false, err };
    }
  }));

  const good = outcomes.filter((o) => o.ok);
  const failed = outcomes.find((o) => !o.ok);
  const base = good[0] && good[0].scope;
  const meta = {
    eventsChecked: good.reduce((n, o) => n + o.checked, 0),
    accountsChecked: good.length,
    accounts: outcomes.length,
    matchedBy: base && base.organization ? 'organization' : 'user',
    userUri: (base && base.userUri) || null,
    organization: (base && base.organization) || null
  };
  if (good.some((o) => o.booked)) return { available: true, status: 'Booked', ...meta };
  if (!failed) return { available: true, status: 'Not Booked', ...meta };
  // Some account could not be read and nobody was booked in the others: don't guess.
  const err = failed.err;
  return { available: false, reason: err.message, rateLimited: outcomes.some((o) => !o.ok && o.err.status === 429), retryAfter: err.retryAfter || 0, status: err.status };
}

module.exports = { checkCalendlyStatus, calendlyConfigured, resolveScope, accountCount, describeAccounts, listRecentEvents, listEventInvitees };
