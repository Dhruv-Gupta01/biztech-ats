// The coding-candidate funnel (Statistics & Report -> Coding), in order, and how a candidate's record says
// they reached each stage. Shared by the schema (which date fields exist), the save hook (which stamps the
// date a stage is first reached) and the statistics endpoint (which counts them).
//
// Dates: Candidate.stageDates.<key> holds the first time a stage was reached, stamped from the moment this
// tracking existed. Three stages already had a usable date and use it as a fallback instead
// (imported = createdAt, analysed = score.scoredAt, linkSent = calendlyLinkSentAt). Anyone who reached a stage
// before tracking began and has no fallback date is "undated": counted in the total, never in a date range.

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

const STAGES = [
  { key: 'imported', label: 'Imported', test: () => true, fallback: (c) => c.createdAt },
  { key: 'analysed', label: 'Resume analysed', test: (c) => num(c.score && c.score.suitabilityRating) !== null, fallback: (c) => c.score && c.score.scoredAt },
  { key: 'linkSent', label: 'Calendly link sent', test: (c) => c.calendlyLinkSent === 'Sent', fallback: (c) => c.calendlyLinkSentAt },
  { key: 'booked', label: 'Link booked', test: (c) => c.calendlyLinkStatus === 'Booked' },
  { key: 'interviewPassed', label: 'Selected for bootcamp (interview pass)', test: (c) => c.screeningInterview === 'Pass' },
  { key: 'ndaSent', label: 'NDA/ICA sent', test: (c) => ['Sent', 'Signed', 'Not Signed', 'Doubt'].includes(c.ndaIca) },
  { key: 'slackInvited', label: 'Slack invited', test: (c) => ['Invited', 'Joined', 'Not Joined'].includes(c.slackStatus) },
  { key: 'ndaSigned', label: 'NDA/ICA accepted', test: (c) => c.ndaIca === 'Signed' },
  { key: 'slackJoined', label: 'Slack accepted', test: (c) => c.slackStatus === 'Joined' },
  { key: 'orientation', label: 'Bootcamp orientation attempted', test: (c) => c.bootcampOrientation === 'Attempted' },
  { key: 'interested', label: 'Interested after orientation', test: (c) => c.orientationInterest === 'Interested' },
  // Anyone who went through the bootcamp: an attempt number, or a status of Active / Pass / Fail / Full Fail.
  // 'Direct to client' (skipped it) and 'Not Active' are not counted.
  { key: 'bootcampAttempted', label: 'Bootcamp attempted', test: (c) => Boolean(c.bootcampAttempts) || ['Active', 'Pass', 'Fail', 'Full Fail'].includes(c.bootcampStatus) },
  { key: 'bootcampPassed', label: 'Bootcamp passed', test: (c) => c.bootcampStatus === 'Pass' },
  { key: 'onboarded', label: 'Onboarded on a project', test: (c) => c.onboarding === 'Done' && Boolean(c.project) }
];

// Fields a stage depends on: the save hook loads only these to compare before / after.
const STAGE_FIELDS = 'score calendlyLinkSent calendlyLinkSentAt calendlyLinkStatus screeningInterview ndaIca slackStatus '
  + 'bootcampAttempts bootcampStatus bootcampOrientation orientationInterest onboarding project stageDates createdAt';

const reachedKeys = (c) => STAGES.filter((s) => s.test(c || {})).map((s) => s.key);

// The date a candidate reached `stage`, or null when it is unknown (reached before tracking, or never).
function stageDate(c, stage) {
  const s = typeof stage === 'string' ? STAGES.find((x) => x.key === stage) : stage;
  const own = c && c.stageDates && c.stageDates[s.key];
  const d = own || (s.fallback && s.fallback(c || {})) || null;
  const t = d ? new Date(d) : null;
  return t && !Number.isNaN(t.getTime()) ? t : null;
}

// Stages `after` has reached that `before` had not, and that have no date yet: these get `now`.
// `before` = null means a brand-new record, so every stage it already satisfies is dated now.
function newlyReachedUndated(before, after, now = new Date()) {
  const was = new Set(before ? reachedKeys(before) : []);
  const set = {};
  for (const s of STAGES) {
    if (s.key === 'imported' || !s.test(after) || was.has(s.key)) continue;
    if (stageDate(after, s)) continue;
    set[`stageDates.${s.key}`] = now;
  }
  return set;
}

module.exports = { STAGES, STAGE_FIELDS, reachedKeys, stageDate, newlyReachedUndated };
