const { STAGES, reachedKeys, stageDate, newlyReachedUndated } = require('../../utils/stageDates');

const NOW = new Date('2026-11-25T10:00:00Z');

describe('reachedKeys', () => {
  it('maps record fields to the funnel stages', () => {
    const c = {
      score: { suitabilityRating: 6 }, calendlyLinkSent: 'Sent', calendlyLinkStatus: 'Booked',
      screeningInterview: 'Pass', ndaIca: 'Signed', slackStatus: 'Joined', bootcampAttempts: 'Attempt 2',
      bootcampStatus: 'Pass', onboarding: 'Done', project: 'Prolific'
    };
    expect(reachedKeys(c)).toEqual([
      'imported', 'analysed', 'linkSent', 'booked', 'interviewPassed', 'ndaSent', 'slackInvited',
      'ndaSigned', 'slackJoined', 'bootcampAttempted', 'bootcampPassed', 'onboarded'
    ]);
  });
  it('needs BOTH onboarding Done and a project for onboarded', () => {
    expect(reachedKeys({ onboarding: 'Done' })).not.toContain('onboarded');
    expect(reachedKeys({ project: 'Prolific' })).not.toContain('onboarded');
    expect(reachedKeys({ onboarding: 'Done', project: 'Prolific' })).toContain('onboarded');
  });
  it('counts only the orientation values that mean attempted / interested', () => {
    expect(reachedKeys({ bootcampOrientation: 'Not attempted', orientationInterest: 'Not interested' })).toEqual(['imported']);
    expect(reachedKeys({ bootcampOrientation: 'Attempted', orientationInterest: 'Interested' })).toEqual(['imported', 'orientation', 'interested']);
  });
  it('counts anyone who went through the bootcamp as attempted, not those who skipped it', () => {
    for (const bootcampStatus of ['Active', 'Pass', 'Fail', 'Full Fail']) expect(reachedKeys({ bootcampStatus })).toContain('bootcampAttempted');
    expect(reachedKeys({ bootcampAttempts: 'Attempt 1' })).toContain('bootcampAttempted');
    expect(reachedKeys({ bootcampStatus: 'Direct to client' })).not.toContain('bootcampAttempted');
    expect(reachedKeys({ bootcampStatus: 'Not Active' })).not.toContain('bootcampAttempted');
  });
  it('treats a score of 0 as analysed but a missing score as not', () => {
    expect(reachedKeys({ score: { suitabilityRating: 0 } })).toContain('analysed');
    expect(reachedKeys({ score: { suitabilityRating: null } })).not.toContain('analysed');
  });
});

describe('stageDate', () => {
  it('prefers the stamped date and falls back to the older fields', () => {
    const created = new Date('2026-11-01T00:00:00Z');
    expect(stageDate({ createdAt: created }, 'imported')).toEqual(created);
    expect(stageDate({ calendlyLinkSentAt: created }, 'linkSent')).toEqual(created);
    expect(stageDate({ calendlyLinkSentAt: created, stageDates: { linkSent: NOW } }, 'linkSent')).toEqual(NOW);
  });
  it('is null when a reached stage has no date (reached before tracking)', () => {
    expect(stageDate({ calendlyLinkStatus: 'Booked' }, 'booked')).toBeNull();
  });
});

describe('newlyReachedUndated', () => {
  it('stamps only stages reached by this change', () => {
    const before = { calendlyLinkSent: 'Sent', calendlyLinkSentAt: NOW };
    const after = { ...before, calendlyLinkStatus: 'Booked' };
    expect(newlyReachedUndated(before, after, NOW)).toEqual({ 'stageDates.booked': NOW });
  });
  it('does not invent dates for stages the record already had (old data)', () => {
    const old = { calendlyLinkStatus: 'Booked' };
    expect(newlyReachedUndated(old, { ...old, generalRemarks: 'edited' }, NOW)).toEqual({});
  });
  it('does not overwrite a date that was already stamped', () => {
    const before = {};
    const after = { calendlyLinkStatus: 'Booked', stageDates: { booked: new Date('2026-11-02T00:00:00Z') } };
    expect(newlyReachedUndated(before, after, NOW)).toEqual({});
  });
  it('dates every stage a new record already satisfies', () => {
    const r = newlyReachedUndated(null, { ndaIca: 'Sent', slackStatus: 'Invited' }, NOW);
    expect(r).toEqual({ 'stageDates.ndaSent': NOW, 'stageDates.slackInvited': NOW });
  });
});

describe('STAGES', () => {
  it('has unique keys', () => {
    expect(new Set(STAGES.map((s) => s.key)).size).toBe(STAGES.length);
  });
});
