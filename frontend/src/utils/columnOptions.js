// Shared column options for column picker ("All Status" filter) 
// and option picker ("Options" filter). Each job type shows different columns.

import { isFreelanceLikeType } from './employment';

export const STATUS_OPTIONS = [
  'Information Form Response', 'Interview 1', 'Interview 1 Shortlisted', 'Interview 2',
  'Interview 2 Shortlisted', 'Assessment 1', 'Assessment 1 Shortlisted', 'Assessment 1 Passed',
  'Assessment 2', 'Assessment 2 Shortlisted', 'Assessment 2 Passed', 'Final Round Shortlisted',
  'Selected', 'Rejected', 'Not Appeared', 'Rescheduled', 'Refered for other position', 'Not interested'
];

export const INTERVIEW_ROUND_OPTIONS = ['Not set', 'Selected', 'Rejected', 'Not Appeared', 'Rescheduled', 'Not interested', 'Refered for other position'];
export const ASSESSMENT_STATUS_OPTIONS = ['Not Set', 'Selected', 'Rejected', 'Not Appeared', 'Rescheduled', 'Not interested', 'Refered for other position'];
export const CV_SCREENING_OPTIONS = ['Not Set', 'Selected', 'Rejected', 'Refered for other position'];

export const getColumnsForType = (employmentType) => {
  if (isFreelanceLikeType(employmentType)) {
    return [
      { field: 'screeningInterview', label: 'Screening Interview' },
      { field: 'calendlyLinkSent', label: 'Calendly Link Sent' },
      { field: 'calendlyLinkStatus', label: 'Calendly Link Status' },
      { field: 'ndaIca', label: 'NDA & ICA' },
      { field: 'slackStatus', label: 'Slack' },
      { field: 'bootcampAttempts', label: 'Bootcamp Attempts' },
      { field: 'bootcampStatus', label: 'Bootcamp Status' },
      { field: 'onboarding', label: 'Onboarding' },
      { field: 'project', label: 'Project' },
      { field: 'projectStatus', label: 'Project Status' }
    ];
  }
  if (employmentType === 'Medical Hiring') {
    return [
      { field: 'resumeAnalyzerStatus', label: 'Resume Analyzer Status' },
      { field: 'medicalAssessments', label: 'Assessments' },
      { field: 'medicalAssessmentsSubmission', label: 'Assessments Submission' },
      { field: 'medicalSubmissionsEvaluation', label: 'Submissions Evaluation' },
      { field: 'medicalOnboarding', label: 'Onboarding' },
      { field: 'medicalSlack', label: 'Slack' },
      { field: 'project', label: 'Project' },
      { field: 'projectStatus', label: 'Project Status' }
    ];
  }
  return [
    { field: 'status', label: 'Status' },
    { field: 'cvScreening', label: 'CV Screening' },
    { field: 'interviewRounds', label: 'Interview Round' },
    { field: 'assessmentStatus', label: 'Assessment Status' }
  ];
};

export const getOptionsForColumn = (field, candidates = []) => {
  const optionsMap = {
    status: STATUS_OPTIONS,
    cvScreening: CV_SCREENING_OPTIONS,
    interviewRounds: INTERVIEW_ROUND_OPTIONS,
    assessmentStatus: ASSESSMENT_STATUS_OPTIONS,
    screeningInterview: ['Pass', 'Fail', 'Not Appeared', 'Rescheduled', 'Not interested', 'Referred to another position'],
    calendlyLinkSent: ['Sent', 'Not Sent'],
    calendlyLinkStatus: ['Booked', 'Not Booked'],
    ndaIca: ['Sent', 'Not Sent', 'Signed', 'Not Signed', 'Doubt', 'Not Interested'],
    slackStatus: ['Joined', 'Not Joined', 'Not Interested'],
    bootcampAttempts: ['Attempt 1', 'Attempt 2', 'Attempt 3'],
    bootcampStatus: ['Pass', 'Fail', 'Full Fail', 'Not Active', 'Active'],
    onboarding: ['Sent', 'Not Sent', 'Not Interested', 'Done'],
    projectStatus: ['On Hold', 'Complete', 'Not Active', 'In Pipeline'],
    resumeAnalyzerStatus: ['Selected', 'Not selected'],
    medicalAssessments: ['Sent', 'Not Sent'],
    medicalAssessmentsSubmission: ['Received', 'Not received', 'Not interested'],
    medicalSubmissionsEvaluation: ['Pass', 'Fail', 'Pending'],
    medicalOnboarding: ['Sent', 'Not sent', 'Done', 'Not done', 'Not interested'],
    medicalSlack: ['Joined', 'Not joined', 'Not interested'],
    medicalProjectStatus: ['Active', 'Not Active', 'On hold', 'In pipeline']
  };
  if (field === 'project') {
    const projects = [...new Set(candidates.map(c => c.project).filter(Boolean))];
    return projects.length ? projects : ['Project 1', 'Project 2', 'Project 3'];
  }
  return optionsMap[field] || [];
};

export const getColumnValue = (candidate, field) => {
  if (!candidate) return null;
  if (field === 'interviewRounds') {
    const rounds = candidate.interviewRounds || {};
    const vals = Object.values(rounds).filter(v => v && v !== 'Not set');
    return vals.length ? vals[vals.length - 1] : null;
  }
  return candidate[field] || null;
};