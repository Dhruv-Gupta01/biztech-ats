const mockFind = jest.fn();
const mockUpdateOne = jest.fn();
const mockBulkWrite = jest.fn();
jest.mock('../../models/Candidate', () => ({ find: (...a) => mockFind(...a), updateOne: (...a) => mockUpdateOne(...a), bulkWrite: (...a) => mockBulkWrite(...a) }));
const mockCheck = jest.fn();
let mockConfigured = true;
jest.mock('../../services/calendlyService', () => ({ checkCalendlyStatus: (...a) => mockCheck(...a), calendlyConfigured: () => mockConfigured }));
const { syncCalendlyBookings, getLastRun } = require('../../services/calendlySyncService');
const FAST = { paceMs: 0, rateLimitWaitMs: 0 };

// Candidate.find(...) returns a query: .lean() directly (recent set) or .sort().limit().lean() (rotation set).
const query = (rows) => ({ lean: async () => rows, sort: () => ({ limit: () => ({ lean: async () => rows }) }) });

describe('syncCalendlyBookings', () => {
  beforeEach(() => {
    mockConfigured = true;
    mockFind.mockReset(); mockUpdateOne.mockReset().mockResolvedValue({}); mockBulkWrite.mockReset().mockResolvedValue({}); mockCheck.mockReset();
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

  it('records a cancellation (Booked -> Not Booked)', async () => {
    const b = { _id: 'b', email: 'b@x.com', calendlyLinkStatus: 'Booked' };
    mockFind.mockReturnValueOnce(query([])).mockReturnValueOnce(query([b]));
    mockCheck.mockResolvedValue({ available: true, status: 'Not Booked' });
    await syncCalendlyBookings(FAST);
    expect(mockUpdateOne.mock.calls[0][1].$set.calendlyLinkStatus).toBe('Not Booked');
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
