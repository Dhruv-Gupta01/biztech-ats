const mockUpdateMany = jest.fn();
const mockFind = jest.fn();
jest.mock('../../models/Candidate', () => ({ updateMany: (...a) => mockUpdateMany(...a), find: (...a) => mockFind(...a) }));
const { detectSignals, applyOutreachSignals } = require('../../services/outreachSignals');

describe('detectSignals', () => {
  it('spots a Calendly link attachment', () => {
    const s = detectSignals({ subject: 'Interview', body: 'Hi', links: [{ name: 'Book here', url: 'https://calendly.com/hiring-biztechanalytics/30min' }] });
    expect(s).toEqual({ calendly: true, ndaIca: false, slack: false });
  });
  it('spots a Calendly or Slack URL written in the body, including subdomains', () => {
    const s = detectSignals({ subject: 's', body: 'Book: https://www.calendly.com/x/y and join https://join.slack.com/t/team/shared_invite/abc.' });
    expect(s.calendly).toBe(true);
    expect(s.slack).toBe(true);
  });
  it('does not treat look-alike hosts as Calendly or Slack', () => {
    const s = detectSignals({ subject: 's', body: 'https://notcalendly.com/x https://calendly.com.evil.io/x https://slack.com.evil.io', links: [] });
    expect(s).toEqual({ calendly: false, ndaIca: false, slack: false });
  });
  it('recognises NDA/ICA in the subject, body, file name or link name', () => {
    expect(detectSignals({ subject: 'NDA & ICA', body: '' }).ndaIca).toBe(true);
    expect(detectSignals({ subject: 's', body: 'Please sign the Non-Disclosure Agreement' }).ndaIca).toBe(true);
    expect(detectSignals({ subject: 's', body: 'b', files: [{ name: 'Contractor Agreement v2.pdf' }] }).ndaIca).toBe(true);
    expect(detectSignals({ subject: 's', body: 'b', links: [{ name: 'ICA form', url: 'https://example.com' }] }).ndaIca).toBe(true);
  });
  it('does not fire on words that merely contain ica / nda', () => {
    expect(detectSignals({ subject: 'Specifically, an agenda', body: 'application of Canada rules' }).ndaIca).toBe(false);
  });
});

describe('applyOutreachSignals', () => {
  beforeEach(() => {
    mockUpdateMany.mockReset().mockResolvedValue({ modifiedCount: 2 });
    mockFind.mockReset().mockReturnValue({ lean: async () => [{ _id: 'a', calendlyLinkSent: 'Sent' }] });
  });

  it('does nothing when nothing was detected or nobody was emailed', async () => {
    expect((await applyOutreachSignals(['a@x.com'], { calendly: false, ndaIca: false, slack: false })).candidates).toEqual([]);
    expect((await applyOutreachSignals([], { calendly: true })).candidates).toEqual([]);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('marks Calendly Sent with a sent-at time for the emailed addresses only (lower-cased, de-duplicated)', async () => {
    const r = await applyOutreachSignals(['A@x.com', 'a@x.com', 'b@x.com'], { calendly: true });
    const [filter, update] = mockUpdateMany.mock.calls[0];
    expect(filter).toEqual({ email: { $in: ['a@x.com', 'b@x.com'] } });
    expect(update.$set.calendlyLinkSent).toBe('Sent');
    expect(update.$set.calendlyLinkSentAt).toBeInstanceOf(Date);
    expect(r.modified.calendlyLinkSent).toBe(2);
    expect(r.candidates).toHaveLength(1);
  });

  it('only moves NDA/ICA from blank or Not Sent, and Slack from blank (never back from Signed / Joined)', async () => {
    await applyOutreachSignals(['a@x.com'], { ndaIca: true, slack: true });
    const [ndaFilter, ndaUpdate] = mockUpdateMany.mock.calls[0];
    const [slackFilter, slackUpdate] = mockUpdateMany.mock.calls[1];
    expect(ndaFilter.ndaIca).toEqual({ $in: [null, 'Not Sent'] });
    expect(ndaUpdate.$set.ndaIca).toBe('Sent');
    expect(slackFilter.slackStatus).toBeNull();
    expect(slackUpdate.$set.slackStatus).toBe('Invited');
  });
});
