// Calendly integration for the FREELANCE CODING pipeline.
//
// Goal: when a recruiter views a candidate's "Calendly Link Status" we want to
// know whether they actually booked a slot. Calendly has a public REST API
// (v2) that can answer this: given the candidate's email we look up their
// scheduled events. If any invitee on a scheduled/active event matches the
// candidate email, the candidate is "Booked"; otherwise "Not Booked".
//
// This is intentionally OPT-IN. It needs a personal access token from Calendly
// (https://calendly.com/integrations/api_webhooks) and the user URI to query
// against. When either is missing the service reports `available: false` and
// the UI keeps using the recruiter-selected dropdown value — never blocking.

const CALENDLY_API_URL = process.env.CALENDLY_API_URL || 'https://api.calendly.com';

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
    const userUri = process.env.CALENDLY_USER_URI || (await calendlyGet('/users/me')).resource && (await calendlyGet('/users/me')).resource.uri;
    if (!userUri) {
      return { available: false, reason: 'Could not resolve Calendly user URI.' };
    }

    const query = new URLSearchParams({
      user: userUri,
      count: '100',
      sort: 'created_at:desc'
    });
    const data = await calendlyGet(`/scheduled_events?${query.toString()}`);

    const events = (data && data.collection) || [];
    const candidateEmail = email.toLowerCase().trim();
    const booked = events.some((event) =>
      (event.event_memberships || []).some((m) => (m.user_email || '').toLowerCase().trim() === candidateEmail) &&
      ['active', 'scheduled'].includes((event.status || '').toLowerCase())
    );

    return { available: true, status: booked ? 'Booked' : 'Not Booked', eventsChecked: events.length };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}

module.exports = { checkCalendlyStatus, calendlyConfigured };
