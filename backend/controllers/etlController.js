const Candidate = require('../models/Candidate');
const Role = require('../models/Role');
const ImportReview = require('../models/ImportReview');
const EtlRun = require('../models/EtlRun');
const drive = require('../services/googleDriveService');
const { runNaukriEtl, validateRow } = require('../services/naukriEtlService');

const CRON_SCHEDULE_DESCRIPTION = 'Daily at 9:00 AM server time';

// GET /api/etl/status
// Reports config + last-run state without running anything — powers the
// status card at the top of the Import Review tab.
exports.getStatus = async (req, res) => {
  try {
    const [lastRun, pendingReviewCount] = await Promise.all([
      EtlRun.findOne().sort({ createdAt: -1 }),
      ImportReview.countDocuments({ status: 'pending' })
    ]);
    return res.status(200).json({
      success: true,
      data: {
        enabled: process.env.ETL_ENABLED === 'true',
        driveConfigured: drive.isConfigured(),
        driveConfigReason: drive.isConfigured() ? null : drive.configurationReason(),
        schedule: CRON_SCHEDULE_DESCRIPTION,
        lastRun,
        pendingReviewCount
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching ETL status.' });
  }
};

// POST /api/etl/run
// Manually triggers the same pipeline the daily cron runs — useful for
// testing, or to pull today's CSV in without waiting for 9am.
exports.runNow = async (req, res) => {
  try {
    const result = await runNaukriEtl({ triggeredBy: 'manual' });
    return res.status(200).json({ success: true, message: result.message || result.reason || 'Run complete.', data: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while running the ETL pipeline.' });
  }
};

// GET /api/etl/reviews?status=pending (default: pending)
exports.listReviews = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const reviews = await ImportReview.find({ status }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: reviews.length, data: reviews });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching import reviews.' });
  }
};

// POST /api/etl/reviews/:id/approve
// Body: { rawData: { ...edited fields }, changedBy }
// Merges any recruiter edits onto the stored row, re-runs the exact same
// validation the ETL pipeline used, and only creates the Candidate if it now
// passes. If it still doesn't (or the email now collides with an existing
// candidate), the edits are saved back onto the review and the reasons are
// returned so the recruiter can fix it again — the row stays pending either way.
exports.approveReview = async (req, res) => {
  try {
    const { rawData, changedBy } = req.body;
    const review = await ImportReview.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Import review row not found.' });
    if (review.status !== 'pending') {
      return res.status(400).json({ success: false, message: `This row was already ${review.status}.` });
    }

    if (rawData) review.rawData = { ...review.rawData, ...rawData };

    const roles = await Role.find({}, 'code');
    const knownRoleCodes = new Set(roles.map((r) => r.code));
    const result = validateRow(review.rawData, knownRoleCodes);

    if (!result.ok) {
      await review.save();
      return res.status(400).json({ success: false, message: 'Row still has validation errors.', data: { reasons: result.reasons } });
    }

    const existing = await Candidate.findOne({ email: result.candidate.email });
    if (existing) {
      await review.save();
      return res.status(409).json({
        success: false,
        message: `A candidate with email "${result.candidate.email}" already exists (Status: ${existing.status}).`
      });
    }

    const candidate = await Candidate.create(result.candidate);
    review.status = 'approved';
    review.resolvedCandidateId = candidate._id;
    review.resolvedBy = changedBy || 'Recruiter';
    review.resolvedAt = new Date();
    review.rawData = {};
    await review.save();

    return res.status(200).json({ success: true, message: `${candidate.fullName} added to the candidate pool.`, data: { review, candidate } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while approving import review row.' });
  }
};

// POST /api/etl/reviews/:id/dismiss
// Discards a flagged row without creating a candidate (e.g. junk data, a
// confirmed duplicate that shouldn't be re-added).
exports.dismissReview = async (req, res) => {
  try {
    const { changedBy } = req.body;
    const review = await ImportReview.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Import review row not found.' });
    if (review.status !== 'pending') {
      return res.status(400).json({ success: false, message: `This row was already ${review.status}.` });
    }

    review.status = 'dismissed';
    review.resolvedBy = changedBy || 'Recruiter';
    review.resolvedAt = new Date();
    review.rawData = {};
    await review.save();

    return res.status(200).json({ success: true, message: 'Row dismissed.', data: review });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while dismissing import review row.' });
  }
};
