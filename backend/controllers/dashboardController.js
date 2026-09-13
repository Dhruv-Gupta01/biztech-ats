const Candidate = require('../models/Candidate');
const Role = require('../models/Role');

const STATUS_ORDER = [
  'Naukri Response',
  'Information Form',
  'Interview 1',
  'Interview 1 Shortlisted',
  'Interview 2',
  'Interview 2 Shortlisted',
  'Assessment 1',
  'Assessment 1 Shortlisted',
  'Assessment 1 Passed',
  'Assessment 2',
  'Assessment 2 Shortlisted',
  'Assessment 2 Passed',
  'Final Round Shortlisted',
  'Selected',
  'Rejected'
];
const STATUS_COLORS = {
  'Naukri Response': '#6B7280',
  'Information Form': 'var(--blue)',
  'Interview 1': 'var(--amber)',
  'Interview 1 Shortlisted': 'var(--purple)',
  'Interview 2': 'var(--amber)',
  'Interview 2 Shortlisted': 'var(--purple)',
  'Assessment 1': 'var(--blue)',
  'Assessment 1 Shortlisted': 'var(--purple)',
  'Assessment 1 Passed': 'var(--green)',
  'Assessment 2': 'var(--blue)',
  'Assessment 2 Shortlisted': 'var(--purple)',
  'Assessment 2 Passed': 'var(--green)',
  'Final Round Shortlisted': 'var(--green)',
  Selected: 'var(--green)',
  Rejected: 'var(--red)'
};
const SOURCE_PALETTE = ['var(--blue)', 'var(--purple)', 'var(--amber)', 'var(--green)', '#6B7280', 'var(--red)'];
const STALE_DAYS_THRESHOLD = 7;
const STALE_EXCLUDED_STATUSES = ['Selected', 'Rejected']; // candidates in a final state are never "stale"

// GET /api/dashboard/metrics?roleCode=BTA-ENG-01 (roleCode optional — scopes the whole dashboard to one role)
// Computes everything the Dashboard tab shows, live from the Candidate/Role
// collections — no stored/cached snapshot, so it reflects the DB the instant
// this endpoint is called (frontend re-fetches on mount, on Refresh, and on role change).
exports.getMetrics = async (req, res) => {
  try {
    const { roleCode } = req.query;

    const [allCandidates, roles] = await Promise.all([
      Candidate.find().sort({ updatedAt: -1, createdAt: -1 }),
      Role.find()
    ]);

    // openRoles is a global count regardless of scope — it describes the org's roles, not this one role's candidates.
    const openRoles = roles.filter((r) => r.status === 'Open').length;

    const candidates = roleCode
      ? allCandidates.filter((c) => c.roleCode === roleCode.toUpperCase().trim())
      : allCandidates;

    const total = candidates.length;
    const scored = candidates.filter((c) => c.score && c.score.suitabilityRating != null);
    const avgSuitability = scored.length
      ? Number((scored.reduce((sum, c) => sum + c.score.suitabilityRating, 0) / scored.length).toFixed(1))
      : null;
    const hiredCount = candidates.filter((c) => c.status === 'Selected').length;

    const overallFunnel = STATUS_ORDER.map((status) => ({
      label: status,
      count: candidates.filter((c) => c.status === status).length,
      color: STATUS_COLORS[status]
    }));

    const roleTitle = (code) => {
      const r = roles.find((r) => r.code === code);
      return r ? r.title : code;
    };

    const roleCodes = [...new Set(candidates.map((c) => c.roleCode))];
    const perRolePipeline = roleCodes.map((code) => ({
      roleCode: code,
      roleTitle: roleTitle(code),
      stages: STATUS_ORDER.map((status) => ({
        label: status,
        count: candidates.filter((c) => c.roleCode === code && c.status === status).length,
        color: STATUS_COLORS[status]
      }))
    }));

    const recentActivity = candidates.slice(0, 8).map((c) => ({
      id: c._id,
      text: `${c.fullName} is ${c.status} for ${c.roleCode}`,
      color: STATUS_COLORS[c.status] || '#6B7280',
      time: (c.updatedAt || c.createdAt) ? new Date(c.updatedAt || c.createdAt).toLocaleDateString() : ''
    }));

    // Source breakdown — which channels are actually producing candidates (Form / Job Board / Referral / Manual / CSV Import etc.)
    const sourceCounts = {};
    candidates.forEach((c) => {
      const src = c.source || 'Unknown';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    });
    const sourceBreakdown = Object.keys(sourceCounts).map((src, i) => ({
      label: src,
      count: sourceCounts[src],
      color: SOURCE_PALETTE[i % SOURCE_PALETTE.length]
    }));

    // Stale candidates — still in an active (non-final) status, untouched for 7+ days.
    const now = Date.now();
    const staleCandidates = candidates
      .filter((c) => !STALE_EXCLUDED_STATUSES.includes(c.status))
      .map((c) => {
        const lastTouched = new Date(c.updatedAt || c.createdAt).getTime();
        const daysSinceUpdate = Math.floor((now - lastTouched) / (1000 * 60 * 60 * 24));
        return { id: c._id, fullName: c.fullName, roleCode: c.roleCode, status: c.status, daysSinceUpdate };
      })
      .filter((c) => c.daysSinceUpdate >= STALE_DAYS_THRESHOLD)
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

    return res.status(200).json({
      success: true,
      data: {
        total, avgSuitability, hiredCount, openRoles,
        overallFunnel, perRolePipeline, recentActivity,
        sourceBreakdown, staleCandidates,
        scopedToRoleCode: roleCode ? roleCode.toUpperCase().trim() : null
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while computing dashboard metrics.' });
  }
};