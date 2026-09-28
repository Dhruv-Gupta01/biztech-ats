import React, { useEffect, useMemo, useState } from 'react';
import { fetchCandidates, fetchRoles, updateCandidate } from '../api/api';
import CandidateProfileModal from './CandidateProfileModal';

const STATUS_OPTIONS = [
  'Naukri Response',
  'Information Form',
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
  'Rejected'
];

const EMP_TYPE_OPTIONS = ['Full-Time', 'Part-Time', 'Contract', 'Internship'];

function RoleCodeData() {
  const [roles, setRoles] = useState([]);
  const [allCandidates, setAllCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedRoleCode, setSelectedRoleCode] = useState('');
  const [savingNotesId, setSavingNotesId] = useState(null);
  const [profileCandidate, setProfileCandidate] = useState(null);
  const [notesDraft, setNotesDraft] = useState({});

  const [filters, setFilters] = useState({ employmentType: '', status: '', source: '', query: '' });

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchRoles(), fetchCandidates()])
      .then(([rolesRes, candidatesRes]) => {
        setRoles(rolesRes.data || []);
        setAllCandidates(candidatesRes.data || []);
        setLoadError('');
      })
      .catch((err) => setLoadError(`Could not load data: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  const filteredCandidates = useMemo(() => {
    let data = allCandidates;
    if (selectedRoleCode) {
      data = data.filter((c) => c.roleCode === selectedRoleCode);
    }
    if (filters.employmentType) {
      data = data.filter((c) => c.employmentType === filters.employmentType);
    }
    if (filters.status) {
      data = data.filter((c) => c.status === filters.status);
    }
    if (filters.source) {
      data = data.filter((c) => c.source === filters.source);
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      data = data.filter((c) =>
        (c.fullName || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.location || '').toLowerCase().includes(q) ||
        (c.roleCode || '').toLowerCase().includes(q) ||
        (c.skills || []).some((s) => (s || '').toLowerCase().includes(q))
      );
    }
    return data.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  }, [allCandidates, selectedRoleCode, filters]);

  const role = useMemo(() => roles.find((r) => r.code === selectedRoleCode), [roles, selectedRoleCode]);

  const sources = useMemo(() => {
    const set = new Set(allCandidates.map((c) => c.source).filter(Boolean));
    return [...set].sort();
  }, [allCandidates]);

  const handleNotesBlur = async (candidateId, currentNotes) => {
    const trimmed = (currentNotes || '').trim();
    setNotesDraft((prev) => ({ ...prev, [candidateId]: trimmed }));
    setSavingNotesId(candidateId);
    try {
      await updateCandidate(candidateId, { generalRemarks: trimmed, changedBy: 'Recruiter' });
      setAllCandidates((prev) => prev.map((c) => (c._id === candidateId ? { ...c, generalRemarks: trimmed } : c)));
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setSavingNotesId(null);
    }
  };

  const handleNotesChange = (candidateId, value) => {
    setNotesDraft((prev) => ({ ...prev, [candidateId]: value }));
  };

  return (
    <div>
      <h1 className="page-title">Role Code Data</h1>
      <p className="page-sub">Select a role code to view its candidates, status breakdown, and notes.</p>

      {loadError && <div className="alert alert-error">⚠️ {loadError}</div>}

      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)', marginRight: 8 }}>Role Code</label>
        <select value={selectedRoleCode} onChange={(e) => setSelectedRoleCode(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border)', minWidth: 220 }}>
          <option value="">Select a role code...</option>
          {roles.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.title}</option>)}
        </select>
      </div>

      {selectedRoleCode && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <strong>{role?.title || selectedRoleCode}</strong>
              <span style={{ fontSize: 12.5, color: 'var(--text-500)', marginLeft: 8 }}>{filteredCandidates.length} candidate(s)</span>
            </div>
          </div>

          <div className="filters-row" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.01)' }}>
            <select value={filters.employmentType} onChange={(e) => setFilters({ ...filters, employmentType: e.target.value })}>
              <option value="">All employment types</option>
              {EMP_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
              <option value="">All sources</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              placeholder="Search name, email, phone, location, skills..."
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
              style={{ minWidth: 220 }}
            />
          </div>

          {filteredCandidates.length === 0 ? (
            <p style={{ padding: 20, color: 'var(--text-500)' }}>No candidates match the current filters.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone Number</th>
                  <th>Email</th>
                  <th>Latest Status</th>
                  <th>Notes</th>
                  <th>View CV</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((c) => (
                  <tr key={c._id}>
                    <td>
                      <button className="link-button" onClick={() => setProfileCandidate(c)}>
                        {c.fullName}
                      </button>
                    </td>
                    <td>{c.phone || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td>
                      <span className="badge badge-applied">{c.status || 'Naukri Response'}</span>
                    </td>
                    <td style={{ minWidth: 220, maxWidth: 320 }}>
                      <textarea
                        value={notesDraft[c._id] ?? c.generalRemarks ?? ''}
                        onChange={(e) => handleNotesChange(c._id, e.target.value)}
                        onBlur={() => handleNotesBlur(c._id, notesDraft[c._id] ?? c.generalRemarks ?? '')}
                        placeholder="Add notes..."
                        rows={2}
                        style={{ width: '100%', fontSize: 12.5, padding: 6, borderRadius: 4, border: '1px solid var(--border)', resize: 'vertical' }}
                      />
                      {savingNotesId === c._id && <span style={{ fontSize: 11, color: 'var(--text-500)' }}>Saving...</span>}
                    </td>
                    <td>
                      {c.resumeUrl ? (
                        <a href={`${process.env.REACT_APP_API_URL}${c.resumeUrl}`} target="_blank" rel="noopener noreferrer" className="link-button">
                          View CV
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-500)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {profileCandidate && (
        <CandidateProfileModal
          candidate={profileCandidate}
          role={roles.find((r) => r.code === profileCandidate.roleCode)}
          onClose={() => setProfileCandidate(null)}
        />
      )}
    </div>
  );
}

export default RoleCodeData;
