// Employment-type helpers shared across the ATS.
//
// Rule: a role code that starts with "F" (e.g. F-TYPESCRIPT, FTE-001) is always
// FREELANCE CODING — for new and existing roles/candidates alike. Every surface
// (Candidate Pool, Assessment & Outreach, Role Code Data, profile modal) uses
// these helpers so the rule lives in exactly one place.

export const EMPLOYMENT_TYPES = ['Full-Time', 'Contract', 'Part-Time', 'Internship', 'FREELANCE CODING'];

export const FREELANCE_EMP_TYPE = 'FREELANCE CODING';

export const isFreelanceRoleCode = (code) =>
  Boolean(code && String(code).toUpperCase().trim().startsWith('F'));

export const isFreelanceEmploymentType = (type) => type === FREELANCE_EMP_TYPE;

// True when a candidate should be treated as FREELANCE CODING — either the
// stored employment type says so, or (more reliably) their role code starts
// with F. This keeps historical rows correct even before they're backfilled.
export const isFreelanceCandidate = (candidate) =>
  Boolean(candidate && (isFreelanceEmploymentType(candidate.employmentType) || isFreelanceRoleCode(candidate.roleCode)));

// True when the current filter selection should activate the freelance view.
export const isFreelanceFilter = (employmentType, roleCode) =>
  isFreelanceEmploymentType(employmentType) || isFreelanceRoleCode(roleCode);

// Effective employment type for display — F role codes always read as freelance.
export const effectiveEmploymentType = (candidate) =>
  isFreelanceCandidate(candidate) ? FREELANCE_EMP_TYPE : (candidate && candidate.employmentType);

export const typeLabel = (t) =>
  t === 'Contract' ? 'Contractual'
    : t === 'Part-Time' ? 'Part Time'
      : t === 'Internship' ? 'Internship'
        : t === 'FREELANCE CODING' ? 'Freelance Coding'
          : 'Full Time';
