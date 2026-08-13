import React, { useEffect, useMemo, useState } from 'react';
import StatusBadge from './StatusBadge';
import { fetchCandidates } from '../api/api';

function SkillSearch() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [active, setActive] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchCandidates()
      .then((res) => { setCandidates(res.data); setLoadError(''); })
      .catch((err) => { console.error('[SkillSearch] load failed:', err); setLoadError(`Could not load candidates: ${err.message}`); })
      .finally(() => setLoading(false));
  }, []);

  const allSkills = useMemo(() => [...new Set(candidates.flatMap((c) => c.skills || []))].sort(), [candidates]);

  const toggleSkill = (skill) => {
    setActive((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]));
  };

  const results = useMemo(() => {
    return candidates.filter((c) => {
      const matchesQuery = query ? c.fullName.toLowerCase().includes(query.toLowerCase()) : true;
      const matchesSkills = active.length ? active.every((s) => (c.skills || []).includes(s)) : true;
      return matchesQuery && matchesSkills;
    });
  }, [candidates, query, active]);

  return (
    <>
      <h1 className="page-title">Skill Search</h1>
      <p className="page-sub">Find candidates by name or combined skill tags — live from the database</p>

      {loadError && <div className="alert alert-error">⚠️ {loadError}</div>}

      <div className="filters-row">
        <input placeholder="Search by candidate name..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 260 }} />
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-500)' }}>Loading candidates...</p>
      ) : (
        <>
          {allSkills.length === 0 ? (
            <p style={{ color: 'var(--text-500)' }}>No skills on file yet — they'll appear here once candidates apply.</p>
          ) : (
            <div className="skill-tags-bar">
              {allSkills.map((s) => (
                <button key={s} className={'skill-chip' + (active.includes(s) ? ' on' : '')} onClick={() => toggleSkill(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-2">
            {results.map((c) => (
              <div className="card candidate-card" key={c._id}>
                <div className="candidate-card-head">
                  <div>
                    <strong>{c.fullName}</strong>
                    <div style={{ fontSize: 12.5, color: 'var(--text-500)' }}>{c.roleCode} · {c.location || '—'} · {c.yearsOfExperience} yrs</div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div>{(c.skills || []).map((s) => <span className="tag" key={s}>{s}</span>)}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-500)' }}>Suitability: {c.score?.suitabilityRating ?? 'Not scored'}</div>
              </div>
            ))}
            {results.length === 0 && candidates.length > 0 && <p style={{ color: 'var(--text-500)' }}>No candidates match this combination of skills.</p>}
          </div>
        </>
      )}
    </>
  );
}

export default SkillSearch;