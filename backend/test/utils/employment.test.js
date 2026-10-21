// Pure re-implementation of the shared employment helpers for testing.
// These mirror frontend/src/utils/employment.js exactly.

const FREELANCE_EMP_TYPE = 'FREELANCE CODING';
const MEDICAL_EMP_TYPE = 'Medical Hiring';

const isFreelanceRoleCode = (code) =>
  Boolean(code && String(code).toUpperCase().trim().startsWith('F'));

const isMedicalRoleCode = (code) =>
  Boolean(code && String(code).toUpperCase().trim().startsWith('M'));

const isFreelanceEmploymentType = (type) => type === FREELANCE_EMP_TYPE;

const isMedicalEmploymentType = (type) => type === MEDICAL_EMP_TYPE;

const isFreelanceCandidate = (candidate) =>
  Boolean(candidate && (isFreelanceEmploymentType(candidate.employmentType) || candidate.employmentType === 'Contract' || isFreelanceRoleCode(candidate.roleCode)));

const isMedicalCandidate = (candidate) =>
  Boolean(candidate && (isMedicalEmploymentType(candidate.employmentType) || isMedicalRoleCode(candidate.roleCode)));

const isFreelanceFilter = (employmentType, roleCode) =>
  isFreelanceEmploymentType(employmentType) || employmentType === 'Contract' || isFreelanceRoleCode(roleCode);

const isMedicalFilter = (employmentType, roleCode) =>
  isMedicalEmploymentType(employmentType) || isMedicalRoleCode(roleCode);

const effectiveEmploymentType = (candidate) => {
  if (isFreelanceCandidate(candidate)) return FREELANCE_EMP_TYPE;
  if (isMedicalCandidate(candidate)) return MEDICAL_EMP_TYPE;
  return candidate && candidate.employmentType;
};

describe('employment type helpers', () => {
  describe('isFreelanceRoleCode', () => {
    it('should return true for F-prefixed codes', () => {
      expect(isFreelanceRoleCode('F-TYPESCRIPT')).toBe(true);
      expect(isFreelanceRoleCode('FTE-001')).toBe(true);
      expect(isFreelanceRoleCode('f-test')).toBe(true);
    });

    it('should return false for non-F-prefixed codes', () => {
      expect(isFreelanceRoleCode('BTA-ENG-01')).toBe(false);
      expect(isFreelanceRoleCode('M-DOCTOR')).toBe(false);
      expect(isFreelanceRoleCode('')).toBe(false);
      expect(isFreelanceRoleCode(null)).toBe(false);
    });
  });

  describe('isMedicalRoleCode', () => {
    it('should return true for M-prefixed codes', () => {
      expect(isMedicalRoleCode('M-DOCTOR')).toBe(true);
      expect(isMedicalRoleCode('M-NURSE')).toBe(true);
      expect(isMedicalRoleCode('m-test')).toBe(true);
    });

    it('should return false for non-M-prefixed codes', () => {
      expect(isMedicalRoleCode('BTA-ENG-01')).toBe(false);
      expect(isMedicalRoleCode('F-TYPESCRIPT')).toBe(false);
      expect(isMedicalRoleCode('')).toBe(false);
      expect(isMedicalRoleCode(null)).toBe(false);
    });
  });

  describe('isFreelanceFilter', () => {
    it('should return true when employmentType is FREELANCE CODING', () => {
      expect(isFreelanceFilter('FREELANCE CODING', '')).toBe(true);
    });

    it('should return true when employmentType is Contract', () => {
      expect(isFreelanceFilter('Contract', '')).toBe(true);
    });

    it('should return true when roleCode starts with F', () => {
      expect(isFreelanceFilter('', 'F-TYPESCRIPT')).toBe(true);
    });

    it('should return false for non-freelance combinations', () => {
      expect(isFreelanceFilter('Full-Time', 'BTA-ENG-01')).toBe(false);
      expect(isFreelanceFilter('', '')).toBe(false);
    });
  });

  describe('isMedicalFilter', () => {
    it('should return true when employmentType is Medical Hiring', () => {
      expect(isMedicalFilter('Medical Hiring', '')).toBe(true);
    });

    it('should return true when roleCode starts with M', () => {
      expect(isMedicalFilter('', 'M-DOCTOR')).toBe(true);
    });

    it('should return false for non-medical combinations', () => {
      expect(isMedicalFilter('Full-Time', 'BTA-ENG-01')).toBe(false);
      expect(isMedicalFilter('', '')).toBe(false);
    });
  });

  describe('isFreelanceCandidate', () => {
    it('should return true for candidates with F-prefixed role code', () => {
      const candidate = { roleCode: 'F-TYPESCRIPT', employmentType: 'Full-Time' };
      expect(isFreelanceCandidate(candidate)).toBe(true);
    });

    it('should return true for candidates with FREELANCE CODING employment type', () => {
      const candidate = { roleCode: 'BTA-ENG-01', employmentType: 'FREELANCE CODING' };
      expect(isFreelanceCandidate(candidate)).toBe(true);
    });

    it('should return true for candidates with Contract employment type', () => {
      const candidate = { roleCode: 'BTA-ENG-01', employmentType: 'Contract' };
      expect(isFreelanceCandidate(candidate)).toBe(true);
    });

    it('should return false for non-freelance candidates', () => {
      const candidate = { roleCode: 'BTA-ENG-01', employmentType: 'Full-Time' };
      expect(isFreelanceCandidate(candidate)).toBe(false);
    });
  });

  describe('isMedicalCandidate', () => {
    it('should return true for candidates with M-prefixed role code', () => {
      const candidate = { roleCode: 'M-DOCTOR', employmentType: 'Full-Time' };
      expect(isMedicalCandidate(candidate)).toBe(true);
    });

    it('should return true for candidates with Medical Hiring employment type', () => {
      const candidate = { roleCode: 'BTA-ENG-01', employmentType: 'Medical Hiring' };
      expect(isMedicalCandidate(candidate)).toBe(true);
    });

    it('should return false for non-medical candidates', () => {
      const candidate = { roleCode: 'BTA-ENG-01', employmentType: 'Full-Time' };
      expect(isMedicalCandidate(candidate)).toBe(false);
    });
  });

  describe('effectiveEmploymentType', () => {
    it('should return FREELANCE CODING for F-prefixed role code', () => {
      const candidate = { roleCode: 'F-TYPESCRIPT', employmentType: 'Full-Time' };
      expect(effectiveEmploymentType(candidate)).toBe('FREELANCE CODING');
    });

    it('should return Medical Hiring for M-prefixed role code', () => {
      const candidate = { roleCode: 'M-DOCTOR', employmentType: 'Full-Time' };
      expect(effectiveEmploymentType(candidate)).toBe('Medical Hiring');
    });

    it('should return stored employment type for regular candidates', () => {
      const candidate = { roleCode: 'BTA-ENG-01', employmentType: 'Full-Time' };
      expect(effectiveEmploymentType(candidate)).toBe('Full-Time');
    });
  });
});