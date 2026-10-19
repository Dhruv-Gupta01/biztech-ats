const Candidate = require('../models/Candidate');
const Role = require('../models/Role');

exports.getStatistics = async (req, res) => {
  try {
    const {
      // Date filters
      startDate, endDate,
      // Other filters
      portal, roleCode, owner, status,
      minScore, maxScore,
      minExperience, maxExperience,
      location, // India/outside
      rebookFlag // true/false
    } = req.query;

    const filter = {};

    // Date range filter based on stage dates
    // We need to check history for status changes within date range
    // For simplicity in this implementation, we'll use updatedAt as fallback
    // A more sophisticated approach would check history array for specific status changes
    if (startDate || endDate) {
      filter.updatedAt = {};
      if (startDate) filter.updatedAt.$gte = new Date(startDate);
      if (endDate) filter.updatedAt.$lte = new Date(endDate);
    }

    // Portal filter (source)
    if (portal) filter.source = portal;

    // Role filter
    if (roleCode) filter.roleCode = roleCode.toUpperCase().trim();

    // Owner filter - we'd need to check history, for now using a simplified approach
    // In a real implementation, we might want to track owner explicitly
    // For now, we'll skip this as it requires more complex history querying

    // Status filter
    if (status) filter.status = status;

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
      // Simple check - in reality might need more sophisticated location parsing
      filter.location = { $regex: '(?i)(india|delhi|mumbai|bangalore|hyderabad|pune|chennai|kolkata)' };
    } else if (location === 'outside') {
      filter.location = { $not: { $regex: '(?i)(india|delhi|mumbai|bangalore|hyderabad|pune|chennai|kolkata)' } };
    }

    // Re-book flag - would need to be tracked separately, skipping for now
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
        todaysInterviews: [],
        pendingActions,
        portalFunnel,
        candidates: candidates.map(candidate => ({
          id: candidate._id,
          fullName: candidate.fullName,
          roleCode: candidate.roleCode,
          location: candidate.location || '',
          lastStatus: candidate.status,
          resumeUrl: candidate.resumeUrl,
          score: candidate.score?.suitabilityRating || null,
          experience: candidate.yearsOfExperience,
          source: candidate.source,
          // Additional fields for detailed view
          calendlyLinkStatus: candidate.calendlyLinkStatus,
          onboarding: candidate.onboarding,
          bootcampStatus: candidate.bootcampStatus,
          projectStatus: candidate.projectStatus
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
      location,
      rebookFlag
    } = req.query;

    // Reuse the same filtering logic as getStatistics
    const filter = {};

    if (startDate || endDate) {
      filter.updatedAt = {};
      if (startDate) filter.updatedAt.$gte = new Date(startDate);
      if (endDate) filter.updatedAt.$lte = new Date(endDate);
    }

    if (portal) filter.source = portal;
    if (roleCode) filter.roleCode = roleCode.toUpperCase().trim();
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

    const candidates = await Candidate.find(filter).sort({ updatedAt: -1 });

    // Generate CSV
    const csvLines = [];
    csvLines.push('Candidate Name,Role Code,Location,Last Status,Resume Link,Score,Experience,Source,Calendly Status,Onboarding Status,Bootcamp Status,Project Status');

    candidates.forEach(candidate => {
      const resumeLink = candidate.resumeUrl ? `https://biztech-ats-backend-0jpt.onrender.com${candidate.resumeUrl}` : '';
      csvLines.push(`"${candidate.fullName}","${candidate.roleCode}","${candidate.location || ''}","${candidate.status}","${resumeLink}",${candidate.score?.suitabilityRating || ''},${candidate.yearsOfExperience || ''},"${candidate.source || ''}","${candidate.calendlyLinkStatus || ''}","${candidate.onboarding || ''}","${candidate.bootcampStatus || ''}","${candidate.projectStatus || ''}"`);
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