const Candidate = require('../models/Candidate');
const { STAGES, STAGE_FIELDS, stageDate } = require('../utils/stageDates');

// GET /api/statistics/coding-funnel — Statistics & Report -> Coding.
// How many coding candidates reached each stage of the pipeline, in total and by the date they reached it.
//   from, to       YYYY-MM-DD, the recruiter's local days, inclusive (default: the last 30 days)
//   granularity    day | week (Mon-Sun) | month — how the period is split into columns
//   tzOffset       the browser's Date.getTimezoneOffset() in minutes, so "a day" means the recruiter's day
//   scoreMin/Max   the Resume Analyzer score range for the "score in range" stage (default 4-10)
//   roleCode       optional role code, calendarAccount optional Calendly account ('Unknown' = not recorded)
// A stage count never needs a date: `total` is everyone who reached it, `undated` is those who reached it before
// dates were tracked (they appear in the total but cannot be placed in a period).

const CODING_TYPES = ['FREELANCE CODING', 'Contract', 'Freelance', 'Freelance/Contract'];
const DAY = 24 * 60 * 60 * 1000;
const MAX_BUCKETS = 400;
const pad = (n) => String(n).padStart(2, '0');

// A YYYY-MM-DD string -> the UTC ms of that calendar day's start, as a "local time stored in UTC" value.
const dayStart = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
const ymdOf = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const isYmd = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

// The bucket (column) a local day-start belongs to.
function bucketOf(localMs, granularity) {
  const d = new Date(localMs);
  if (granularity === 'month') return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  if (granularity === 'week') {
    const back = (d.getUTCDay() + 6) % 7; // Monday = 0
    return ymdOf(localMs - back * DAY);
  }
  return ymdOf(localMs);
}

function listBuckets(fromYmd, toYmd, granularity) {
  const out = []; const seen = new Set();
  for (let t = dayStart(fromYmd); t <= dayStart(toYmd); t += DAY) {
    const key = bucketOf(t, granularity);
    if (!seen.has(key)) { seen.add(key); out.push(key); }
  }
  return out;
}

function defaultPeriod(tzOffset, now = new Date()) {
  const today = ymdOf(now.getTime() - tzOffset * 60000);
  return { from: ymdOf(dayStart(today) - 29 * DAY), to: today };
}

// candidates: lean candidate records. Returns the response body (without `success`).
function buildCodingFunnel(candidates, opts = {}) {
  const tzOffset = Number.isFinite(Number(opts.tzOffset)) ? Number(opts.tzOffset) : 0;
  const granularity = ['day', 'week', 'month'].includes(opts.granularity) ? opts.granularity : 'day';
  const def = defaultPeriod(tzOffset, opts.now);
  const from = isYmd(opts.from) ? opts.from : def.from;
  const to = isYmd(opts.to) ? opts.to : def.to;
  const scoreMin = opts.scoreMin === undefined || opts.scoreMin === '' ? 4 : Number(opts.scoreMin);
  const scoreMax = opts.scoreMax === undefined || opts.scoreMax === '' ? 10 : Number(opts.scoreMax);
  const [lo, hi] = scoreMin > scoreMax ? [scoreMax, scoreMin] : [scoreMin, scoreMax];

  const buckets = listBuckets(from, to, granularity);
  if (buckets.length === 0 || buckets.length > MAX_BUCKETS) {
    return { error: buckets.length === 0 ? 'The end date is before the start date.' : `That range is too long to split by ${granularity}; use a larger step or a shorter range.` };
  }
  const startMs = dayStart(from) + tzOffset * 60000; // local midnight of `from`, as a real instant
  const endMs = dayStart(to) + DAY + tzOffset * 60000;
  const index = new Map(buckets.map((b, i) => [b, i]));

  // Stage list for the report: the real stages, plus "score in range" straight after "analysed".
  const scoreOf = (c) => (c.score && c.score.suitabilityRating !== null && c.score.suitabilityRating !== undefined ? Number(c.score.suitabilityRating) : null);
  const reportStages = [];
  for (const s of STAGES) {
    reportStages.push(s);
    if (s.key === 'analysed') {
      reportStages.push({
        key: 'scoreInRange', label: `Resume score in range (${lo}–${hi})`,
        test: (c) => { const v = scoreOf(c); return v !== null && v >= lo && v <= hi; },
        date: (c) => stageDate(c, 'analysed')
      });
    }
  }

  const tally = (list, test, dateOf) => {
    const row = { total: 0, undated: 0, inPeriod: 0, series: new Array(buckets.length).fill(0) };
    for (const c of list) {
      if (!test(c)) continue;
      row.total += 1;
      const d = dateOf(c);
      if (!d) { row.undated += 1; continue; }
      const t = d.getTime();
      if (t < startMs || t >= endMs) continue;
      row.inPeriod += 1;
      const i = index.get(bucketOf(dayStart(ymdOf(t - tzOffset * 60000)), granularity));
      if (i !== undefined) row.series[i] += 1;
    }
    return row;
  };

  const stages = reportStages.map((s) => ({ key: s.key, label: s.label, ...tally(candidates, s.test, s.date || ((c) => stageDate(c, s))) }));

  const stageByKey = Object.fromEntries(STAGES.map((s) => [s.key, s]));
  const breakdown = (stageKey, labelOf) => {
    const groups = new Map();
    for (const c of candidates) if (stageByKey[stageKey].test(c)) {
      const label = labelOf(c);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(c);
    }
    return [...groups.entries()]
      .map(([label, list]) => { const r = tally(list, () => true, (c) => stageDate(c, stageKey)); return { label, total: r.total, undated: r.undated, inPeriod: r.inPeriod }; })
      .sort((a, b) => b.total - a.total);
  };

  return {
    period: { from, to, granularity, buckets },
    scoreRange: { min: lo, max: hi },
    scope: { candidates: candidates.length },
    stages,
    breakdowns: {
      bookedByCalendar: breakdown('booked', (c) => c.calendlyAccount || 'Not recorded'),
      bootcampPassedByAttempt: breakdown('bootcampPassed', (c) => c.bootcampAttempts || 'Attempt not set'),
      onboardedByProject: breakdown('onboarded', (c) => c.project)
    }
  };
}

exports.buildCodingFunnel = buildCodingFunnel;

exports.getCodingFunnel = async (req, res) => {
  try {
    const { roleCode, calendarAccount } = req.query;
    // Coding candidates = a freelance/contract employment type, or an F-prefixed role code (the freelance rule).
    const filter = { $or: [{ employmentType: { $in: CODING_TYPES } }, { roleCode: /^F/i }] };
    if (roleCode) filter.roleCode = String(roleCode).toUpperCase().trim();
    if (calendarAccount) filter.calendlyAccount = calendarAccount === 'Unknown' ? { $in: [null, ''] } : calendarAccount;
    const candidates = await Candidate.find(filter, `${STAGE_FIELDS} calendlyAccount`).lean();
    const result = buildCodingFunnel(candidates, req.query);
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    return res.status(200).json({ success: true, message: 'Coding funnel.', data: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while building the coding funnel.' });
  }
};
