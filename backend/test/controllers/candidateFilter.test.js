describe('getCandidates employment type filter logic', () => {
  // Simulated backend filter construction mirroring candidateController.getCandidates
  const buildFilter = ({ roleCode, employmentType }) => {
    const filter = {};
    const normalizedRoleCode = roleCode ? roleCode.toUpperCase().trim() : '';

    if (normalizedRoleCode.startsWith('F')) {
      filter.$or = [
        { employmentType: 'FREELANCE CODING' },
        { roleCode: { $regex: '^F', $options: 'i' } }
      ];
    } else if (normalizedRoleCode.startsWith('M')) {
      filter.$or = [
        { employmentType: 'Medical Hiring' },
        { roleCode: { $regex: '^M', $options: 'i' } }
      ];
    } else if (employmentType === 'Medical Hiring') {
      filter.$or = [
        { employmentType: 'Medical Hiring' },
        { roleCode: { $regex: '^M', $options: 'i' } }
      ];
    } else if (employmentType === 'FREELANCE CODING' || employmentType === 'Contract') {
      filter.$or = [
        { employmentType: { $in: ['FREELANCE CODING', 'Contract'] } },
        { roleCode: { $regex: '^F', $options: 'i' } }
      ];
    } else if (employmentType) {
      filter.employmentType = employmentType;
    }

    return filter;
  };

  describe('FREELANCE CODING employment type filter', () => {
    it('should use $or to include both employment types and F-prefix role codes', () => {
      const filter = buildFilter({ employmentType: 'FREELANCE CODING' });
      expect(filter.$or).toBeDefined();
      expect(filter.$or[0].employmentType).toEqual({ $in: ['FREELANCE CODING', 'Contract'] });
      expect(filter.$or[1].roleCode).toEqual({ $regex: '^F', $options: 'i' });
    });

    it('should NOT use exact employmentType match only', () => {
      const filter = buildFilter({ employmentType: 'FREELANCE CODING' });
      expect(filter.employmentType).toBeUndefined();
    });
  });

  describe('Contract employment type filter', () => {
    it('should use $or to include both employment types and F-prefix role codes', () => {
      const filter = buildFilter({ employmentType: 'Contract' });
      expect(filter.$or).toBeDefined();
      expect(filter.$or[0].employmentType).toEqual({ $in: ['FREELANCE CODING', 'Contract'] });
      expect(filter.$or[1].roleCode).toEqual({ $regex: '^F', $options: 'i' });
    });
  });

  describe('Medical Hiring employment type filter', () => {
    it('should use $or to include Medical Hiring and M-prefix role codes', () => {
      const filter = buildFilter({ employmentType: 'Medical Hiring' });
      expect(filter.$or).toBeDefined();
      expect(filter.$or[0].employmentType).toBe('Medical Hiring');
      expect(filter.$or[1].roleCode).toEqual({ $regex: '^M', $options: 'i' });
    });
  });

  describe('F-prefix role code filter', () => {
    it('should use $or including FREELANCE CODING employment type and F-prefix role codes', () => {
      const filter = buildFilter({ roleCode: 'F-TYPESCRIPT' });
      expect(filter.$or[0].employmentType).toBe('FREELANCE CODING');
      expect(filter.$or[1].roleCode).toEqual({ $regex: '^F', $options: 'i' });
    });
  });

  describe('M-prefix role code filter', () => {
    it('should use $or including Medical Hiring employment type and M-prefix role codes', () => {
      const filter = buildFilter({ roleCode: 'M-DOCTOR' });
      expect(filter.$or[0].employmentType).toBe('Medical Hiring');
      expect(filter.$or[1].roleCode).toEqual({ $regex: '^M', $options: 'i' });
    });
  });

  describe('Regular employment type filter', () => {
    it('should use exact employmentType match', () => {
      const filter = buildFilter({ employmentType: 'Full-Time' });
      expect(filter.employmentType).toBe('Full-Time');
      expect(filter.$or).toBeUndefined();
    });
  });

  describe('no filters', () => {
    it('should return empty filter object', () => {
      const filter = buildFilter({});
      expect(Object.keys(filter).length).toBe(0);
    });
  });
});

describe('CandidatePool frontend filter', () => {
  const isFreelanceRoleCode = (code) => Boolean(code && String(code).toUpperCase().trim().startsWith('F'));
  const isMedicalRoleCode = (code) => Boolean(code && String(code).toUpperCase().trim().startsWith('M'));

  // Mirrors effectiveEmploymentType() from frontend/src/utils/employment.js
  const effectiveEmploymentType = (c) => {
    if (c.employmentType === 'FREELANCE CODING' || c.employmentType === 'Contract' || isFreelanceRoleCode(c.roleCode)) {
      return 'FREELANCE CODING';
    }
    if (c.employmentType === 'Medical Hiring' || isMedicalRoleCode(c.roleCode)) {
      return 'Medical Hiring';
    }
    return c.employmentType;
  };

  const simulateFrontendFilter = (candidates, filters) => {
    return candidates.filter((c) => {
      if (filters.employmentType === 'FREELANCE CODING' && !isFreelanceRoleCode(c.roleCode) && c.employmentType !== 'FREELANCE CODING') return false;
      if (filters.employmentType === 'Contract' && !isFreelanceRoleCode(c.roleCode) && c.employmentType !== 'Contract') return false;
      if (filters.employmentType && filters.employmentType !== 'FREELANCE CODING' && filters.employmentType !== 'Contract' && effectiveEmploymentType(c) !== filters.employmentType) return false;
      if (filters.employmentType === 'Medical Hiring' && !c.roleCode.toUpperCase().startsWith('M') && c.employmentType !== 'Medical Hiring') return false;
      return true;
    });
  };

  const allCandidates = [
    { roleCode: 'F-TYPESCRIPT', employmentType: 'Full-Time', fullName: 'Alice' },
    { roleCode: 'F-ANGULAR', employmentType: 'FREELANCE CODING', fullName: 'Bob' },
    { roleCode: 'F-REACT', employmentType: 'Contract', fullName: 'Charlie' },
    { roleCode: 'BTA-ENG-01', employmentType: 'Full-Time', fullName: 'David' },
    { roleCode: 'BTA-DS-01', employmentType: 'Part-Time', fullName: 'Eve' },
    { roleCode: 'M-DOCTOR', employmentType: 'Full-Time', fullName: 'Frank' },
    { roleCode: 'M-NURSE', employmentType: 'Medical Hiring', fullName: 'Grace' }
  ];

  it('should show all F-prefixed candidates when FREELANCE CODING selected', () => {
    const result = simulateFrontendFilter(allCandidates, { employmentType: 'FREELANCE CODING' });
    expect(result.length).toBe(3);
    expect(result.map(c => c.fullName)).toEqual(expect.arrayContaining(['Alice', 'Bob', 'Charlie']));
  });

  it('should show all F-prefixed candidates when Contract selected', () => {
    const result = simulateFrontendFilter(allCandidates, { employmentType: 'Contract' });
    expect(result.length).toBe(3);
    expect(result.map(c => c.fullName)).toEqual(expect.arrayContaining(['Alice', 'Bob', 'Charlie']));
  });

  it('should show all M-prefixed candidates when Medical Hiring selected', () => {
    const result = simulateFrontendFilter(allCandidates, { employmentType: 'Medical Hiring' });
    expect(result.length).toBe(2);
    expect(result.map(c => c.fullName)).toEqual(expect.arrayContaining(['Frank', 'Grace']));
  });

  it('should show only Full-Time candidates when Full-Time selected', () => {
    const result = simulateFrontendFilter(allCandidates, { employmentType: 'Full-Time' });
    // Full-Time: only candidates with employmentType=Full-Time (no F/M prefix)
    expect(result.length).toBe(1);
    expect(result.map(c => c.fullName)).toEqual(['David']);
  });
});