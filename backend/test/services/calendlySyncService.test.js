const mockFind = jest.fn();
const mockUpdateOne = jest.fn();
const mockBulkWrite = jest.fn();
jest.mock('../../models/Candidate', () => ({ find: (...a) => mockFind(...a), updateOne: (...a) => mockUpdateOne(...a), bulkWrite: (...a) => mockBulkWrite(...a) }));
const mockCheck = jest.fn();
let mockConfigured = true;
jest.mock('../../services/calendlyService', () => ({ checkCalendlyStatus: (...a) => mockCheck(...a), calendlyConfigured: () => mockConfigured }));
const { syncCalendlyBookings } = require('../../services/calendlySyncService');

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
    const r = await syncCalendlyBookings();
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
    await syncCalendlyBookings();
    expect(mockUpdateOne.mock.calls[0][1].$set.calendlyLinkStatus).toBe('Not Booked');
  });

  it('does not stamp or change people Calendly could not answer for, and stops after repeated failures', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ _id: `id${i}`, email: `p${i}@x.com`, calendlyLinkStatus: null }));
    mockFind.mockReturnValueOnce(query(rows)).mockReturnValueOnce(query([]));
    mockCheck.mockResolvedValue({ available: false, reason: 'Calendly API responded 429' });
    const r = await syncCalendlyBookings();
    expect(r.stoppedEarly).toBe(true);
    expect(r.checked).toBeLessThan(30);
    expect(mockUpdateOne).not.toHaveBeenCalled();
    expect(mockBulkWrite).not.toHaveBeenCalled();
  });
});
