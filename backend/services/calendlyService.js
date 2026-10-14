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
// CALENDLY_USER_URI and CALENDLY_ORGANIZATION are both OPTIONAL — if they are
// blank we discover them from GET /users/me on the first call. To see the
// actual values for your account, run:  npm run calendly:whoami

const CALENDLY_API_URL = process.env.CALENDLY_API_URL || 'https://api.calendly.com';
const EVENT_STATUSES = ['active', 'scheduled']; // cancelled/attended-in-the-past don't count as booked
const MAX_PAGES = 5; // 100 events per page; enough for most recruiters' pipelines

function calendlyConfigured() {
  return Boolean(process.env.CALENDLY_API_ENABLED === 'true' && process.env.CALENDLY_API_TOKEN);
}

async function calendlyGet(path) {
  const res = await fetch(`${CALENDLY_API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.CALENDLY_API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Calendly API responded ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Resolves which scope to query events by. Uses .env overrides when present,
// otherwise discovers them from GET /users/me. Cached per process because the
// caller's user/org never change while the server is running.
let scopeCache = null;
async function resolveScope() {
  if (scopeCache) return scopeCache;

  if (process.env.CALENDLY_USER_URI && process.env.CALENDLY_ORGANIZATION) {
    scopeCache = {
      scopeParam: `user=${encodeURIComponent(process.env.CALENDLY_USER_URI)}`,
      userUri: process.env.CALENDLY_USER_URI,
      organization: process.env.CALENDLY_ORGANIZATION,
      source: 'env'
    };
    return scopeCache;
  }

  const me = await calendlyGet('/users/me');
  const resource = (me && me.resource) || {};
  const userUri = process.env.CALENDLY_USER_URI || resource.uri;
  const organization = process.env.CALENDLY_ORGANIZATION || resource.current_organization;

  if (!userUri && !organization) {
    throw new Error('Could not resolve a Calendly user URI or organization URI from /users/me.');
  }

  // Organization is preferred when known so bookings with any team member count.
  const scopeParam = organization
    ? `organization=${encodeURIComponent(organization)}`
    : `user=${encodeURIComponent(userUri)}`;

  scopeCache = { scopeParam, userUri, organization, source: 'discovered' };
  return scopeCache;
}

// Lists scheduled events for one invitee email, following pagination so large
// pipelines aren't cut off at the first 100 rows.
//
// We filter server-side with `invitee_email` — that is the person who booked,
// i.e. the candidate. NOTE: `event_memberships[].user_email` is the *host's*
// email (the Calendly account that owns the event), so it is never a reliable
// way to identify a candidate and must not be used for matching.
async function listScheduledEvents(inviteeEmail) {
  const { scopeParam } = await resolveScope();
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

    const data = await calendlyGet(`/scheduled_events?${params.toString()}`);
    events.push(...((data && data.collection) || []));
    pageToken = data && data.pagination && data.pagination.next_page_token;
    if (!pageToken) break;
  }

  return events;
}

// Returns the Booked/Not Booked status for one candidate email.
// Never throws — on any failure it returns { available: false, reason } so the
// caller can keep the recruiter's manual value untouched.
async function checkCalendlyStatus(email) {
  if (!calendlyConfigured()) {
    return { available: false, reason: 'Calendly integration not configured. Set CALENDLY_API_ENABLED=true and CALENDLY_API_TOKEN in .env.' };
  }
  if (!email) {
    return { available: false, reason: 'Candidate has no email address.' };
  }

  try {
    const scope = await resolveScope();
    const candidateEmail = email.toLowerCase().trim();
    // Calendly matches invitee_email case-insensitively server-side.
    const events = await listScheduledEvents(candidateEmail);

    // Only count events that are actually on. A cancellation keeps the invitee
    // record but flips status to "canceled", which must read as Not Booked.
    const booked = events.some((event) =>
      EVENT_STATUSES.includes((event.status || '').toLowerCase())
    );

    return {
      available: true,
      status: booked ? 'Booked' : 'Not Booked',
      eventsChecked: events.length,
      matchedBy: scope.organization ? 'organization' : 'user',
      userUri: scope.userUri || null,
      organization: scope.organization || null
    };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}

module.exports = { checkCalendlyStatus, calendlyConfigured, resolveScope };
