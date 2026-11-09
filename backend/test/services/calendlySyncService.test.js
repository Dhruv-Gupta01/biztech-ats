const mockFind = jest.fn();
const mockUpdateOne = jest.fn();
const mockBulkWrite = jest.fn();
jest.mock('../../models/Candidate', () => ({ find: (...a) => mockFind(...a), updateOne: (...a) => mockUpdateOne(...a), bulkWrite: (...a) => mockBulkWrite(...a) }));
const mockCheck = jest.fn();
const mockEvents = jest.fn();
const mockInvitees = jest.fn();
let mockConfigured = true;
jest.mock('../../services/calendlyService', () => ({
  checkCalendlyStatus: (...a) => mockCheck(...a),
  calendlyConfigured: () => mockConfigured,
  listRecentEvents: (...a) => mockEvents(...a),
  listEventInvitees: (...a) => mockInvitees(...a)
}));
const { syncCalendlyBookings, getLastRun } = require('../../services/calendlySyncService');
const FAST = { paceMs: 0, rateLimitWaitMs: 0 };

// Candidate.find(...) returns a query: .lean() directly (recent set) or .sort().limit().lean() (rotation set).
const query = (rows) => ({ lean: async () => rows, sort: () => ({ limit: () => ({ lean: async () => rows }) }) });

describe('syncCalendlyBookings', () => {
  beforeEach(() => {
    mockConfigured = true;
    mockFind.mockReset(); mockUpdateOne.mockReset().mockResolvedValue({}); mockBulkWrite.mockReset().mockResolvedValue({}); mockCheck.mockReset();
    mockEvents.mockReset().mockResolvedValue([]); mockInvitees.mockReset().mockResolvedValue([]);
  });

  it('does nothing when Calendly is not configured', async () => {
    mockConfigured = false;
    expect(await syncCalendlyBookings()).toEqual({ ran: false, reason: 'Calendly integration not configured.' });
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('updates only the people whose status changed, checks each person once, and stamps the checked time', async () => {
    const a = { _id: 'a', email: 'a@x.com', calendlyLinkStatus: 'Not Booked' };
    const b = { _id: 'b', email: 'b@x.com', calendlyLinkStatus: 'Booked' };
    mockFind.mockReturnValueOnce(query([a])).mockReturnValueOnce(query([a, b]));
    mockCheck.mockImplementation(async (email) => ({ available: true, status: email === 'a@x.com' ? 'Booked' : 'Booked' }));
    const r = await syncCalendlyBookings(FAST);
    expect(mockCheck).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ ran: true, checked: 2, updated: 1, failed: 0 });
    expect(mockUpdateOne.mock.calls[0][0]).toEqual({ _id: 'a' });
    expect(mockUpdateOne.mock.calls[0][1].$set.calendlyLinkStatus).toBe('Booked');
    expect(mockBulkWrite.mock.calls[0][0][0].updateMany.filter._id.$in).toEqual(['a', 'b']);
  });

  it('never downgrades a stored Booked to Not Booked (Calendly not finding an email is not proof)', async () => {
    const b = { _id: 'b', email: 'b@x.com', calendlyLinkStatus: 'Booked' };
    mockFind.mockReturnValueOnce(query([])).mockReturnValueOnce(query([b]));
    mockCheck.mockResolvedValue({ available: true, status: 'Not Booked' });
    const r = await syncCalendlyBookings(FAST);
    expect(mockUpdateOne).not.toHaveBeenCalled();
    expect(r).toMatchObject({ checked: 1, updated: 0, keptBooked: 1 });
    expect(mockBulkWrite.mock.calls[0][0][0].updateMany.filter._id.$in).toEqual(['b']); // still counts as checked
  });

  it('upgrades Not Booked / blank to Booked and fills a blank with Not Booked', async () => {
    const rows = [{ _id: 'a', email: 'a@x.com', calendlyLinkStatus: 'Not Booked' }, { _id: 'c', email: 'c@x.com', calendlyLinkStatus: null }, { _id: 'd', email: 'd@x.com', calendlyLinkStatus: null }];
    mockFind.mockReturnValueOnce(query(rows)).mockReturnValueOnce(query([]));
    mockCheck.mockImplementation(async (email) => ({ available: true, status: email === 'd@x.com' ? 'Not Booked' : 'Booked' }));
    const r = await syncCalendlyBookings(FAST);
    expect(r.updated).toBe(3);
    expect(mockUpdateOne.mock.calls.map((c) => [c[0]._id, c[1].$set.calendlyLinkStatus])).toEqual([['a', 'Booked'], ['c', 'Booked'], ['d', 'Not Booked']]);
  });

  it('waits out a 429 and carries on with the same person instead of giving up', async () => {
    const rows = [{ _id: 'a', email: 'a@x.com', calendlyLinkStatus: null }, { _id: 'b', email: 'b@x.com', calendlyLinkStatus: null }];
    mockFind.mockReturnValueOnce(query(rows)).mockReturnValueOnce(query([]));
    const seq = [{ available: true, status: 'Booked' }, { available: false, rateLimited: true, status: 429, reason: '429' }, { available: true, status: 'Not Booked' }];
    mockCheck.mockImplementation(async () => seq.shift());
    const r = await syncCalendlyBookings(FAST);
    expect(r).toMatchObject({ checked: 2, updated: 2, rateLimitWaits: 1, stoppedEarly: false });
    expect(mockCheck).toHaveBeenCalledTimes(3);
    expect(mockCheck.mock.calls[1][0]).toBe('b@x.com');
    expect(mockCheck.mock.calls[2][0]).toBe('b@x.com');
  });

  it('gives up after repeated 429s but still stamps the people already checked', async () => {
    const rows = [{ _id: 'a', email: 'a@x.com', calendlyLinkStatus: 'Booked' }, { _id: 'b', email: 'b@x.com', calendlyLinkStatus: null }];
    mockFind.mockReturnValueOnce(query(rows)).mockReturnValueOnce(query([]));
    mockCheck.mockImplementation(async (email) => (email === 'a@x.com' ? { available: true, status: 'Booked' } : { available: false, rateLimited: true, status: 429, reason: '429' }));
    const r = await syncCalendlyBookings(FAST);
    expect(r.stoppedEarly).toBe(true);
    expect(r.rateLimitWaits).toBe(3);
    expect(mockBulkWrite.mock.calls[0][0][0].updateMany.filter._id.$in).toEqual(['a']);
  });

  it('stamps a person Calendly rejects (400) so they stop blocking the queue, without counting it as an outage', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ _id: `id${i}`, email: `bad${i}`, calendlyLinkStatus: null }));
    mockFind.mockReturnValueOnce(query(rows)).mockReturnValueOnce(query([]));
    mockCheck.mockResolvedValue({ available: false, status: 400, reason: 'Calendly API responded 400' });
    const r = await syncCalendlyBookings(FAST);
    expect(r).toMatchObject({ skipped: 8, failed: 0, stoppedEarly: false });
    expect(mockBulkWrite.mock.calls[0][0][0].updateMany.filter._id.$in).toHaveLength(8);
  });

  it('stops after repeated real failures (bad token, outage) without stamping anyone', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ _id: `id${i}`, email: `p${i}@x.com`, calendlyLinkStatus: null }));
    mockFind.mockReturnValueOnce(query(rows)).mockReturnValueOnce(query([]));
    mockCheck.mockResolvedValue({ available: false, status: 401, reason: 'Calendly API responded 401' });
    const r = await syncCalendlyBookings(FAST);
    expect(r.stoppedEarly).toBe(true);
    expect(r.checked).toBe(5);
    expect(r.lastError).toMatch(/401/);
    expect(mockUpdateOne).not.toHaveBeenCalled();
    expect(mockBulkWrite).not.toHaveBeenCalled();
    expect(getLastRun().stoppedEarly).toBe(true);
  });
});

describe('syncCalendlyBookings: bookings from Calendly events', () => {
  beforeEach(() => {
    mockConfigured = true;
    mockFind.mockReset(); mockUpdateOne.mockReset().mockResolvedValue({}); mockBulkWrite.mockReset().mockResolvedValue({}); mockCheck.mockReset();
    mockEvents.mockReset(); mockInvitees.mockReset();
  });
  const ev = (n, updated = 't1') => ({ uri: `https://api.calendly.com/scheduled_events/ev${n}`, updated_at: updated, event_memberships: [{ user: `https://api.calendly.com/users/u${n % 2}` }] });

  it('marks everyone who booked as Booked and Sent (matched by email), counts the rest, and reports hosts seen', async () => {
    mockEvents.mockResolvedValue([ev(1), ev(2)]);
    mockInvitees.mockImplementation(async (uuid) => (uuid === 'ev1' ? [{ email: 'A@x.com' }] : [{ email: 'stranger@y.com' }, { email: 'b@x.com' }]));
    // events step finds candidates first; the two lookups after it find none
    mockFind.mockReturnValueOnce(query([
      { _id: 'a', email: 'a@x.com', calendlyLinkStatus: null, calendlyLinkSent: null },
      { _id: 'b', email: 'b@x.com', calendlyLinkStatus: 'Booked', calendlyLinkSent: 'Sent' }
    ])).mockReturnValue(query([]));
    const r = await syncCalendlyBookings(FAST);
    expect(r).toMatchObject({ eventsSeen: 2, eventsRead: 2, hostsSeen: 2, inviteesRead: 3, bookingsMatched: 2, bookingsUnmatched: 1, bookedFromEvents: 1 });
    expect(mockFind.mock.calls[0][0].email.$in.sort()).toEqual(['a@x.com', 'b@x.com', 'stranger@y.com']);
    const [filter, update] = mockUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'a' });
    expect(update.$set).toMatchObject({ calendlyLinkStatus: 'Booked', calendlyLinkSent: 'Sent' });
    expect(update.$set.calendlyLinkSentAt).toBeInstanceOf(Date);
    expect(mockUpdateOne).toHaveBeenCalledTimes(1); // b is already Booked + Sent: untouched
  });

  it('reads each event once: a repeat run skips unchanged events but re-reads an updated one', async () => {
    mockEvents.mockResolvedValue([ev(7, 'v1')]);
    mockInvitees.mockResolvedValue([{ email: 'c@x.com' }]);
    mockFind.mockReturnValue(query([]));
    await syncCalendlyBookings(FAST);
    await syncCalendlyBookings(FAST);
    expect(mockInvitees).toHaveBeenCalledTimes(1);
    mockEvents.mockResolvedValue([ev(7, 'v2')]);
    await syncCalendlyBookings(FAST);
    expect(mockInvitees).toHaveBeenCalledTimes(2);
  });

  it('a failure fetching events is reported but does not stop the per-candidate lookups', async () => {
    mockEvents.mockRejectedValue(Object.assign(new Error('Calendly API responded 403'), { status: 403 }));
    mockFind.mockReturnValueOnce(query([])).mockReturnValueOnce(query([{ _id: 'z', email: 'z@x.com', calendlyLinkStatus: null }]));
    mockCheck.mockResolvedValue({ available: true, status: 'Booked' });
    const r = await syncCalendlyBookings(FAST);
    expect(r.bookingsError).toMatch(/403/);
    expect(r.updated).toBe(1);
  });

  it('waits out a 429 while listing events and carries on', async () => {
    mockEvents.mockRejectedValueOnce(Object.assign(new Error('429'), { status: 429 })).mockResolvedValue([]);
    mockFind.mockReturnValue(query([]));
    const r = await syncCalendlyBookings(FAST);
    expect(r.rateLimitWaits).toBe(1);
    expect(r.bookingsError).toBeUndefined();
    expect(mockEvents).toHaveBeenCalledTimes(2);
  });
});
