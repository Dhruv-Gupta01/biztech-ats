// Mocks fetch as a tiny Calendly: each token is its own account with its own organisation and events.
const ACCOUNTS = {
  tokA: { name: 'Hiring Team', events: [] },
  tokB: { name: 'HR Team', events: [] }
};
let calls;

function fakeFetch(url, opts) {
  const token = String(opts.headers.Authorization).replace('Bearer ', '');
  const acct = ACCOUNTS[token];
  calls.push({ url: String(url), token });
  const reply = (status, body) => ({ ok: status === 200, status, headers: { get: () => null }, text: async () => JSON.stringify(body), json: async () => body });
  if (!acct) return reply(401, { title: 'Unauthenticated' });
  if (acct.fail) return reply(acct.fail, {});
  const u = new URL(url);
  if (u.pathname === '/users/me') {
    return reply(200, { resource: { uri: `https://api.calendly.com/users/${token}`, current_organization: `https://api.calendly.com/organizations/${token}`, name: acct.name, scheduling_url: `https://calendly.com/${token}` } });
  }
  if (u.pathname === '/scheduled_events') {
    const email = u.searchParams.get('invitee_email');
    const list = acct.events.filter((e) => !email || e.invitees.includes(email));
    return reply(200, { collection: list.map((e) => ({ uri: `https://api.calendly.com/scheduled_events/${e.id}`, status: e.status || 'active', updated_at: 't', event_memberships: [] })), pagination: {} });
  }
  const m = u.pathname.match(/^\/scheduled_events\/(.+)\/invitees$/);
  if (m) {
    const ev = acct.events.find((e) => e.id === m[1]);
    return reply(200, { collection: (ev ? ev.invitees : []).map((email) => ({ email })) });
  }
  return reply(404, {});
}

describe('calendlyService with several accounts', () => {
  let svc;
  beforeEach(() => {
    jest.resetModules();
    calls = [];
    ACCOUNTS.tokA = { name: 'Hiring Team', events: [] };
    ACCOUNTS.tokB = { name: 'HR Team', events: [] };
    process.env.CALENDLY_API_ENABLED = 'true';
    process.env.CALENDLY_API_TOKENS = 'tokA, tokB';
    delete process.env.CALENDLY_API_TOKEN;
    delete process.env.CALENDLY_USER_URI;
    delete process.env.CALENDLY_ORGANIZATION;
    global.fetch = jest.fn(fakeFetch);
    svc = require('../../services/calendlyService');
  });
  afterEach(() => { delete global.fetch; delete process.env.CALENDLY_API_TOKENS; delete process.env.CALENDLY_API_ENABLED; });

  it('reads tokens from CALENDLY_API_TOKENS and CALENDLY_API_TOKEN, without duplicates', () => {
    expect(svc.accountCount()).toBe(2);
    process.env.CALENDLY_API_TOKEN = 'tokA';
    expect(svc.accountCount()).toBe(2);
    process.env.CALENDLY_API_TOKEN = 'tokC';
    expect(svc.accountCount()).toBe(3);
    delete process.env.CALENDLY_API_TOKEN;
  });

  it('is configured only when enabled and at least one token is set', () => {
    expect(svc.calendlyConfigured()).toBe(true);
    delete process.env.CALENDLY_API_TOKENS;
    expect(svc.calendlyConfigured()).toBe(false);
  });

  it('describes each connected account by name and booking page only', async () => {
    expect(await svc.describeAccounts()).toEqual([
      { name: 'Hiring Team', schedulingUrl: 'https://calendly.com/tokA' },
      { name: 'HR Team', schedulingUrl: 'https://calendly.com/tokB' }
    ]);
  });

  it('Booked when the booking is in the SECOND account (the one the first token cannot see)', async () => {
    ACCOUNTS.tokB.events = [{ id: 'e1', invitees: ['dhruv@x.com'] }];
    const r = await svc.checkCalendlyStatus('Dhruv@X.com');
    expect(r).toMatchObject({ available: true, status: 'Booked', accounts: 2, accountsChecked: 2 });
  });

  it('Not Booked only when every account answered and none has a booking; cancelled events do not count', async () => {
    ACCOUNTS.tokA.events = [{ id: 'e2', invitees: ['a@x.com'], status: 'canceled' }];
    expect(await svc.checkCalendlyStatus('a@x.com')).toMatchObject({ available: true, status: 'Not Booked' });
  });

  it('does not turn an unreadable account into Not Booked, but still reports Booked from a readable one', async () => {
    ACCOUNTS.tokA.fail = 403;
    expect(await svc.checkCalendlyStatus('nobody@x.com')).toMatchObject({ available: false, status: 403 });
    ACCOUNTS.tokB.events = [{ id: 'e3', invitees: ['nobody@x.com'] }];
    expect(await svc.checkCalendlyStatus('nobody@x.com')).toMatchObject({ available: true, status: 'Booked' });
  });

  it('flags a 429 so the sync can wait instead of treating it as a bad candidate', async () => {
    ACCOUNTS.tokA.fail = 429;
    expect(await svc.checkCalendlyStatus('x@x.com')).toMatchObject({ available: false, rateLimited: true });
  });

  it('lists recent events from every account, tagged with the account their invitees must be read with', async () => {
    ACCOUNTS.tokA.events = [{ id: 'a1', invitees: ['a@x.com'] }];
    ACCOUNTS.tokB.events = [{ id: 'b1', invitees: ['b@x.com'] }];
    const events = await svc.listRecentEvents('2026-11-01T00:00:00.000Z');
    expect(events.map((e) => [e.uri.split('/').pop(), e._account])).toEqual([['a1', 0], ['b1', 1]]);
    expect(await svc.listEventInvitees('b1', 1)).toEqual([{ email: 'b@x.com' }]);
    // each account was queried with its own token
    expect(calls.filter((c) => c.url.includes('/scheduled_events?')).map((c) => c.token)).toEqual(['tokA', 'tokB']);
  });

  it('skips an account it cannot read (reported in accountErrors) but throws if none can be read', async () => {
    ACCOUNTS.tokA.events = [{ id: 'a1', invitees: ['a@x.com'] }];
    ACCOUNTS.tokB.fail = 403;
    const events = await svc.listRecentEvents('2026-11-01T00:00:00.000Z');
    expect(events).toHaveLength(1);
    expect(events.accountErrors).toEqual(['account 2: Calendly API responded 403']);
    ACCOUNTS.tokA.fail = 401;
    await expect(svc.listRecentEvents('2026-11-01T00:00:00.000Z')).rejects.toThrow(/account 1.*account 2/);
  });

  it('a 429 while listing events is thrown so the caller can wait and retry', async () => {
    ACCOUNTS.tokA.fail = 429;
    await expect(svc.listRecentEvents('2026-11-01T00:00:00.000Z')).rejects.toMatchObject({ status: 429 });
  });
});
