import React, { useEffect, useMemo, useRef, useState } from 'react';
import StatusBadge from './StatusBadge';
import CandidateProfileModal from './CandidateProfileModal';
import { useAuth } from '../auth/AuthContext';
import {
  fetchCandidates, scoreCandidate, bulkImportCandidates, fetchSlackMappings, assignCandidatesToSlack,
  deleteCandidateRecord, fetchRoles, recordInterviewStage, fetchFormSyncStatus, runFormSyncNow, analyzeCandidatesBulk,
  updateCandidate
} from '../api/api';
import { calculateSuitability, suggestDecision } from '../utils/scoring';

const typeLabel = (t) => (t === 'Contract' ? 'Contractual' : t === 'Part-Time' ? 'Part Time' : t === 'Internship' ? 'Internship' : 'Full Time');
const money = (n) => (n ? `₹${(n / 100000).toFixed(1)}L` : '—');

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

const ASSESSMENT_STATUSES = ['Selected', 'Rejected', 'Not Appeared', 'Rescheduled', 'Not interested', 'Refered for other position'];
const INTERVIEW_OPTIONS = ['Selected', 'Rejected', 'Not Appeared', 'Rescheduled', 'Not interested', 'Refered for other position'];
const CV_SCREENING_OPTIONS = ['Selected', 'Rejected', 'Refered for other position'];

const SAMPLE_CSV = `fullName,email,phone,location,roleCode,employmentType,yearsOfExperience,ctcCurrent,ctcExpected,noticePeriod,skills,status,source
Amit Kumar,amit.kumar@example.com,9812345670,Delhi,BTA-ENG-01,Full-Time,3,800000,1100000,30 days,React;Node.js;MongoDB,Information Form,CSV Import
Sara Khan,sara.khan@example.com,9812345671,Pune,BTA-DS-01,Contract,5,1500000,1900000,15 days,Python;SQL,Interview 1,CSV Import
`;

function assessmentBadgeClass(assessmentStatus) {
  const map = {
    'Selected': 'badge-hired',
    'Rejected': 'badge-rejected',
    'Not Appeared': 'badge-rejected',
    'Rescheduled': 'badge-interviewing',
    'Not interested': 'badge-rejected',
    'Refered for other position': 'badge-applied'
  };
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
  const [analyzerScores, setAnalyzerScores] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const csvInputRef = useRef(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [slackMappings, setSlackMappings] = useState([]);
  const [slackTargetId, setSlackTargetId] = useState('');
  const [slackAssigning, setSlackAssigning] = useState(false);
  const [slackResult, setSlackResult] = useState(null);

   const [deleteError, setDeleteError] = useState('');

   const [stagesOpenId, setStagesOpenId] = useState(null);
   const [stageError, setStageError] = useState('');
   const [stageForm, setStageForm] = useState({ interviewer: '', rating: '', feedback: '' });
   const [stageSubmitting, setStageSubmitting] = useState(false);

  const [interviewRounds, setInterviewRounds] = useState(['Interview']);
  const [cvScreeningDraft, setCvScreeningDraft] = useState({});
  const [roundDraft, setRoundDraft] = useState({});
  const [referToOtherRole, setReferToOtherRole] = useState({}); // { [candidateId]: roleCode }

  const addInterviewRound = () => {
    const nextNum = interviewRounds.length + 1;
    setInterviewRounds((prev) => [...prev, `Interview Round ${nextNum}`]);
  };

  const removeInterviewRound = (roundName) => {
    setInterviewRounds((prev) => prev.filter((r) => r !== roundName));
  };

  const saveCvScreening = async (id, value) => {
    try {
      await updateCandidate(id, { cvScreening: value || '', changedBy: user?.fullName });
      setCandidates((prev) => prev.map((c) => (c._id === id ? { ...c, cvScreening: value || '' } : c)));
    } catch (err) {
      console.error('Failed to save CV screening:', err);
    }
  };

  const saveAssessmentStatus = async (id, status) => {
    try {
      const res = await updateCandidate(id, { assessmentStatus: status, changedBy: user?.fullName });
      setCandidates((prev) => prev.map((c) => (c._id === id ? res.data : c)));
    } catch (err) {
      console.error('Failed to save assessment status:', err);
    }
  };

  const saveInterviewRound = async (id, roundName, value) => {
      try {
      const candidate = candidates.find((x) => x._id === id);
      const updated = candidate ? (candidate.interviewRounds || {}) : {};
      await updateCandidate(id, { interviewRounds: { ...updated, [roundName]: value }, changedBy: user?.fullName });
      setCandidates((prev) => prev.map((c) => (c._id === id ? { ...c, interviewRounds: { ...c.interviewRounds, [roundName]: value } } : c)));
    } catch (err) {
      console.error('Failed to save interview round:', err);
    }
  };

  const handleReferToOtherRole = async (candidateId, newRoleCode) => {
    if (!newRoleCode) return;
    try {
      const res = await updateCandidate(candidateId, { roleCode: newRoleCode.toUpperCase().trim(), changedBy: user?.fullName });
      setCandidates((prev) => prev.map((c) => (c._id === candidateId ? { ...c, ...res.data } : c)));
      setReferToOtherRole((prev) => ({ ...prev, [candidateId]: newRoleCode.toUpperCase().trim() }));
    } catch (err) {
      console.error('Failed to update candidate role code:', err);
    }
  };

  // Joining date editing
  const [editingDate, setEditingDate] = useState({});

  // Candidate profile modal (opened by clicking a name)
  const [profileCandidate, setProfileCandidate] = useState(null);

  // Google Form response sync
  const [formSyncStatus, setFormSyncStatus] = useState(null);
  const [formSyncing, setFormSyncing] = useState(false);
  const [formSyncResult, setFormSyncResult] = useState(null);

  const loadCandidates = () => {
    setLoading(true);
    fetchCandidates(filters)
      .then((res) => {
        setCandidates(res.data);
        setLoadError('');
        setProfileCandidate((prev) => {
          if (!prev) return prev;
          const updated = res.data.find((c) => c._id === prev._id);
          return updated || prev;
        });
      })
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
      const ok = res.data && res.data.status !== 'failed';
      const details = res.data ? [
        `Forms processed: ${res.data.formsProcessed || 0}`,
        `Matched: ${res.data.totalMatched || 0}`,
        `Unmatched: ${res.data.totalUnmatched || 0}`,
        ...(res.data.formResults || []).map(fr => `- ${fr.form}: ${fr.status}${fr.matchedCount !== undefined ? ` (${fr.matchedCount} matched)` : ''}${fr.reason ? ` — ${fr.reason}` : ''}`)
      ].join('\n') : '';
      setFormSyncResult({ ok, message: res.message, details });
      loadFormSyncStatus();
      loadCandidates(); // pick up any newly-attached formSubmission data
    } catch (err) {
      setFormSyncResult({ ok: false, message: err.message });
    } finally {
      setFormSyncing(false);
    }
  };

  const roleCodes = useMemo(() => roles.map((r) => r.code).sort(), [roles]);

  // employmentType and free-text search stay client-side on top of the server-filtered set.
  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (filters.employmentType && c.employmentType !== filters.employmentType) return false;
      if (query) {
        const q = query.toLowerCase();
        const haystack = [
          c.fullName, c.email, c.phone, c.location, c.roleCode, c.employmentType, c.source,
          ...(c.skills || []),
          String(c.yearsOfExperience || ''),
          String(c.ctcCurrent || ''),
          String(c.ctcExpected || '')
        ].join(' ').toLowerCase();
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

  const runBulkAnalyze = async () => {
    setAnalyzing(true);
    try {
      const ids = selectedIds.length > 0 ? selectedIds : [];
      const res = await analyzeCandidatesBulk(ids);
      if (res.success && res.data) {
        const scoreMap = {};
        res.data.forEach((item) => {
          scoreMap[item.candidateId] = { score: item.score, breakdown: item.breakdown };
        });
        setAnalyzerScores((prev) => ({ ...prev, ...scoreMap }));
      }
    } catch (err) {
      console.error('Bulk resume analysis failed:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  const roleStages = (roleCode) => {
    const role = roles.find((r) => r.code === roleCode);
    return role ? role.interviewStages : ['Recruiter Screen', 'Technical', 'Hiring Manager'];
  };

  const startEditingDate = (id, field) => {
    setEditingDate({ candidateId: id, field });
  };

  const saveJoiningDate = async (id, field, dateValue) => {
    const date = dateValue ? new Date(dateValue) : null;
    try {
      await updateCandidate(id, { [field]: date, changedBy: user?.fullName });
      setCandidates((prev) => prev.map((c) => (c._id === id ? { ...c, [field]: date } : c)));
    } catch (err) {
      console.error('Failed to save joining date:', err);
    } finally {
      setEditingDate({});
    }
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
      {formSyncResult && (
        <div className={`alert ${formSyncResult.ok ? 'alert-success' : 'alert-error'}`}>
          {formSyncResult.ok ? '✅' : '⚠️'} {formSyncResult.message}
          {formSyncResult.details && (
            <pre style={{ margin: '8px 0 0', padding: 10, background: 'rgba(0,0,0,0.03)', borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap' }}>{formSyncResult.details}</pre>
          )}
        </div>
      )}
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
          {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
          <option value="">All sources</option>
          {allSources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="number" min="0" placeholder="Min Exp (yrs)" value={filters.minExperience} onChange={(e) => setFilters({ ...filters, minExperience: e.target.value })} style={{ width: 110 }} />
        <input type="number" min="0" placeholder="Max Exp (yrs)" value={filters.maxExperience} onChange={(e) => setFilters({ ...filters, maxExperience: e.target.value })} style={{ width: 110 }} />
        <input placeholder="Search name, email, phone, location, skills, roleCode, employmentType, experience, CTC, source" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 220 }} />
        <button className="btn-secondary" onClick={loadCandidates}>Refresh</button>
        <button className="btn-secondary" onClick={exportCSV}>Export CSV</button>
        <button className="btn-secondary" onClick={downloadSampleCSV}>Download Sample CSV</button>
        <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportFile} />
        <button className="btn-primary" onClick={triggerImport} disabled={importing}>{importing ? 'Importing...' : '⭱ Import CSV'}</button>
        <button className="btn-secondary" onClick={runBulkAnalyze} disabled={analyzing || !filters.roleCode || selectedIds.length === 0} title={!filters.roleCode ? 'Select a specific Role Code' : ''}>{analyzing ? 'Analyzing...' : 'Resume Analyzer'}</button>
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
                <th>Current CTC</th><th>Expected CTC</th><th>Notice Period</th>
                <th>Joining Date (Tentative)</th><th>Joining Date (Confirm)</th>
                <th>CV Screening</th>
                {interviewRounds.map((round) => (
                  <th key={round}>
                    {round}{' '}
                    {interviewRounds.length > 1 && (
                      <button
                        onClick={() => removeInterviewRound(round)}
                        style={{ fontSize: 10, padding: '2px 5px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                        title={`Remove ${round}`}
                      >×</button>
                    )}
                  </th>
                ))}
                <th>Analyzer Score</th><th>Status</th><th>Assessment Status</th>
                <th>Slack Group</th>
              </tr>
              <tr>
                <th colSpan="10"></th>
                <th colSpan={interviewRounds.length + 2} style={{ padding: 0, borderBottom: '1px solid var(--border)', textAlign: 'center', fontSize: 11, color: 'var(--text-500)' }}>
                  + Add Interview Round
                  <button onClick={addInterviewRound} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--primary)', color: 'black', border: '2px solid black', borderRadius: 4, cursor: 'pointer', marginLeft: 6 }}>+</button>
                </th>
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
                       <td>{money(c.ctcCurrent)}</td>
                       <td>{money(c.ctcExpected)}</td>
                       <td>{c.noticePeriod || '—'}</td>
                        <td>
                          {editingDate.candidateId === c._id && editingDate.field === 'joiningDateTentative' ? (
                            <input
                              type="date"
                              defaultValue={c.joiningDateTentative ? new Date(c.joiningDateTentative).toISOString().slice(0, 10) : ''}
                              onBlur={(e) => saveJoiningDate(c._id, 'joiningDateTentative', e.target.value)}
                              autoFocus
                              style={{ width: '140px', padding: '4px 6px', fontSize: 12 }}
                            />
                          ) : (
                            <button className="btn-secondary" onClick={() => startEditingDate(c._id, 'joiningDateTentative')} style={{ fontSize: 11.5, padding: '4px 8px' }}>
                              {c.joiningDateTentative ? new Date(c.joiningDateTentative).toLocaleDateString() : 'Set date'}
                            </button>
                          )}
                        </td>
                   <td>
                          {editingDate.candidateId === c._id && editingDate.field === 'joiningDateConfirm' ? (
                            <input
                              type="date"
                              defaultValue={c.joiningDateConfirm ? new Date(c.joiningDateConfirm).toISOString().slice(0, 10) : ''}
                              onBlur={(e) => saveJoiningDate(c._id, 'joiningDateConfirm', e.target.value)}
                              autoFocus
                              style={{ width: '140px', padding: '4px 6px', fontSize: 12 }}
                            />
                          ) : (
                            <button className="btn-secondary" onClick={() => startEditingDate(c._id, 'joiningDateConfirm')} style={{ fontSize: 11.5, padding: '4px 8px' }}>
                              {c.joiningDateConfirm ? new Date(c.joiningDateConfirm).toLocaleDateString() : 'Set date'}
                            </button>
                          )}
                        </td>
                        <td>
                          <select
                            value={cvScreeningDraft[c._id] ?? c.cvScreening ?? ''}
                            onChange={(e) => {
                              const val = e.target.value || '';
                              setCvScreeningDraft((prev) => ({ ...prev, [c._id]: val }));
                              saveCvScreening(c._id, val);
                            }}
                            style={{ padding: '2px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border)' }}
                          >
                            <option value="">—</option>
                            {CV_SCREENING_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        </td>
                        {interviewRounds.map((round) => (
                          <td key={round}>
                            <select
                              value={(c.interviewRounds || {})[round] || ''}
                              onChange={(e) => saveInterviewRound(c._id, round, e.target.value)}
                              style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 120 }}
                            >
                              <option value="">Not set</option>
                              {INTERVIEW_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                            {(c.interviewRounds || {})[round] === 'Refered for other position' && (
                              <select
                                value={referToOtherRole[c._id] || ''}
                                onChange={(e) => handleReferToOtherRole(c._id, e.target.value)}
                                style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 100, marginTop: 4 }}
                              >
                                <option value="">Select role...</option>
                                {roleCodes.filter((code) => code !== c.roleCode).map((code) => <option key={code} value={code}>{code}</option>)}
                              </select>
                            )}
                          </td>
                        ))}
                        <td>
                          {analyzerScores[c._id] ? (
                            <span style={{ fontWeight: 600, color: analyzerScores[c._id].score >= 7 ? 'var(--green)' : analyzerScores[c._id].score >= 4 ? 'var(--amber)' : 'var(--red)' }}>
                              {analyzerScores[c._id].score}/10
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-500)', fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td><StatusBadge status={c.status} /></td>
                        <td>
                          <select
                            value={c.assessmentStatus || ''}
                            onChange={(e) => saveAssessmentStatus(c._id, e.target.value)}
                            className={assessmentBadgeClass(c.assessmentStatus)}
                            style={{ border: '1px solid var(--border)', background: 'transparent', padding: '2px 6px', fontSize: 12, cursor: 'pointer', borderRadius: 4, minWidth: 140, color: 'var(--text-900)' }}
                          >
                            {ASSESSMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td>{c.slackGroup || '—'}</td>
                      </tr>
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