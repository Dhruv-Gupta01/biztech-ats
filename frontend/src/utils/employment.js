// Employment-type helpers shared across the ATS.
//
// Rule: a role code that starts with "F" (e.g. F-TYPESCRIPT, FTE-001) is always
// FREELANCE CODING — for new and existing roles/candidates alike. Every surface
// (Candidate Pool, Assessment & Outreach, Role Code Data, profile modal) uses
// these helpers so the rule lives in exactly one place.
//
// Rule: a role code that starts with "M" (e.g. M-DOCTOR, M-NURSE) is always
// MEDICAL HIRING — for new and existing roles/candidates alike.
//
// Contractual employment type uses Freelance Coding columns.
//
// Employment type and role code are independent: a CODING role can be filled by
// Freelance, Contract or Freelance/Contract candidates. Freelance and
// Freelance/Contract share the Contract/Freelance Coding column set (screening
// interview, Calendly, NDA & ICA, Slack, bootcamp, onboarding, project) —
// without this they'd import fine but show none of those columns.

export const EMPLOYMENT_TYPES = ['Full-Time', 'Contract', 'Part-Time', 'FREELANCE CODING', 'Medical Hiring'];

export const FREELANCE_EMP_TYPE = 'FREELANCE CODING';
export const MEDICAL_EMP_TYPE = 'Medical Hiring';

export const isFreelanceRoleCode = (code) =>
  Boolean(code && String(code).toUpperCase().trim().startsWith('F'));

export const isMedicalRoleCode = (code) =>
  Boolean(code && String(code).toUpperCase().trim().startsWith('M'));

export const isFreelanceEmploymentType = (type) => type === FREELANCE_EMP_TYPE;

// Every employment type that uses the freelance column set.
export const FREELANCE_LIKE_TYPES = ['FREELANCE CODING', 'Contract', 'Freelance', 'Freelance/Contract'];
export const isFreelanceLikeType = (type) => FREELANCE_LIKE_TYPES.includes(type);

export const isMedicalEmploymentType = (type) => type === MEDICAL_EMP_TYPE;

// True when a candidate should be treated as FREELANCE CODING — either the
// stored employment type says so, or (more reliably) their role code starts
// with F. Contract employment type is also treated as freelance (same columns
// and filters). This keeps historical rows correct even before they're backfilled.
export const isFreelanceCandidate = (candidate) =>
  Boolean(candidate && (isFreelanceLikeType(candidate.employmentType) || isFreelanceRoleCode(candidate.roleCode)));

// True when a candidate should be treated as MEDICAL HIRING
export const isMedicalCandidate = (candidate) =>
  Boolean(candidate && (isMedicalEmploymentType(candidate.employmentType) || isMedicalRoleCode(candidate.roleCode)));

// True when the current filter selection should activate the freelance view.
export const isFreelanceFilter = (employmentType, roleCode) =>
  isFreelanceLikeType(employmentType) || isFreelanceRoleCode(roleCode);

// True when the current filter selection should activate the medical view.
export const isMedicalFilter = (employmentType, roleCode) =>
  isMedicalEmploymentType(employmentType) || isMedicalRoleCode(roleCode);

// Effective employment type for display — F role codes always read as freelance, M as medical.
export const effectiveEmploymentType = (candidate) => {
  // Freelance / Freelance-Contract keep their own label (only F role codes are forced to FREELANCE CODING).
  if (candidate && (candidate.employmentType === 'Freelance' || candidate.employmentType === 'Freelance/Contract') && !isFreelanceRoleCode(candidate.roleCode)) {
    return candidate.employmentType;
  }
  if (isFreelanceCandidate(candidate)) return FREELANCE_EMP_TYPE;
  if (isMedicalCandidate(candidate)) return MEDICAL_EMP_TYPE;
  return candidate && candidate.employmentType;
};

export const typeLabel = (t) =>
  t === 'Contract' ? 'Contractual'
    : t === 'Part-Time' ? 'Part Time'
      : t === 'FREELANCE CODING' ? 'Freelance Coding'
        : (t === 'Freelance' || t === 'Freelance/Contract') ? t
        : t === 'Medical Hiring' ? 'Medical Hiring'
          : 'Full Time';