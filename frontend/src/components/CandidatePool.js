import React, { useEffect, useMemo, useRef, useState } from 'react';
import StatusBadge from './StatusBadge';
import CandidateProfileModal from './CandidateProfileModal';
import { useAuth } from '../auth/AuthContext';
import {
  fetchCandidates, scoreCandidate, bulkImportCandidates, fetchSlackMappings, assignCandidatesToSlack,
  deleteCandidateRecord, fetchRoles, recordInterviewStage, fetchFormSyncStatus, runFormSyncNow
} from '../api/api';
import { calculateSuitability, suggestDecision } from '../utils/scoring';

const typeLabel = (t) => (t === 'Contract' ? 'Contractual' : t === 'Part-Time' ? 'Part Time' : t === 'Internship' ? 'Internship' : 'Full Time');
const money = (n) => (n ? `₹${(n / 100000).toFixed(1)}L` : '—');

const SAMPLE_CSV = `fullName,email,phone,location,roleCode,employmentType,yearsOfExperience,ctcCurrent,ctcExpected,noticePeriod,skills,status,source
Amit Kumar,amit.kumar@example.com,9812345670,Delhi,BTA-ENG-01,Full-Time,3,800000,1100000,30 days,React;Node.js;MongoDB,Applied,CSV Import
Sara Khan,sara.khan@example.com,9812345671,Pune,BTA-DS-01,Contract,5,1500000,1900000,15 days,Python;SQL,Screened,CSV Import
`;

function assessmentBadgeClass(assessmentStatus) {
  const map = { 'Not started': 'badge-applied', 'In progress': 'badge-interviewing', 'Selected': 'badge-hired', 'Not selected': 'badge-rejected' };
  return 'badge ' + (map[assessmentStatus] || 'badge-applied');
}

function toCSV(rows) {
  const headers = ['Name', 'Email', 'Role Code', 'Type', 'Location', 'CTC Current', 'CTC Expected', 'Status', 'Assessment Status', 'Suitability', 'Updated'];
  const lines = rows.map((c) => [
    c.fullName, c.email, c.roleCode, typeLabel(c.employmentType), c.location || '',
    c.ctcCurrent || '', c.ctcExpected || '', c.status, c.assessmentStatus, c.score?.suitabilityRating ?? '', c.createdAt || ''
  ].join(','));
  return [headers.join(','), ...lines].join('\n');
}

function CandidatePool() {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [allSources, setAllSources] = useState([]); // for the Source filter dropdown, derived once from an unfiltered fetch
  const [roles, setRoles] = useState([]); // needed for each role's interviewStages list
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Filters — roleCode/employmentType/status/experience/source are now all sent
  // to the backend (SRD 3.2's full filter set); free-text name/location/skill
  // search stays client-side since it's a simple substring match on already-loaded data.
  const [filters, setFilters] = useState({ roleCode: '', employmentType: '', status: '', minExperience: '', maxExperience: '', source: '' });
  const [query, setQuery] = useState('');

  const [scoringId, setScoringId] = useState(null);
  const [scoreForm, setScoreForm] = useState({ skillScore: '', experienceScore: '', remarks: '', decision: 'Screened', assessmentStatus: 'In progress' });
  const [scoreError, setScoreError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const csvInputRef = useRef(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [slackMappings, setSlackMappings] = useState([]);
  const [slackTargetId, setSlackTargetId] = useState('');
  const [slackAssigning, setSlackAssigning] = useState(false);
  const [slackResult, setSlackResult] = useState(null);

  const [historyOpenId, setHistoryOpenId] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  // Interview stages panel
  const [stagesOpenId, setStagesOpenId] = useState(null);
  const [stageForm, setStageForm] = useState({ interviewer: '', rating: '', feedback: '' });
  const [stageError, setStageError] = useState('');
  const [stageSubmitting, setStageSubmitting] = useState(false);

  // Candidate profile modal (opened by clicking a name)
  const [profileCandidate, setProfileCandidate] = useState(null);

  // Google Form response sync
  const [formSyncStatus, setFormSyncStatus] = useState(null);
  const [formSyncing, setFormSyncing] = useState(false);
  const [formSyncResult, setFormSyncResult] = useState(null);

  const loadCandidates = () => {
    setLoading(true);
    fetchCandidates(filters)
      .then((res) => { setCandidates(res.data); setLoadError(''); })
      .catch((err) => { console.error('[CandidatePool] fetchCandidates failed:', err); setLoadError(`Could not load candidates: ${err.message}`); })
      .finally(() => setLoading(false));
  };

  // Re-fetch from the server whenever a server-side filter changes.
  useEffect(loadCandidates, [filters.roleCode, filters.status, filters.minExperience, filters.maxExperience, filters.source]); // eslint-disable-line react-hooks/exhaustive-deps

  // One unfiltered fetch on mount just to populate the Source dropdown options and role list.
  useEffect(() => {
    fetchCandidates().then((res) => setAllSources([...new Set(res.data.map((c) => c.source).filter(Boolean))].sort())).catch(() => {});
    fetchRoles().then((res) => setRoles(res.data)).catch((err) => console.error('[CandidatePool] fetchRoles failed:', err));
  }, []);

  useEffect(() => {
    fetchSlackMappings()
      .then((res) => {
        setSlackMappings(res.data);
        const firstActive = res.data.find((m) => m.active);
        if (firstActive) setSlackTargetId(firstActive._id);
      })
      .catch((err) => console.error('[CandidatePool] fetchSlackMappings failed:', err));
  }, []);

  const loadFormSyncStatus = () => {
    fetchFormSyncStatus().then((res) => setFormSyncStatus(res.data)).catch((err) => console.error('[CandidatePool] fetchFormSyncStatus failed:', err));
  };
  useEffect(loadFormSyncStatus, []);

  const syncFormResponses = async () => {
    setFormSyncing(true);
    setFormSyncResult(null);
    try {
      const res = await runFormSyncNow();
      setFormSyncResult({ ok: res.data.status !== 'failed', message: res.message });
      loadFormSyncStatus();
      loadCandidates(); // pick up any newly-attached formSubmission data
    } catch (err) {
      setFormSyncResult({ ok: false, message: err.message });
    } finally {
      setFormSyncing(false);
    }
  };

  const roleCodes = useMemo(() => [...new Set(candidates.map((c) => c.roleCode))].sort(), [candidates]);

  // employmentType and free-text search stay client-side on top of the server-filtered set.
  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (filters.employmentType && c.employmentType !== filters.employmentType) return false;
      if (query) {
        const q = query.toLowerCase();
        const haystack = [c.fullName, c.location, ...(c.skills || [])].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [candidates, filters.employmentType, query]);

  const exportCSV = () => {
    const blob = new Blob([toCSV(filtered)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'candidate_pool_export.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSampleCSV = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'candidate_import_sample.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const triggerImport = () => csvInputRef.current && csvInputRef.current.click();

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportResult({ error: 'Please select a .csv file.' });
      e.target.value = '';
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const res = await bulkImportCandidates(file);
      setImportResult({ message: res.message, insertedCount: res.data.insertedCount, skippedCount: res.data.skippedCount, errors: res.data.errors });
      loadCandidates();
    } catch (err) {
      setImportResult({ error: err.message });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const toggleSelected = (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleSelectAllFiltered = () => {
    const filteredIds = filtered.map((c) => c._id);
    const allSelected = filteredIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !filteredIds.includes(id)) : [...new Set([...selectedIds, ...filteredIds])]);
  };

  const assignToSlack = async () => {
    if (!slackTargetId || selectedIds.length === 0) return;
    setSlackAssigning(true);
    setSlackResult(null);
    try {
      const res = await assignCandidatesToSlack(selectedIds, slackTargetId, user?.fullName);
      setSlackResult({ ok: res.data.slackPosted, message: res.message });
      setSelectedIds([]);
      loadCandidates();
    } catch (err) {
      setSlackResult({ ok: false, message: err.message });
    } finally {
      setSlackAssigning(false);
    }
  };

  const removeCandidate = async (c) => {
    if (!window.confirm(`Remove ${c.fullName} from the candidate pool? This cannot be undone.`)) return;
    setDeleteError('');
    try {
      await deleteCandidateRecord(c._id);
      setCandidates((prev) => prev.filter((x) => x._id !== c._id));
      setSelectedIds((prev) => prev.filter((id) => id !== c._id));
    } catch (err) {
      setDeleteError(`Could not remove ${c.fullName}: ${err.message}`);
    }
  };

  const openScoreForm = (c) => {
    setScoreError('');
    setScoringId(c._id);
    setScoreForm({
      skillScore: c.score?.skillScore ?? '',
      experienceScore: c.score?.experienceScore ?? '',
      remarks: c.assessmentRemarks || '',
      decision: c.status && c.status !== 'Applied' ? c.status : 'Screened',
      assessmentStatus: c.assessmentStatus || 'In progress'
    });
  };

  const liveRating = calculateSuitability(Number(scoreForm.skillScore) || null, Number(scoreForm.experienceScore) || null);

  const saveScore = async (id) => {
    setScoreError('');
    try {
      const res = await scoreCandidate(id, {
        skillScore: Number(scoreForm.skillScore),
        experienceScore: Number(scoreForm.experienceScore),
        assessmentRemarks: scoreForm.remarks,
        status: scoreForm.decision,
        assessmentStatus: scoreForm.assessmentStatus,
        changedBy: user?.fullName
      });
      setCandidates((prev) => prev.map((c) => (c._id === id ? res.data : c)));
      setScoringId(null);
    } catch (err) {
      setScoreError(`Could not save score: ${err.message}`);
    }
  };

  const roleStages = (roleCode) => {
    const role = roles.find((r) => r.code === roleCode);
    return role ? role.interviewStages : ['Recruiter Screen', 'Technical', 'Hiring Manager'];
  };

  const openStagesPanel = (c) => {
    setStageError('');
    setStageForm({ interviewer: '', rating: '', feedback: '' });
    setStagesOpenId(stagesOpenId === c._id ? null : c._id);
  };

  const submitStage = async (c) => {
    setStageError('');
    setStageSubmitting(true);
    try {
      const res = await recordInterviewStage(c._id, {
        interviewer: stageForm.interviewer,
        rating: stageForm.rating ? Number(stageForm.rating) : undefined,
        feedback: stageForm.feedback,
        changedBy: user?.fullName
      });
      setCandidates((prev) => prev.map((x) => (x._id === c._id ? res.data : x)));
      setStageForm({ interviewer: '', rating: '', feedback: '' });
    } catch (err) {
      setStageError(`Could not record stage: ${err.message}`);
    } finally {
      setStageSubmitting(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Candidate Pool</h1>
      <p className="page-sub">{candidates.length} candidates on file</p>

      {loadError && <div className="alert alert-error">⚠️ {loadError}</div>}

      {importResult && (
        <div className={`alert ${importResult.error ? 'alert-error' : 'alert-success'}`}>
          {importResult.error ? (<>⚠️ {importResult.error}</>) : (
            <>
              ✅ {importResult.message}
              {importResult.errors.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {importResult.errors.slice(0, 10).map((e, i) => (<li key={i} style={{ fontSize: 12.5 }}>Row {e.row}: {e.reason}</li>))}
                  {importResult.errors.length > 10 && <li style={{ fontSize: 12.5 }}>...and {importResult.errors.length - 10} more.</li>}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {slackResult && (<div className={`alert ${slackResult.ok ? 'alert-success' : 'alert-error'}`}>{slackResult.ok ? '✅' : '⚠️'} {slackResult.message}</div>)}
      {formSyncResult && (<div className={`alert ${formSyncResult.ok ? 'alert-success' : 'alert-error'}`}>{formSyncResult.ok ? '✅' : '⚠️'} {formSyncResult.message}</div>)}
      {deleteError && <div className="alert alert-error">⚠️ {deleteError}</div>}

      <div className="filters-row">
        <select value={filters.roleCode} onChange={(e) => setFilters({ ...filters, roleCode: e.target.value })}>
          <option value="">All role codes</option>
          {roleCodes.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
        <select value={filters.employmentType} onChange={(e) => setFilters({ ...filters, employmentType: e.target.value })}>
          <option value="">All employment types</option>
          <option value="Full-Time">Full Time</option>
          <option value="Contract">Contractual</option>
          <option value="Part-Time">Part Time</option>
          <option value="Internship">Internship</option>
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          {['Applied', 'Screened', 'Shortlisted', 'Interviewing', 'Rejected', 'Hired'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
          <option value="">All sources</option>
          {allSources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="number" min="0" placeholder="Min Exp (yrs)" value={filters.minExperience} onChange={(e) => setFilters({ ...filters, minExperience: e.target.value })} style={{ width: 110 }} />
        <input type="number" min="0" placeholder="Max Exp (yrs)" value={filters.maxExperience} onChange={(e) => setFilters({ ...filters, maxExperience: e.target.value })} style={{ width: 110 }} />
        <input placeholder="Filter by name, location, skill" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 220 }} />
        <button className="btn-secondary" onClick={loadCandidates}>Refresh</button>
        <button className="btn-secondary" onClick={exportCSV}>Export CSV</button>
        <button className="btn-secondary" onClick={downloadSampleCSV}>Download Sample CSV</button>
        <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportFile} />
        <button className="btn-primary" onClick={triggerImport} disabled={importing}>{importing ? 'Importing...' : '⭱ Import CSV'}</button>
      </div>

      <div className="filters-row" style={{ alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-500)' }}>{selectedIds.length} selected</span>
        <select value={slackTargetId} onChange={(e) => setSlackTargetId(e.target.value)}>
          {slackMappings.length === 0 && <option value="">No Slack groups configured</option>}
          {slackMappings.map((m) => (<option key={m._id} value={m._id} disabled={!m.active}>{m.channel}{!m.active ? ' (paused)' : ''}</option>))}
        </select>
        <button className="btn-primary" onClick={assignToSlack} disabled={slackAssigning || selectedIds.length === 0 || !slackTargetId}>
          {slackAssigning ? 'Assigning...' : `# Assign to Slack Group`}
        </button>
        <span style={{ flex: 1 }} />
        {formSyncStatus && (
          <span style={{ fontSize: 12, color: 'var(--text-500)' }}>
            {formSyncStatus.submittedCount} form submission(s) on file
            {formSyncStatus.lastRun ? ` · last synced ${new Date(formSyncStatus.lastRun.startedAt).toLocaleString()}` : ' · never synced'}
          </span>
        )}
        <button className="btn-secondary" onClick={syncFormResponses} disabled={formSyncing}>
          {formSyncing ? 'Syncing...' : '↻ Sync Form Responses'}
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (<p style={{ padding: 20, color: 'var(--text-500)' }}>Loading candidates...</p>) : (
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" onChange={toggleSelectAllFiltered} checked={filtered.length > 0 && filtered.every((c) => selectedIds.includes(c._id))} /></th>
                <th>Candidate</th><th>Role Code</th><th>Type</th><th>Location</th>
                <th>CTC (Current → Expected)</th><th>Notice Period</th><th>Status</th>
                <th>Assessment Status</th><th>Slack Group</th><th></th><th></th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const stages = roleStages(c.roleCode);
                const completed = c.interviewProgress || [];
                const nextStage = stages[completed.length];
                return (
                  <React.Fragment key={c._id}>
                    <tr>
                      <td><input type="checkbox" checked={selectedIds.includes(c._id)} onChange={() => toggleSelected(c._id)} /></td>
                      <td className="name-cell">
                        <button className="name-link" onClick={() => setProfileCandidate(c)}><strong>{c.fullName}</strong></button>
                        <br /><small>{c.email}</small>
                      </td>
                      <td>{c.roleCode}</td>
                      <td>{typeLabel(c.employmentType)}</td>
                      <td>{c.location || '—'}</td>
                      <td>{money(c.ctcCurrent)} → {money(c.ctcExpected)}</td>
                      <td>{c.noticePeriod || '—'}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td>
                        <button className={assessmentBadgeClass(c.assessmentStatus)} style={{ border: 'none' }} onClick={() => openScoreForm(c)}>
                          {c.assessmentStatus || 'Not started'}
                        </button>
                        {c.score?.suitabilityRating != null && (
                          <div style={{ fontSize: 11.5, color: 'var(--text-500)', marginTop: 4 }}>Score: {c.score.suitabilityRating}</div>
                        )}
                      </td>
                      <td>{c.slackGroup || '—'}</td>
                      <td>
                        <button className="btn-secondary" onClick={() => openStagesPanel(c)}>
                          Interview {completed.length}/{stages.length}
                        </button>
                      </td>
                      <td><button className="btn-secondary" onClick={() => setHistoryOpenId(historyOpenId === c._id ? null : c._id)}>History{c.history?.length ? ` (${c.history.length})` : ''}</button></td>
                      <td><button className="btn-secondary" onClick={() => removeCandidate(c)}>Remove</button></td>
                    </tr>
                    {scoringId === c._id && (
                      <tr className="score-row">
                        <td colSpan="13">
                          <div className="score-form" style={{ flexWrap: 'wrap' }}>
                            {scoreError && <div className="alert alert-error" style={{ margin: 0 }}>{scoreError}</div>}
                            <input type="number" min="0" max="10" placeholder="Skill Score (0-10)" value={scoreForm.skillScore}
                              onChange={(e) => setScoreForm({ ...scoreForm, skillScore: e.target.value })} />
                            <input type="number" min="0" max="10" placeholder="Experience Score (0-10)" value={scoreForm.experienceScore}
                              onChange={(e) => setScoreForm({ ...scoreForm, experienceScore: e.target.value })} />
                            <span style={{ fontSize: 12.5, fontWeight: 600, alignSelf: 'center' }}>
                              Suitability: {liveRating ?? '—'} {liveRating != null && `(suggests: ${suggestDecision(liveRating)})`}
                            </span>
                            <label style={{ fontSize: 11.5, color: 'var(--text-500)', alignSelf: 'center' }}>Pipeline stage:</label>
                            <select value={scoreForm.decision} onChange={(e) => setScoreForm({ ...scoreForm, decision: e.target.value })}>
                              {['Screened', 'Shortlisted', 'Interviewing', 'Rejected', 'Hired'].map((s) => <option key={s}>{s}</option>)}
                            </select>
                            <label style={{ fontSize: 11.5, color: 'var(--text-500)', alignSelf: 'center' }}>Assessment status:</label>
                            <select value={scoreForm.assessmentStatus} onChange={(e) => setScoreForm({ ...scoreForm, assessmentStatus: e.target.value })}>
                              {['Not started', 'In progress', 'Selected', 'Not selected'].map((s) => <option key={s}>{s}</option>)}
                            </select>
                            <input placeholder="Assessment remarks" value={scoreForm.remarks}
                              onChange={(e) => setScoreForm({ ...scoreForm, remarks: e.target.value })} style={{ minWidth: 220 }} />
                            <button className="btn-primary" onClick={() => saveScore(c._id)}>Save</button>
                            <button className="btn-secondary" onClick={() => setScoringId(null)}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {stagesOpenId === c._id && (
                      <tr className="score-row">
                        <td colSpan="13">
                          <div style={{ padding: '10px 4px' }}>
                            <strong style={{ fontSize: 12.5 }}>Interview Stages — {c.roleCode}</strong>
                            <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
                              {stages.map((stageName, i) => {
                                const done = completed[i];
                                return (
                                  <li key={stageName} style={{ fontSize: 12.5, marginBottom: 4 }}>
                                    {done ? (
                                      <>✅ <strong>{stageName}</strong> — rating {done.rating ?? '—'}/5, interviewer: {done.interviewer || '—'}
                                        {done.feedback && <> — "{done.feedback}"</>} ({new Date(done.completedAt).toLocaleDateString()})</>
                                    ) : (
                                      <>⬜ <strong>{stageName}</strong> {i === completed.length ? '(next up)' : '(pending)'}</>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                            {nextStage ? (
                              <div className="score-form" style={{ flexWrap: 'wrap' }}>
                                {stageError && <div className="alert alert-error" style={{ margin: 0 }}>{stageError}</div>}
                                <input placeholder="Interviewer name" value={stageForm.interviewer} onChange={(e) => setStageForm({ ...stageForm, interviewer: e.target.value })} />
                                <input type="number" min="1" max="5" placeholder="Rating (1-5)" value={stageForm.rating} onChange={(e) => setStageForm({ ...stageForm, rating: e.target.value })} style={{ width: 110 }} />
                                <input placeholder={`Feedback for "${nextStage}"`} value={stageForm.feedback} onChange={(e) => setStageForm({ ...stageForm, feedback: e.target.value })} style={{ minWidth: 220 }} />
                                <button className="btn-primary" onClick={() => submitStage(c)} disabled={stageSubmitting}>
                                  {stageSubmitting ? 'Saving...' : `Complete "${nextStage}"`}
                                </button>
                              </div>
                            ) : (
                              <p style={{ fontSize: 12.5, color: 'var(--text-500)' }}>All stages completed for this role.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    {historyOpenId === c._id && (
                      <tr className="score-row">
                        <td colSpan="13">
                          <div style={{ padding: '10px 4px' }}>
                            <strong style={{ fontSize: 12.5 }}>Change history</strong>
                            {(!c.history || c.history.length === 0) ? (
                              <p style={{ fontSize: 12.5, color: 'var(--text-500)', margin: '6px 0 0' }}>No changes logged yet.</p>
                            ) : (
                              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                                {[...c.history].reverse().map((h, i) => (
                                  <li key={i} style={{ fontSize: 12.5, marginBottom: 3 }}>
                                    <strong>{h.field}</strong>: "{String(h.oldValue) || '—'}" → "{String(h.newValue)}" — {h.changedBy} · {new Date(h.changedAt).toLocaleString()}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && filtered.length === 0 && <p style={{ padding: 20, color: 'var(--text-500)' }}>No candidates match these filters.</p>}
      </div>

      {profileCandidate && (
        <CandidateProfileModal
          candidate={profileCandidate}
          role={roles.find((r) => r.code === profileCandidate.roleCode)}
          onClose={() => setProfileCandidate(null)}
        />
      )}
    </>
  );
}

export default CandidatePool;