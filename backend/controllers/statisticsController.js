const Candidate = require('../models/Candidate');
const Role = require('../models/Role');
const registry = require('../utils/employmentRegistry');

exports.getStatistics = async (req, res) => {
  try {
    const {
      // Date filters
      startDate, endDate,
      // Other filters
      portal, roleCode, owner, status,
      minScore, maxScore,
      minExperience, maxExperience,
      location, employmentType, // Employment type filter
      statusColumn, statusColumnValue,
      rebookFlag
      // TODO: owner filter
    } = req.query;

    const filter = {};

    // Date range filter based on stage dates
    if (startDate || endDate) {
      filter.updatedAt = {};
      if (startDate) filter.updatedAt.$gte = new Date(startDate);
      if (endDate) filter.updatedAt.$lte = new Date(endDate);
    }

    // Portal filter (source)
    if (portal) filter.source = portal;

    // Role filter
    if (roleCode) {
      filter.roleCode = roleCode.toUpperCase().trim();
      // If roleCode starts with F, treat as freelance regardless of employmentType
      if (roleCode.toUpperCase().trim().startsWith('F')) {
        filter.$or = [
          { employmentType: 'FREELANCE CODING' },
          { roleCode: { $regex: '^F', $options: 'i' } }
        ];
      } else if (roleCode.toUpperCase().trim().startsWith('M')) {
        filter.$or = [
          { employmentType: 'Medical Hiring' },
          { roleCode: { $regex: '^M', $options: 'i' } }
        ];
      }
    }

    // Status filter
    if (status) filter.status = status;

    // Employment type filter
    if (employmentType) {
      filter.employmentType = employmentType;
    }

    // Status Column + Options filter (like Candidate Pool)
    if (statusColumn) {
      if (statusColumn === 'interviewRounds') {
        if (statusColumnValue) {
          filter['interviewRounds'] = statusColumnValue;
        } else {
          filter['interviewRounds'] = { $exists: true, $ne: null, $ne: {} };
        }
      } else {
        if (statusColumnValue) {
          filter[statusColumn] = statusColumnValue;
        } else {
          filter[statusColumn] = { $exists: true, $ne: null, $ne: '' };
        }
      }
    }

    // Resume score range
    if (minScore !== undefined || maxScore !== undefined) {
      filter['score.suitabilityRating'] = {};
      if (minScore !== undefined) filter['score.suitabilityRating'].$gte = Number(minScore);
      if (maxScore !== undefined) filter['score.suitabilityRating'].$lte = Number(maxScore);
    }

    // Experience filter
    if (minExperience !== undefined || maxExperience !== undefined) {
      filter.yearsOfExperience = {};
      if (minExperience !== undefined) filter.yearsOfExperience.$gte = Number(minExperience);
      if (maxExperience !== undefined) filter.yearsOfExperience.$lte = Number(maxExperience);
    }

    // Location filter (India/outside)
    if (location === 'India') {
      filter.location = { $regex: '(?i)(india|delhi|mumbai|bangalore|hyderabad|pune|chennai|kolkata)' };
    } else if (location === 'outside') {
      filter.location = { $not: { $regex: '(?i)(india|delhi|mumbai|bangalore|hyderabad|pune|chennai|kolkata)' } };
    }

    if (employmentType) filter.employmentType = employmentType;
    // Would require a field like "rebookCount" or similar

    const candidates = await Candidate.find(filter).sort({ updatedAt: -1 });

    // Calculate statistics
    const total = candidates.length;
    
    // Funnel analysis by status
    const STATUS_ORDER = [
      'Information Form Response',
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
      'Rejected',
      'Not Appeared',
      'Rescheduled',
      'Refered for other position',
      'Not interested'
    ];

    const funnel = STATUS_ORDER.map(status => ({
      label: status,
      count: candidates.filter(c => c.status === status).length
    }));

    // Funnel analysis by status broken down by employment type
    const employmentTypes = registry.getActiveNames();
    const funnelByEmploymentType = employmentTypes.map(et => ({
      employmentType: et,
      funnel: STATUS_ORDER.map(status => ({
        status,
        count: candidates.filter(c => c.employmentType === et && c.status === status).length
      }))
    }));

    // Today's interviews (for 1-hour prior reminder)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todaysInterviews = candidates.filter(c => {
      // Check if candidate has an interview scheduled today
      // This would require storing interview dates - for now using a placeholder
      // In reality, we'd need to track interview dates in candidate model
      return false; // Placeholder
    });

    // Pending actions
    const pendingActions = {
      formNotAnswered: candidates.filter(c => c.status === 'Information Form Response').length,
      invitedNotBooked: candidates.filter(c => 
        (c.status === 'Interview 1' || c.status === 'Interview 2' || 
         c.status === 'Interview 1 Shortlisted' || c.status === 'Interview 2 Shortlisted') &&
        c.calendlyLinkStatus !== 'Booked'
      ).length,
      passedOnboardingNotSent: candidates.filter(c => 
        (c.assessmentStatus === 'Selected' || c.assessmentStatus === 'Rejected') &&
        c.onboarding !== 'Sent'
      ).length,
      onboardingTrainingPending: candidates.filter(c => 
        c.onboarding === 'Sent' && 
        (c.bootcampStatus === 'Not Active' || c.projectStatus === 'Not Active')
      ).length
    };

    // Portal-wise funnel
    const portalBreakdown = {};
    candidates.forEach(c => {
      const src = c.source || 'Unknown';
      if (!portalBreakdown[src]) portalBreakdown[src] = { total: 0, selected: 0 };
      portalBreakdown[src].total++;
      if (c.status === 'Selected') portalBreakdown[src].selected++;
    });

    const portalFunnel = Object.entries(portalBreakdown).map(([portal, counts]) => ({
      portal,
      total: counts.total,
      selected: counts.selected,
      conversionRate: counts.total > 0 ? (counts.selected / counts.total * 100) : 0
    }));

    res.status(200).json({
      success: true,
      data: {
        total,
        funnel,
        funnelByEmploymentType,
        todaysInterviews: [],
        pendingActions,
        portalFunnel,
        candidates: candidates.map(candidate => ({
          id: candidate._id,
          fullName: candidate.fullName,
          email: candidate.email || '',
          roleCode: candidate.roleCode,
          employmentType: candidate.employmentType || '',
          location: candidate.location || '',
          lastStatus: candidate.status,
          status: candidate.status,
          resumeUrl: candidate.resumeUrl,
          score: candidate.score?.suitabilityRating || null,
          experience: candidate.yearsOfExperience,
          source: candidate.source,
          // Freelance / Contract columns
          screeningInterview: candidate.screeningInterview || '',
          calendlyLinkSent: candidate.calendlyLinkSent || '',
          calendlyLinkStatus: candidate.calendlyLinkStatus || '',
          ndaIca: candidate.ndaIca || '',
          slackStatus: candidate.slackStatus || '',
          bootcampAttempts: candidate.bootcampAttempts || '',
          bootcampStatus: candidate.bootcampStatus || '',
          onboarding: candidate.onboarding || '',
          project: candidate.project || '',
          projectStatus: candidate.projectStatus || '',
          // Medical Hiring columns
          resumeAnalyzerStatus: candidate.resumeAnalyzerStatus || '',
          medicalAssessments: candidate.medicalAssessments || '',
          medicalAssessmentsSubmission: candidate.medicalAssessmentsSubmission || '',
          medicalSubmissionsEvaluation: candidate.medicalSubmissionsEvaluation || '',
          medicalOnboarding: candidate.medicalOnboarding || '',
          medicalSlack: candidate.medicalSlack || '',
          // Common columns
          cvScreening: candidate.cvScreening || '',
          interviewRounds: candidate.interviewRounds || {},
          assessmentStatus: candidate.assessmentStatus || ''
        }))
      }
    });
  } catch (err) {
    console.error('Statistics error:', err);
    res.status(500).json({ success: false, message: 'Server error while computing statistics.' });
  }
};

exports.exportStatisticsCSV = async (req, res) => {
  try {
    const {
      startDate, endDate,
      portal, roleCode, owner, status,
      minScore, maxScore,
      minExperience, maxExperience,
      location, employmentType, // Employment type filter
      statusColumn, statusColumnValue,
      rebookFlag
    } = req.query;

    const filter = {};

    if (startDate || endDate) {
      filter.updatedAt = {};
      if (startDate) filter.updatedAt.$gte = new Date(startDate);
      if (endDate) filter.updatedAt.$lte = new Date(endDate);
    }

    if (portal) filter.source = portal;
    if (roleCode) {
      filter.roleCode = roleCode.toUpperCase().trim();
      if (roleCode.toUpperCase().trim().startsWith('F')) {
        filter.$or = [
          { employmentType: 'FREELANCE CODING' },
          { roleCode: { $regex: '^F', $options: 'i' } }
        ];
      } else if (roleCode.toUpperCase().trim().startsWith('M')) {
        filter.$or = [
          { employmentType: 'Medical Hiring' },
          { roleCode: { $regex: '^M', $options: 'i' } }
        ];
      }
    }
    if (status) filter.status = status;

    if (minScore !== undefined || maxScore !== undefined) {
      filter['score.suitabilityRating'] = {};
      if (minScore !== undefined) filter['score.suitabilityRating'].$gte = Number(minScore);
      if (maxScore !== undefined) filter['score.suitabilityRating'].$lte = Number(maxScore);
    }

    if (minExperience !== undefined || maxExperience !== undefined) {
      filter.yearsOfExperience = {};
      if (minExperience !== undefined) filter.yearsOfExperience.$gte = Number(minExperience);
      if (maxExperience !== undefined) filter.yearsOfExperience.$lte = Number(maxExperience);
    }

    if (location === 'India') {
      filter.location = { $regex: '(?i)(india|delhi|mumbai|bangalore|hyderabad|pune|chennai|kolkata)' };
    } else if (location === 'outside') {
      filter.location = { $not: { $regex: '(?i)(india|delhi|mumbai|bangalore|hyderabad|pune|chennai|kolkata)' } };
    }

    if (employmentType) {
      filter.employmentType = employmentType;
    }

    if (statusColumn) {
      if (statusColumn === 'interviewRounds') {
        if (statusColumnValue) {
          filter['interviewRounds'] = statusColumnValue;
        } else {
          filter['interviewRounds'] = { $exists: true, $ne: null, $ne: {} };
        }
      } else {
        if (statusColumnValue) {
          filter[statusColumn] = statusColumnValue;
        } else {
          filter[statusColumn] = { $exists: true, $ne: null, $ne: '' };
        }
      }
    }

    const candidates = await Candidate.find(filter).sort({ updatedAt: -1 });

    // Generate CSV
    const csvLines = [];
    csvLines.push('Candidate Name,Role Code,Employment Type,Location,Last Status,Resume Link,Score,Experience,Source,Calendly Status,Onboarding Status,Bootcamp Status,Project Status');

    candidates.forEach(candidate => {
      const resumeLink = candidate.resumeUrl ? `https://biztech-ats-backend-0jpt.onrender.com${candidate.resumeUrl}` : '';
      csvLines.push(`"${candidate.fullName}","${candidate.roleCode}","${candidate.employmentType || ''}","${candidate.location || ''}","${candidate.status}","${resumeLink}",${candidate.score?.suitabilityRating || ''},${candidate.yearsOfExperience || ''},"${candidate.source || ''}","${candidate.calendlyLinkStatus || ''}","${candidate.onboarding || ''}","${candidate.bootcampStatus || ''}","${candidate.projectStatus || ''}"`);
    });

    const csvContent = csvLines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=statistics_report_${new Date().toISOString().slice(0,10)}.csv`);
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('Export CSV error:', err);
    res.status(500).json({ success: false, message: 'Server error while exporting CSV.' });
  }
};