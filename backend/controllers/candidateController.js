const Candidate = require('../models/Candidate');
const { buildHistoryEntries } = require('../utils/history');

// POST /api/candidates/apply
exports.applyCandidate = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Resume PDF is required.' });
    }

    const {
      fullName, email, phone, location, roleCode, employmentType,
      yearsOfExperience, ctcCurrent, ctcExpected, noticePeriod,
      skills, generalRemarks, source
    } = req.body;

    if (!fullName || !email || !phone || !roleCode || !yearsOfExperience) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    // Duplicate email check
    const existing = await Candidate.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A candidate with email "${email}" has already applied (Status: ${existing.status}).`
      });
    }

    const skillsArray = Array.isArray(skills)
      ? skills
      : (skills || '').split(',').map((s) => s.trim()).filter(Boolean);

    const candidate = await Candidate.create({
      fullName,
      email: email.toLowerCase().trim(),
      phone,
      location,
      roleCode: roleCode.toUpperCase().trim(),
      employmentType,
      yearsOfExperience: Number(yearsOfExperience),
      ctcCurrent: Number(ctcCurrent) || 0,
      ctcExpected: Number(ctcExpected) || 0,
      noticePeriod,
      skills: skillsArray,
      resumeUrl: `/uploads/resumes/${req.file.filename}`,
      generalRemarks,
      source: source || 'Website'
    });

    return res.status(201).json({ success: true, message: 'Application submitted successfully.', data: candidate });
  } catch (err) {
    if (err.message === 'ONLY_PDF_ALLOWED') {
      return res.status(400).json({ success: false, message: 'Only PDF files are allowed for resumes.' });
    }
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while submitting application.' });
  }
};

// GET /api/candidates?roleCode=&status=&minExperience=&maxExperience=
exports.getCandidates = async (req, res) => {
  try {
    const { roleCode, status, minExperience, maxExperience, source } = req.query;
    const filter = {};
    if (roleCode) filter.roleCode = roleCode.toUpperCase().trim();
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (minExperience || maxExperience) {
      filter.yearsOfExperience = {};
      if (minExperience) filter.yearsOfExperience.$gte = Number(minExperience);
      if (maxExperience) filter.yearsOfExperience.$lte = Number(maxExperience);
    }
    const candidates = await Candidate.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: candidates.length, data: candidates });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching candidates.' });
  }
};

// POST /api/candidates/:id/score
// POST /api/candidates/:id/score
// skillScore/experienceScore drive the suitability formula and pipeline `status`
// (unchanged). assessmentStatus is a SEPARATE field per SRD 3.8 — it tracks how
// the assessment itself is going (Not started/In progress/Selected/Not selected),
// independent of where the candidate sits in the overall hiring pipeline.
exports.scoreCandidate = async (req, res) => {
  try {
    const { skillScore, experienceScore, assessmentRemarks, assessmentStatus, status, changedBy } = req.body;
    if (skillScore == null || experienceScore == null) {
      return res.status(400).json({ success: false, message: 'skillScore and experienceScore are required (0-10).' });
    }
    if (skillScore < 0 || skillScore > 10 || experienceScore < 0 || experienceScore > 10) {
      return res.status(400).json({ success: false, message: 'Scores must be between 0 and 10.' });
    }
    const suitabilityRating = Number(((skillScore * 0.6) + (experienceScore * 0.4)).toFixed(1));
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found.' });

    const nextStatus = status || (candidate.status === 'Applied' ? 'Screened' : candidate.status);
    const nextAssessmentStatus = assessmentStatus || candidate.assessmentStatus;
    const changes = { status: nextStatus, assessmentStatus: nextAssessmentStatus };
    if (assessmentRemarks) changes.assessmentRemarks = assessmentRemarks;
    const newHistoryEntries = buildHistoryEntries(candidate, changes, changedBy);

    candidate.score = { skillScore, experienceScore, suitabilityRating, scoredAt: new Date() };
    if (assessmentRemarks) candidate.assessmentRemarks = assessmentRemarks;
    candidate.status = nextStatus;
    candidate.assessmentStatus = nextAssessmentStatus;
    candidate.history.push(...newHistoryEntries);
    candidate.updatedAt = new Date();
    await candidate.save();
    return res.status(200).json({ success: true, message: 'Candidate scored successfully.', data: candidate });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while scoring candidate.' });
  }
};

// PATCH /api/candidates/:id
// Generic field update (role reassignment, general remarks, manual status change,
// Slack group tag, etc.) — separate from scoreCandidate since not every edit
// involves re-scoring. Every changed tracked field is logged to candidate.history.
exports.updateCandidate = async (req, res) => {
  try {
    const { changedBy, ...changes } = req.body;
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found.' });

    const newHistoryEntries = buildHistoryEntries(candidate, changes, changedBy);
    Object.assign(candidate, changes);
    candidate.history.push(...newHistoryEntries);
    candidate.updatedAt = new Date();
    await candidate.save();

    return res.status(200).json({ success: true, message: 'Candidate updated.', data: candidate });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while updating candidate.' });
  }
};
// DELETE /api/candidates/:id
// Permanently removes a candidate record. Frontend confirms with the recruiter
// before calling this — there's no soft-delete/undo, so this is a hard delete.
exports.deleteCandidate = async (req, res) => {
  try {
    const candidate = await Candidate.findByIdAndDelete(req.params.id);
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found.' });
    return res.status(200).json({ success: true, message: `${candidate.fullName} removed from the candidate pool.` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while deleting candidate.' });
  }
};
// POST /api/candidates/:id/interview-stage
// Records the outcome of the candidate's NEXT stage (determined by the role's
// interviewStages list and how many stages this candidate has already completed).
// Per SRD 3.9: stages/scorecards are internal-only; after each stage, the
// candidate is auto-emailed a status update with a short feedback summary —
// never the scorecard itself. Email is best-effort and never blocks saving.
exports.recordInterviewStage = async (req, res) => {
  try {
    const { interviewer, rating, feedback, changedBy } = req.body;
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found.' });

    const Role = require('../models/Role');
    const role = await Role.findOne({ code: candidate.roleCode });
    const stages = role ? role.interviewStages : ['Recruiter Screen', 'Technical', 'Hiring Manager'];

    const completedCount = candidate.interviewProgress.length;
    if (completedCount >= stages.length) {
      return res.status(400).json({ success: false, message: 'All interview stages already completed for this role.' });
    }
    const stageName = stages[completedCount];

    candidate.interviewProgress.push({
      stageName,
      interviewer: interviewer || '',
      rating: rating != null ? Number(rating) : undefined,
      feedback: feedback || '',
      completedAt: new Date()
    });
    candidate.history.push({
      field: 'interviewStage',
      oldValue: '',
      newValue: stageName,
      changedBy: changedBy || 'Recruiter',
      changedAt: new Date()
    });
    candidate.updatedAt = new Date();
    await candidate.save();

    // Best-effort candidate notification — never blocks the save above.
    let emailResult = { sent: false, reason: 'Email not attempted.' };
    try {
      const { sendOutreachEmails } = require('../services/emailService');
      const results = await sendOutreachEmails(
        [{ email: candidate.email, vars: { candidateName: candidate.fullName, roleTitle: role ? role.title : candidate.roleCode, roleCode: candidate.roleCode } }],
        `Update on your application — {{roleTitle}}`,
        `Hi {{candidateName}},\n\nThanks for completing the "${stageName}" stage for {{roleTitle}} ({{roleCode}}). ${feedback ? `Quick note from the interviewer: ${feedback}` : 'Our team will follow up on next steps soon.'}\n\nBest regards,\nBizTech Analytics Talent Team`
      );
      emailResult = results[0] || emailResult;
    } catch (err) {
      emailResult = { sent: false, reason: err.message };
    }

    return res.status(200).json({
      success: true,
      message: `Recorded "${stageName}" stage.${emailResult.sent ? ' Candidate notified by email.' : ''}`,
      data: candidate,
      email: emailResult
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while recording interview stage.' });
  }
};