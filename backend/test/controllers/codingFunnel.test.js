jest.mock('../../models/Candidate', () => ({}));
const { buildCodingFunnel } = require('../../controllers/codingFunnelController');

const NOW = new Date('2026-11-25T08:00:00Z');
const byKey = (r) => Object.fromEntries(r.stages.map((s) => [s.key, s]));
const cand = (o) => ({ createdAt: new Date('2026-11-01T06:00:00Z'), ...o });

describe('buildCodingFunnel', () => {
  it('counts a stage in total and by the day it was reached', () => {
    const list = [
      cand({ calendlyLinkSent: 'Sent', calendlyLinkSentAt: new Date('2026-11-10T06:00:00Z') }),
      cand({ calendlyLinkSent: 'Sent', calendlyLinkSentAt: new Date('2026-11-10T09:00:00Z') }),
      cand({ calendlyLinkSent: 'Sent', calendlyLinkSentAt: new Date('2026-11-12T09:00:00Z') }),
      cand({})
    ];
    const r = buildCodingFunnel(list, { from: '2026-11-09', to: '2026-11-13', granularity: 'day', tzOffset: 0, now: NOW });
    const s = byKey(r).linkSent;
    expect(s.total).toBe(3);
    expect(s.inPeriod).toBe(3);
    expect(r.period.buckets).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    expect(s.series).toEqual([0, 2, 0, 1, 0]);
  });

  it('counts people who reached a stage before dates were tracked in the total but not in any period', () => {
    const list = [cand({ calendlyLinkStatus: 'Booked' }), cand({ calendlyLinkStatus: 'Booked', stageDates: { booked: new Date('2026-11-10T06:00:00Z') } })];
    const s = byKey(buildCodingFunnel(list, { from: '2026-11-01', to: '2026-11-30', tzOffset: 0, now: NOW })).booked;
    expect(s).toMatchObject({ total: 2, undated: 1, inPeriod: 1 });
  });

  it("uses the recruiter's day, not UTC (IST: 20:00 UTC on the 9th is already the 10th)", () => {
    const list = [cand({ calendlyLinkSent: 'Sent', calendlyLinkSentAt: new Date('2026-11-09T20:00:00Z') })];
    const r = buildCodingFunnel(list, { from: '2026-11-09', to: '2026-11-10', granularity: 'day', tzOffset: -330, now: NOW });
    expect(byKey(r).linkSent.series).toEqual([0, 1]);
    const utc = buildCodingFunnel(list, { from: '2026-11-09', to: '2026-11-10', granularity: 'day', tzOffset: 0, now: NOW });
    expect(byKey(utc).linkSent.series).toEqual([1, 0]);
  });

  it('includes both end days of the range and excludes the day after', () => {
    const list = [
      cand({ calendlyLinkSent: 'Sent', calendlyLinkSentAt: new Date('2026-11-09T00:00:00Z') }),
      cand({ calendlyLinkSent: 'Sent', calendlyLinkSentAt: new Date('2026-11-10T23:59:59Z') }),
      cand({ calendlyLinkSent: 'Sent', calendlyLinkSentAt: new Date('2026-11-11T00:00:00Z') })
    ];
    expect(byKey(buildCodingFunnel(list, { from: '2026-11-09', to: '2026-11-10', tzOffset: 0, now: NOW })).linkSent.inPeriod).toBe(2);
  });

  it('groups by week starting Monday and by month', () => {
    const r = buildCodingFunnel([], { from: '2026-11-09', to: '2026-11-25', granularity: 'week', tzOffset: 0, now: NOW });
    expect(r.period.buckets).toEqual(['2026-11-09', '2026-11-16', '2026-11-23']); // 9 Nov 2026 is a Monday
    const m = buildCodingFunnel([], { from: '2026-10-20', to: '2026-12-02', granularity: 'month', tzOffset: 0, now: NOW });
    expect(m.period.buckets).toEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('adds a "score in range" stage dated by when the resume was analysed', () => {
    const at = new Date('2026-11-10T06:00:00Z');
    const list = [
      cand({ score: { suitabilityRating: 6, scoredAt: at } }),
      cand({ score: { suitabilityRating: 2, scoredAt: at } }),
      cand({ score: { suitabilityRating: 10, scoredAt: at } })
    ];
    const r = buildCodingFunnel(list, { from: '2026-11-01', to: '2026-11-30', tzOffset: 0, scoreMin: '4', scoreMax: '10', now: NOW });
    expect(byKey(r).analysed.total).toBe(3);
    expect(byKey(r).scoreInRange).toMatchObject({ total: 2, inPeriod: 2 });
    expect(r.stages.map((s) => s.key).slice(0, 4)).toEqual(['imported', 'analysed', 'scoreInRange', 'linkSent']);
    // a reversed range is swapped, not empty
    expect(byKey(buildCodingFunnel(list, { from: '2026-11-01', to: '2026-11-30', tzOffset: 0, scoreMin: '10', scoreMax: '4', now: NOW })).scoreInRange.total).toBe(2);
  });

  it('breaks bookings down by calendar account, bootcamp passes by attempt and onboarding by project', () => {
    const d = new Date('2026-11-10T06:00:00Z');
    const list = [
      cand({ calendlyLinkStatus: 'Booked', calendlyAccount: 'Kartik Mishra', stageDates: { booked: d } }),
      cand({ calendlyLinkStatus: 'Booked', calendlyAccount: 'Kartik Mishra', stageDates: { booked: d } }),
      cand({ calendlyLinkStatus: 'Booked', calendlyAccount: 'Hiring Team', stageDates: { booked: d } }),
      cand({ calendlyLinkStatus: 'Booked' }),
      cand({ bootcampStatus: 'Pass', bootcampAttempts: 'Attempt 2' }),
      cand({ onboarding: 'Done', project: 'Prolific' }),
      cand({ onboarding: 'Done' }) // Done but no project: not "onboarded on a project"
    ];
    const r = buildCodingFunnel(list, { from: '2026-11-01', to: '2026-11-30', tzOffset: 0, now: NOW });
    expect(r.breakdowns.bookedByCalendar.map((b) => [b.label, b.total, b.inPeriod])).toEqual([
      ['Kartik Mishra', 2, 2], ['Hiring Team', 1, 1], ['Not recorded', 1, 0]
    ]);
    expect(r.breakdowns.bootcampPassedByAttempt).toEqual([{ label: 'Attempt 2', total: 1, undated: 1, inPeriod: 0 }]);
    expect(r.breakdowns.onboardedByProject.map((b) => [b.label, b.total])).toEqual([['Prolific', 1]]);
  });

  it('defaults to the last 30 days and rejects a backwards or absurdly long range', () => {
    const r = buildCodingFunnel([], { tzOffset: 0, now: NOW });
    expect(r.period.from).toBe('2026-10-27');
    expect(r.period.to).toBe('2026-11-25');
    expect(buildCodingFunnel([], { from: '2026-11-10', to: '2026-11-01', now: NOW }).error).toMatch(/before/);
    expect(buildCodingFunnel([], { from: '2020-01-01', to: '2026-11-01', granularity: 'day', now: NOW }).error).toMatch(/too long/);
  });
});
