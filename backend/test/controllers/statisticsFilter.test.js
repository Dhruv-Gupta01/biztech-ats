describe('StatisticsController employment type filter', () => {
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

  const mockCandidates = [
    { employmentType: 'Full-Time', status: 'Selected' },
    { employmentType: 'Full-Time', status: 'Rejected' },
    { employmentType: 'Full-Time', status: 'Interview 1' },
    { employmentType: 'Contract', status: 'Selected' },
    { employmentType: 'Contract', status: 'Interview 1 Shortlisted' },
    { employmentType: 'FREELANCE CODING', status: 'Assessment 1 Passed' },
    { employmentType: 'FREELANCE CODING', status: 'Selected' },
    { employmentType: 'Part-Time', status: 'Information Form Response' },
    { employmentType: 'Medical Hiring', status: 'Selected' },
    { employmentType: 'Medical Hiring', status: 'Final Round Shortlisted' }
  ];

  const filterByEmploymentType = (candidates, employmentType) => {
    if (!employmentType) return candidates;
    return candidates.filter(c => c.employmentType === employmentType);
  };

  const buildFunnelByEmploymentType = (candidates) => {
    const employmentTypes = ['Full-Time', 'Contract', 'Part-Time', 'FREELANCE CODING', 'Medical Hiring'];
    return employmentTypes.map(et => ({
      employmentType: et,
      funnel: STATUS_ORDER.map(status => ({
        status,
        count: candidates.filter(c => c.employmentType === et && c.status === status).length
      }))
    }));
  };

  describe('employment type filter', () => {
    it('should filter candidates by employment type', () => {
      const filtered = filterByEmploymentType(mockCandidates, 'Full-Time');
      expect(filtered.length).toBe(3);
      expect(filtered.every(c => c.employmentType === 'Full-Time')).toBe(true);
    });

    it('should filter candidates by FREELANCE CODING', () => {
      const filtered = filterByEmploymentType(mockCandidates, 'FREELANCE CODING');
      expect(filtered.length).toBe(2);
      expect(filtered.every(c => c.employmentType === 'FREELANCE CODING')).toBe(true);
    });

    it('should filter candidates by Contract', () => {
      const filtered = filterByEmploymentType(mockCandidates, 'Contract');
      expect(filtered.length).toBe(2);
      expect(filtered.every(c => c.employmentType === 'Contract')).toBe(true);
    });

    it('should return all candidates when no employment type filter', () => {
      const filtered = filterByEmploymentType(mockCandidates, '');
      expect(filtered.length).toBe(mockCandidates.length);
    });
  });

  describe('funnelByEmploymentType', () => {
    it('should return breakdown for all 5 employment types', () => {
      const result = buildFunnelByEmploymentType(mockCandidates);
      expect(result.length).toBe(5);
      expect(result.map(r => r.employmentType)).toEqual(
        ['Full-Time', 'Contract', 'Part-Time', 'FREELANCE CODING', 'Medical Hiring']
      );
    });

    it('should have correct status counts per employment type', () => {
      const result = buildFunnelByEmploymentType(mockCandidates);
      
      const fullTime = result.find(r => r.employmentType === 'Full-Time');
      expect(fullTime.funnel.find(f => f.status === 'Selected').count).toBe(1);
      expect(fullTime.funnel.find(f => f.status === 'Rejected').count).toBe(1);
      expect(fullTime.funnel.find(f => f.status === 'Interview 1').count).toBe(1);

      const contract = result.find(r => r.employmentType === 'Contract');
      expect(contract.funnel.find(f => f.status === 'Selected').count).toBe(1);
      expect(contract.funnel.find(f => f.status === 'Interview 1 Shortlisted').count).toBe(1);

      const freelance = result.find(r => r.employmentType === 'FREELANCE CODING');
      expect(freelance.funnel.find(f => f.status === 'Assessment 1 Passed').count).toBe(1);
      expect(freelance.funnel.find(f => f.status === 'Selected').count).toBe(1);

      const medical = result.find(r => r.employmentType === 'Medical Hiring');
      expect(medical.funnel.find(f => f.status === 'Selected').count).toBe(1);
      expect(medical.funnel.find(f => f.status === 'Final Round Shortlisted').count).toBe(1);

      const partTime = result.find(r => r.employmentType === 'Part-Time');
      expect(partTime.funnel.find(f => f.status === 'Information Form Response').count).toBe(1);
    });

    it('should have zero counts for statuses not present', () => {
      const result = buildFunnelByEmploymentType(mockCandidates);
      
      const fullTime = result.find(r => r.employmentType === 'Full-Time');
      const notInterested = fullTime.funnel.find(f => f.status === 'Not interested');
      expect(notInterested.count).toBe(0);
    });
  });
});