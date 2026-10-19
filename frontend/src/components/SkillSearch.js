import React, { useEffect, useMemo, useState } from 'react';
import StatusBadge from './StatusBadge';
import { fetchCandidates } from '../api/api';

function SkillSearch() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [skillQuery, setSkillQuery] = useState('');
  const [filters, setFilters] = useState({
    roleCode: '',
    employmentType: '',
    experience: '',
    scoreMin: ''
  });

  useEffect(() => {
    fetchCandidates()
      .then((res) => {
        setCandidates(res.data);
        setLoadError('');
      })
      .catch((err) => {
        console.error('[SkillSearch] load failed:', err);
        setLoadError(`Could not load candidates: ${err.message}`);
      })
      .finally(() => setLoading(false));
  }, []);

  const skillsList = useMemo(() => {
    if (!skillQuery.trim()) return [];
    return skillQuery
      .toLowerCase()
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }, [skillQuery]);

  const results = useMemo(() => {
    return candidates.filter((c) => {
      const cSkills = (c.skills || []).map(s => s.toLowerCase().trim());
      
      const matchesSkills = skillsList.length > 0
        ? skillsList.every(skill => cSkills.some(cs => cs.includes(skill)))
        : true;

      const matchesRoleCode = filters.roleCode
        ? c.roleCode?.toUpperCase() === filters.roleCode.toUpperCase().trim()
        : true;

      const matchesEmploymentType = filters.employmentType
        ? c.employmentType === filters.employmentType
        : true;

      const matchesExperience = filters.experience
        ? c.yearsOfExperience >= Number(filters.experience)
        : true;

      const matchesScore = filters.scoreMin
        ? (c.score?.suitabilityRating || 0) >= Number(filters.scoreMin)
        : true;

      return matchesSkills && matchesRoleCode && matchesEmploymentType && matchesExperience && matchesScore;
    });
  }, [candidates, skillsList, filters]);

  const getStatusDisplay = (c) => {
    const assessmentStatus = c.assessmentStatus || 'Not Set';
    if (assessmentStatus !== 'Not Set') {
      return assessmentStatus;
    }
    return c.status || '—';
  };

  const handleClearFilters = () => {
    setSkillQuery('');
    setFilters({
      roleCode: '',
      employmentType: '',
      experience: '',
      scoreMin: ''
    });
  };

  return (
    <>
      <h1 className="page-title">Skill Search</h1>
      <p className="page-sub">Search candidates by skills — results match against candidate profile skills</p>

      {loadError && <div className="alert alert-error">⚠️ {loadError}</div>}

      <div className="filters-row">
        <input
          type="text"
          placeholder="Type skills (comma-separated, e.g. java, sql, react)"
          value={skillQuery}
          onChange={(e) => setSkillQuery(e.target.value)}
          style={{ minWidth: 320 }}
        />
        <select value={filters.roleCode} onChange={(e) => setFilters({ ...filters, roleCode: e.target.value })}>
          <option value="">All role codes</option>
          {[...new Set(candidates.map(c => c.roleCode).filter(Boolean))].sort().map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
        <select value={filters.employmentType} onChange={(e) => setFilters({ ...filters, employmentType: e.target.value })}>
          <option value="">All employment types</option>
          <option value="Full-Time">Full-Time</option>
          <option value="Part-Time">Part-Time</option>
          <option value="Contract">Contract</option>
          <option value="Internship">Internship</option>
          <option value="FREELANCE CODING">Freelance Coding</option>
        </select>
        <input type="number" min="0" placeholder="Min experience (yrs)" value={filters.experience} onChange={(e) => setFilters({ ...filters, experience: e.target.value })} style={{ width: 130 }} />
        <input type="number" min="0" max="10" placeholder="Min score" value={filters.scoreMin} onChange={(e) => setFilters({ ...filters, scoreMin: e.target.value })} style={{ width: 110 }} />
        <button className="btn-secondary" onClick={handleClearFilters}>Clear</button>
      </div>

      {loading ? (
        <p style={{ padding: 20, color: 'var(--text-500)' }}>Loading candidates...</p>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Candidate Name</th>
                <th>Role Code</th>
                <th>Location</th>
                <th>Last Status</th>
                <th>Resume Link</th>
              </tr>
            </thead>
            <tbody>
              {results.map((c) => (
                <tr key={c._id}>
                  <td className="name-cell">
                    <button className="name-link" onClick={() => { window.open(`https://biztech-ats-backend-0jpt.onrender.com${c.resumeUrl}`, '_blank'); }}><strong>{c.fullName}</strong></button>
                    <br /><small>{c.email}</small>
                  </td>
                  <td>{c.roleCode}</td>
                  <td>{c.location || '—'}</td>
                  <td><StatusBadge status={getStatusDisplay(c)} label={getStatusDisplay(c)} /></td>
                  <td>
                    {c.resumeUrl && (
                      <button className="name-link" onClick={() => { window.open(`https://biztech-ats-backend-0jpt.onrender.com${c.resumeUrl}`, '_blank'); }}>
                        View Resume
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.length === 0 && <p style={{ padding: 20, color: 'var(--text-500)' }}>No candidates match these filters.</p>}
        </div>
      )}
    </>
  );
}

export default SkillSearch;