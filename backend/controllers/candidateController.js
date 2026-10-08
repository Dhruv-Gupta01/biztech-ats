const Candidate = require('../models/Candidate');
const Role = require('../models/Role');
const { buildHistoryEntries } = require('../utils/history');
const { parseResumeText } = require('../utils/resumeParser');

const STOP_WORDS = new Set([
  'the','and','for','with','that','this','have','from','they','will','would','there','their','what','about','which',
  'when','make','can','like','time','just','know','take','people','into','year','also','your','good','some','could',
  'them','other','than','then','look','only','come','over','think','also','back','after','use','two','how','our',
  'work','first','well','way','even','new','want','because','any','these','give','day','most','used','through',
  'being','position','team','role','join','work','working','looking','candidate','skills','experience','required',
  'preferred','qualifications','responsibilities','requirements','job','description','apply','click','send','email',
  'contact','resume','cv','profile','company','opportunity','opportunities','career','careers','location','locations'
]);

function extractKeywords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function analyzeMatch(candidate, role) {
  const desc = role.description || '';
  const descLower = desc.toLowerCase();
  const candidateSkills = (candidate.skills || []).map((s) => s.toLowerCase());
  const candidateLocation = (candidate.location || '').toLowerCase().trim();
  const candidateEmpType = (candidate.employmentType || '').toLowerCase();
  const roleEmpType = (role.empType || '').toLowerCase();
  const candidateExp = Number(candidate.yearsOfExperience) || 0;
  const ctcCurrent = Number(candidate.ctcCurrent) || 0;
  const ctcExpected = Number(candidate.ctcExpected) || 0;

  const descKeywords = extractKeywords(desc);
  const uniqueDescKeywords = [...new Set(descKeywords)];

  const matchedSkills = candidateSkills.filter((skill) =>
    uniqueDescKeywords.some((kw) => skill.includes(kw) || kw.includes(skill))
  );

  const skillsScore = candidateSkills.length > 0 ? Math.round((matchedSkills.length / candidateSkills.length) * 40) : 0;

  const locationScore = candidateLocation && descLower.includes(candidateLocation) ? 20 : candidateLocation ? 5 : 10;

  const empScore = candidateEmpType && roleEmpType && candidateEmpType === roleEmpType ? 20 : 0;

  let requiredExp = 2;
  if (descLower.includes('senior') || descLower.includes('lead') || descLower.includes('manager') || descLower.includes('head')) requiredExp = 5;
  else if (descLower.includes('mid') || descLower.includes('intermediate')) requiredExp = 3;
  else if (descLower.includes('junior') || descLower.includes('entry') || descLower.includes('fresher') || descLower.includes('intern')) requiredExp = 1;

  const expDiff = Math.abs(candidateExp - requiredExp);
  const expScore = expDiff === 0 ? 20 : expDiff <= 1 ? 15 : expDiff <= 2 ? 10 : expDiff <= 3 ? 5 : 0;

  let ctcScore = 10;
  if (ctcCurrent > 0 && ctcExpected > 0) {
    const hike = (ctcExpected - ctcCurrent) / ctcCurrent;
    if (hike < 0) ctcScore = 0;
    else if (hike > 1) ctcScore = 2;
    else if (hike > 0.6) ctcScore = 5;
    else if (hike > 0.3) ctcScore = 8;
    else ctcScore = 10;
  } else if (ctcExpected === 0 && ctcCurrent === 0) {
    ctcScore = 5;
  }

  const total = Math.min(100, skillsScore + locationScore + empScore + expScore + ctcScore);
  const rating = Number((total / 10).toFixed(1));

  return {
    score: Math.min(10, rating),
    breakdown: {
      skills: { matched: matchedSkills.length, total: candidateSkills.length, score: skillsScore, max: 40 },
      location: { match: candidateLocation && descLower.includes(candidateLocation), score: locationScore, max: 20 },
      employmentType: { match: candidateEmpType === roleEmpType, score: empScore, max: 20 },
      experience: { candidate: candidateExp, required: requiredExp, score: expScore, max: 20 },
      ctc: { current: ctcCurrent, expected: ctcExpected, score: ctcScore, max: 10 }
    },
    maxScore: 10
  };
}

// POST /api/candidates/:id/analyze
// Compares candidate profile against the linked role description and returns
// an automated match score (0-10) plus a per-criterion breakdown.
exports.analyzeCandidate = async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found.' });
    }

    const role = await Role.findOne({ code: candidate.roleCode });
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found for candidate\'s role code.' });
    }

    const result = analyzeMatch(candidate, role);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while analyzing candidate.' });
  }
};

exports.analyzeBulk = async (req, res) => {
  try {
    const { candidateIds } = req.body;
    if (!candidateIds || candidateIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select candidates to analyze.' });
    }

    const candidates = await Candidate.find({ _id: { $in: candidateIds } }).sort({ createdAt: -1 });
    if (candidates.length === 0) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    const roleCodes = [...new Set(candidates.map((c) => (c.roleCode || '').toUpperCase().trim()))];
    if (roleCodes.length === 0 || roleCodes[0] === '' || roleCodes.length > 1) {
      const found = roleCodes.filter((r) => r !== '').join(', ') || 'none';
      return res.status(400).json({ success: false, message: `Selected candidates must belong to the same role code for analysis. Found: ${found}.` });
    }

    const roleCode = roleCodes[0];
    const role = await Role.findOne({ code: roleCode });
    if (!role || !role.description) {
      return res.status(400).json({ success: false, message: `No job description found for role code: ${roleCode}. Please add a description to the role first.` });
    }

    const { scoreResumes } = require('../services/resumeAnalyzerService');
    const resumes = candidates
      .filter((c) => c.resumeText)
      .map((c) => ({ id: c._id.toString(), resume_text: c.resumeText }));

    if (resumes.length === 0) {
      return res.status(200).json({ success: true, count: 0, data: [], message: 'No resume text available for selected candidates. Ensure resumes were uploaded/parsed.' });
    }

    try {
      const results = await scoreResumes(role.description, resumes);
      const data = results.map((r) => ({
        candidateId: r.id,
        score: r.error ? null : Number((r.result.score / 10).toFixed(1)),
        error: r.error
      }));

      return res.status(200).json({ success: true, count: data.length, data });
    } catch (analyzerErr) {
      console.error('Resume analyzer service error:', analyzerErr);
      return res.status(500).json({ success: false, message: `Resume analyzer failed: ${analyzerErr.message}` });
    }
  } catch (err) {
    console.error('Bulk analyze error:', err);
    return res.status(500).json({ success: false, message: 'Server error while bulk analyzing candidates.' });
  }
};

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

    let resumeText = '';
    let parsedData = {};
    try {
      parsedData = await parseResumeText(req.file.buffer);
      resumeText = parsedData.resumeText || '';
    } catch (err) {
      console.error('Failed to parse resume PDF for text extraction:', err.message);
    }

    const candidate = await Candidate.create({
      fullName: fullName || parsedData.fullName,
      email: (email || parsedData.email || '').toLowerCase().trim(),
      phone: phone || parsedData.phone || '',
      location: location || parsedData.location || '',
      roleCode: (roleCode || '').toUpperCase().trim(),
      employmentType: employmentType || parsedData.employmentType || 'Full-Time',
      yearsOfExperience: Number(yearsOfExperience) || parsedData.yearsOfExperience || 0,
      ctcCurrent: Number(ctcCurrent) || parsedData.ctcCurrent || 0,
      ctcExpected: Number(ctcExpected) || parsedData.ctcExpected || 0,
      noticePeriod: noticePeriod || parsedData.noticePeriod || '',
      skills: skillsArray.length > 0 ? skillsArray : parsedData.skills || [],
      resumeData: req.file.buffer,
      resumeText,
      generalRemarks,
      source: source || 'Website'
    });
    candidate.resumeUrl = `/api/candidates/${candidate._id}/resume`;
    await candidate.save();

    return res.status(201).json({ success: true, message: 'Application submitted successfully.', data: candidate });
  } catch (err) {
    if (err.message === 'ONLY_PDF_ALLOWED') {
      return res.status(400).json({ success: false, message: 'Only PDF files are allowed for resumes.' });
    }
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while submitting application.' });
  }
};

// GET /api/candidates?roleCode=&status=&minExperience=&maxExperience=&source=&employmentType=
exports.getCandidates = async (req, res) => {
  try {
    const { roleCode, status, minExperience, maxExperience, source, employmentType } = req.query;
    const filter = {};
    if (roleCode) filter.roleCode = roleCode.toUpperCase().trim();
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (employmentType) filter.employmentType = employmentType;
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

    const nextStatus = status || (candidate.status === 'Naukri Response' ? 'Information Form Response' : candidate.status);
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
// Slack channel tag, etc.) — separate from scoreCandidate since not every edit
// involves re-scoring. Every changed tracked field is logged to candidate.history.
exports.updateCandidate = async (req, res) => {
  try {
    const { changedBy, ...changes } = req.body;
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found.' });

    const newHistoryEntries = buildHistoryEntries(candidate, changes, changedBy);
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'status' && value === 'Naukri Response') {
        changes[key] = 'Information Form Response';
      }
      if (key === 'cvScreening' && value === '') {
        changes[key] = 'Not Set';
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const existing = candidate[key];
        if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
          candidate[key] = { ...existing, ...value };
        } else {
          candidate[key] = { ...value };
        }
      } else {
        candidate[key] = value;
      }
    }
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

exports.getResume = async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate || !candidate.resumeData) {
      return res.status(404).json({ success: false, message: 'Resume not found.' });
    }
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${candidate.fullName.replace(/[^a-z0-9_-]/gi, '_')}_Resume.pdf"`,
      'Content-Length': candidate.resumeData.length
    });
    res.send(candidate.resumeData);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while fetching resume.' });
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

// POST /api/candidates/bulk-upload-resumes
// Multipart form with:
// - `resumes`: multiple PDF files
// - `roleCode`: string
// Parses each PDF and creates Candidate records in MongoDB.
exports.bulkUploadResumes = async (req, res) => {
  try {
    const { roleCode } = req.body;
    const files = req.files || [];

    if (!roleCode || !files.length) {
      return res.status(400).json({ success: false, message: 'roleCode and at least one resume PDF are required.' });
    }

    const role = await Role.findOne({ code: roleCode.toUpperCase().trim() });
    if (!role) {
      return res.status(404).json({ success: false, message: `Role code "${roleCode}" not found.` });
    }

    const results = {
      insertedCount: 0,
      skippedCount: 0,
      errors: []
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const rowNum = i + 1;

      try {
        const parsedData = await parseResumeText(file.buffer);
        
        const fullName = parsedData.fullName;
        const email = parsedData.email;
        const phone = parsedData.phone;
        const skills = parsedData.skills;

        if (!fullName || !email) {
          results.skippedCount++;
          results.errors.push({ row: rowNum, fileName: file.originalname, reason: 'Could not extract name/email from resume.' });
          continue;
        }

        const existing = await Candidate.findOne({ email: email.toLowerCase().trim() });
        if (existing) {
          results.skippedCount++;
          results.errors.push({ row: rowNum, fileName: file.originalname, reason: `Duplicate email "${email}" — already exists.` });
          continue;
        }

        const candidate = await Candidate.create({
          fullName,
          email: email.toLowerCase().trim(),
          phone: phone || '',
          location: parsedData.location || '',
          roleCode: roleCode.toUpperCase().trim(),
          employmentType: parsedData.employmentType || 'Full-Time',
          yearsOfExperience: parsedData.yearsOfExperience || 0,
          ctcCurrent: parsedData.ctcCurrent || 0,
          ctcExpected: parsedData.ctcExpected || 0,
          noticePeriod: parsedData.noticePeriod || '',
          skills,
          resumeData: file.buffer,
          resumeText: parsedData.resumeText || '',
           status: 'Information Form Response',
          source: 'Resume Upload'
        });
        candidate.resumeUrl = `/api/candidates/${candidate._id}/resume`;
        await candidate.save();

        results.insertedCount++;
      } catch (err) {
        results.skippedCount++;
        results.errors.push({ row: rowNum, fileName: file.originalname, reason: err.message });
      }
    }

    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error while bulk uploading resumes.' });
  }
};