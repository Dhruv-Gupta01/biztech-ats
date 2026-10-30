import React, { useEffect, useMemo, useRef, useState } from 'react';
import StatusBadge from './StatusBadge';
import CandidateProfileModal from './CandidateProfileModal';
import { useAuth } from '../auth/AuthContext';
import {
  fetchCandidates, fetchCandidateIds, fetchCandidateSources, fetchBootcampBatches, assignBootcampBatch, removeFromBootcampBatch, bulkImportCandidates, fetchSlackMappings, assignCandidatesToSlack,
  fetchRoles, fetchFormSyncStatus, runFormSyncNow, analyzeCandidatesBulk,
  updateCandidate, deleteCandidateRecord, fetchProjects, createProject,
  checkCalendlyStatus
} from '../api/api';
import { isFreelanceFilter, isFreelanceLikeType, effectiveEmploymentType } from '../utils/employment';
import { getColumnsForType, getOptionsForColumn } from '../utils/columnOptions';
import { useEmploymentTypes } from '../contexts/EmploymentTypesContext';

const fallbackTypeLabel = (t) => (t === 'Contract' ? 'Contractual' : t === 'Part-Time' ? 'Part Time' : t === 'FREELANCE CODING' ? 'Freelance Coding' : t === 'Medical Hiring' ? 'Medical Hiring' : (t === 'Freelance' || t === 'Freelance/Contract') ? t : 'Full Time');
const money = (n) => (n ? `₹${(n / 100000).toFixed(1)}L` : '—');

const SCREENING_INTERVIEW_OPTIONS = ['Pass', 'Fail', 'Not Appeared', 'Rescheduled', 'Not interested', 'Referred to another position', 'Invited – not booked', 'Booked – no result yet', 'Appeared – result not recorded'];
const CALENDLY_SENT_OPTIONS = ['Sent', 'Not Sent'];
const CALENDLY_STATUS_OPTIONS = ['Booked', 'Not Booked'];
const NDA_ICA_OPTIONS = ['Sent', 'Not Sent', 'Signed', 'Not Signed', 'Doubt', 'Not Interested'];
const SLACK_STATUS_OPTIONS = ['Joined', 'Not Joined', 'Not Interested'];
const BOOTCAMP_ATTEMPTS_OPTIONS = ['Attempt 1', 'Attempt 2', 'Attempt 3'];
const BOOTCAMP_STATUS_OPTIONS = ['Pass', 'Fail', 'Full Fail', 'Not Active', 'Active', 'Direct to client'];
const ONBOARDING_OPTIONS = ['Sent', 'Not Sent', 'Not Interested', 'Done'];
const PROJECT_STATUS_OPTIONS = ['On Hold', 'Complete', 'Not Active', 'In Pipeline', 'Banned / Disqualified'];
const DEFAULT_PROJECTS = ['Terminus', 'Snorkle', 'Alegion'];

const MEDICAL_RESUME_ANALYZER_STATUS_OPTIONS = ['Selected', 'Not selected'];
const MEDICAL_ASSESSMENTS_OPTIONS = ['Sent', 'Not Sent'];
const MEDICAL_ASSESSMENTS_SUBMISSION_OPTIONS = ['Received', 'Not received', 'Not interested'];
const MEDICAL_SUBMISSIONS_EVALUATION_OPTIONS = ['Pass', 'Fail', 'Pending'];
const MEDICAL_ONBOARDING_OPTIONS = ['Sent', 'Not sent', 'Done', 'Not done', 'Not interested'];
const MEDICAL_SLACK_OPTIONS = ['Joined', 'Not joined', 'Not interested'];
const MEDICAL_PROJECT_STATUS_OPTIONS = ['Active', 'Not Active', 'On hold', 'In pipeline'];

const ASSESSMENT_STATUSES = ['Not Set', 'Selected', 'Rejected', 'Not Appeared', 'Rescheduled', 'Not interested', 'Refered for other position'];
const INTERVIEW_OPTIONS = ['Not set', 'Selected', 'Rejected', 'Not Appeared', 'Rescheduled', 'Not interested', 'Refered for other position'];
const CV_SCREENING_OPTIONS = ['Not Set', 'Selected', 'Rejected', 'Refered for other position'];

const SAMPLE_CSV = `fullName,email,phone,location,roleCode,employmentType,yearsOfExperience,ctcCurrent,ctcExpected,noticePeriod,skills,status,source
Amit Kumar,amit.kumar@example.com,9812345670,Delhi,BTA-ENG-01,Full-Time,3,800000,1100000,30 days,React;Node.js;MongoDB,Information Form Response,CSV Import
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

const fmtImported = (d) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function toCSV(rows, freelance = false) {
  if (freelance) {
    const headers = ['Name', 'Email', 'Role Code', 'Location', 'Analyzer Score', 'Screening Interview', 'Calendly Link Sent', 'Calendly Link Status', 'NDA & ICA', 'Slack', 'Bootcamp Attempts', 'Bootcamp Status', 'Onboarding', 'Project', 'Project Status', 'Imported'];
    const lines = rows.map((c) => [
      c.fullName, c.email, c.roleCode, c.location || '',
      c.score?.suitabilityRating ?? '', c.screeningInterview || '', c.calendlyLinkSent || '',
      c.calendlyLinkStatus || '', c.ndaIca || '', c.slackStatus || '',
      c.bootcampAttempts || '', c.bootcampStatus || '', c.onboarding || '',
      c.project || '', c.projectStatus || '', c.createdAt || ''
    ].join(','));
    return [headers.join(','), ...lines].join('\n');
  }
  const headers = ['Name', 'Email', 'Role Code', 'Type', 'Location', 'CTC Current', 'CTC Expected', 'Status', 'Assessment Status', 'Suitability', 'Imported'];
  const lines = rows.map((c) => [
    c.fullName, c.email, c.roleCode, fallbackTypeLabel(c.employmentType), c.location || '',
    c.ctcCurrent || '', c.ctcExpected || '', c.status, c.assessmentStatus, c.score?.suitabilityRating ?? '', c.createdAt || ''
  ].join(','));
  return [headers.join(','), ...lines].join('\n');
}

function CandidatePool() {
  const { user } = useAuth();
  const { employmentTypes, typeLabel } = useEmploymentTypes();
  const [candidates, setCandidates] = useState([]);
  const [allSources, setAllSources] = useState([]);
  const [bootcampBatches, setBootcampBatches] = useState([]);
  const [batchTarget, setBatchTarget] = useState('');       // an existing batch label, or '__new__'
  const [newBatchName, setNewBatchName] = useState('');
  const [batchJoined, setBatchJoined] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResult, setBatchResult] = useState(null);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [newPeopleText, setNewPeopleText] = useState('');
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [filters, setFilters] = useState({ employmentType: '', roleCode: '', statusColumn: '', statusColumnValue: '', minExperience: '', maxExperience: '', source: '', startDate: '', endDate: '' });
  const [query, setQuery] = useState('');

  const [analyzerScores, setAnalyzerScores] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const csvInputRef = useRef(null);

  const [selectedIds, setSelectedIds] = useState([]);
  // Render one page of rows at a time — thousands of rows with inline selects freeze the browser.
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const filterSig = useRef('');
  const [slackMappings, setSlackMappings] = useState([]);
  const [slackTargetId, setSlackTargetId] = useState('');
  const [slackAssigning, setSlackAssigning] = useState(false);
  const [slackResult, setSlackResult] = useState(null);

  const [deleteError, setDeleteError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [analyzerError, setAnalyzerError] = useState('');

  const [interviewRounds, setInterviewRounds] = useState(['Interview']);
  const [cvScreeningDraft, setCvScreeningDraft] = useState({});
  const [referToOtherRole, setReferToOtherRole] = useState({});
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);
  const [newProject, setNewProject] = useState('');
  const [calendlyChecking, setCalendlyChecking] = useState('');
  const [calendlyBulkChecking, setCalendlyBulkChecking] = useState(false);
  const [calendlyBulkResult, setCalendlyBulkResult] = useState(null);
  const [freelanceSaveError, setFreelanceSaveError] = useState('');

  useEffect(() => {
    fetchProjects().then((res) => {
      const list = (res.data || []).map((p) => p.name).filter(Boolean);
      setProjects([...DEFAULT_PROJECTS, ...list.filter((p) => !DEFAULT_PROJECTS.includes(p))]);
    }).catch(() => {});
  }, []);

  const checkCalendlyForCandidate = async (id) => {
    setCalendlyChecking(id);
    try {
      const res = await checkCalendlyStatus(id);
      if (res.data) {
        setCandidates((prev) => prev.map((c) => (c._id === id ? { ...c, ...res.data } : c)));
      }
    } catch (err) {
      console.error('Calendly check failed:', err);
    } finally {
      setCalendlyChecking('');
    }
  };

  // Bulk variant: runs the same per-candidate Calendly lookup for every selected
  // candidate. Runs sequentially so we don't hammer the Calendly API and trip
  // rate limits, and reports how many were actually updated.
  const checkCalendlyForSelected = async () => {
    if (selectedIds.length === 0) return;
    setCalendlyBulkChecking(true);
    setCalendlyBulkResult(null);
    const results = { booked: 0, notBooked: 0, skipped: 0, failed: 0, reasons: [] };

    for (const id of selectedIds) {
      const candidate = candidates.find((c) => c._id === id);
      try {
        const res = await checkCalendlyStatus(id);
        // `calendly` is only present when the API couldn't answer — keep the
        // recruiter's manual value untouched in that case.
        if (res.calendly && res.calendly.available === false) {
          results.skipped++;
          if (results.reasons.length < 5) results.reasons.push(`${candidate?.fullName || id}: ${res.calendly.reason}`);
        } else if (res.data?.calendlyLinkStatus === 'Booked') {
          results.booked++;
        } else if (res.data?.calendlyLinkStatus === 'Not Booked') {
          results.notBooked++;
        } else {
          results.skipped++;
        }
        if (res.data) {
          setCandidates((prev) => prev.map((c) => (c._id === id ? { ...c, ...res.data } : c)));
        }
      } catch (err) {
        results.failed++;
        if (results.reasons.length < 5) results.reasons.push(`${candidate?.fullName || id}: ${err.message}`);
      }
    }

    setCalendlyBulkResult(results);
    setCalendlyBulkChecking(false);
  };

  const saveFreelanceField = async (id, field, value) => {
    try {
      await updateCandidate(id, { [field]: value, changedBy: user?.fullName });
      setCandidates((prev) => prev.map((c) => (c._id === id ? { ...c, [field]: value } : c)));
    } catch (err) {
      // Surface the failure instead of silently reverting the dropdown.
      console.error(`Failed to save ${field}:`, err);
      setFreelanceSaveError(`Could not save ${field}: ${err.message}`);
      setTimeout(() => setFreelanceSaveError(''), 8000);
    }
  };

  const saveMedicalField = async (id, field, value) => {
    try {
      await updateCandidate(id, { [field]: value, changedBy: user?.fullName });
      setCandidates((prev) => prev.map((c) => (c._id === id ? { ...c, [field]: value } : c)));
    } catch (err) {
      console.error(`Failed to save medical field ${field}:`, err);
      setFreelanceSaveError(`Could not save ${field}: ${err.message}`);
      setTimeout(() => setFreelanceSaveError(''), 8000);
    }
  };

  const addProject = async () => {
    const name = newProject.trim();
    if (!name) return;
    if (projects.includes(name)) { setNewProject(''); return; }
    try {
      await createProject({ name });
      setProjects((prev) => [...prev, name]);
      setNewProject('');
    } catch (err) {
      setProjects((prev) => [...prev, name]);
      setNewProject('');
    }
  };

  const addInterviewRound = () => {
    const nextNum = interviewRounds.length + 1;
    setInterviewRounds((prev) => [...prev, `Interview Round ${nextNum}`]);
  };

  const removeInterviewRound = (roundName) => {
    setInterviewRounds((prev) => prev.filter((r) => r !== roundName));
  };

  const saveCvScreening = async (id, value) => {
    try {
      const normalizedValue = value || 'Not Set';
      await updateCandidate(id, { cvScreening: normalizedValue, changedBy: user?.fullName });
      setCandidates((prev) => {
        const updated = prev.map((c) => (c._id === id ? { ...c, cvScreening: normalizedValue } : c));
        const candidate = updated.find((c) => c._id === id);
        if (candidate) {
          const effective = computeEffectiveStatus(candidate);
          if (effective && effective !== candidate.status) {
            updateCandidate(id, { status: effective, changedBy: user?.fullName });
            return updated.map((c) => (c._id === id ? { ...c, status: effective } : c));
          }
        }
        return updated;
      });
    } catch (err) {
      console.error('Failed to save CV screening:', err);
    }
  };

  const saveAssessmentStatus = async (id, status) => {
    try {
      await updateCandidate(id, { assessmentStatus: status, changedBy: user?.fullName });
      setCandidates((prev) => {
        const updated = prev.map((c) => (c._id === id ? { ...c, assessmentStatus: status } : c));
        const candidate = updated.find((c) => c._id === id);
        if (candidate) {
          const effective = computeEffectiveStatus(candidate);
          if (effective && effective !== candidate.status) {
            updateCandidate(id, { status: effective, changedBy: user?.fullName });
            return updated.map((c) => (c._id === id ? { ...c, status: effective } : c));
          }
        }
        return updated;
      });
    } catch (err) {
      console.error('Failed to save assessment status:', err);
    }
  };

  const saveInterviewRound = async (id, roundName, value) => {
      try {
      const candidate = candidates.find((x) => x._id === id);
      const updated = candidate ? (candidate.interviewRounds || {}) : {};
      await updateCandidate(id, { interviewRounds: { ...updated, [roundName]: value }, changedBy: user?.fullName });
      setCandidates((prev) => {
        const next = prev.map((c) => (c._id === id ? { ...c, interviewRounds: { ...c.interviewRounds, [roundName]: value } } : c));
        const candidate = next.find((c) => c._id === id);
        if (candidate) {
          const effective = computeEffectiveStatus(candidate);
          if (effective && effective !== candidate.status) {
            updateCandidate(id, { status: effective, changedBy: user?.fullName });
            return next.map((c) => (c._id === id ? { ...c, status: effective } : c));
          }
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to save interview round:', err);
    }
  };

  const computeEffectiveStatus = (candidate) => {
    const assessmentStatus = candidate.assessmentStatus;
    const interviewRounds = candidate.interviewRounds || {};
    const cvScreening = candidate.cvScreening;

    if (assessmentStatus && assessmentStatus !== 'Not Set') {
      return assessmentStatus;
    }

    const interviewValues = Object.values(interviewRounds);
    const hasInterviewValue = interviewValues.some((v) => v && v !== 'Not set');
    if (hasInterviewValue) {
      for (let i = interviewValues.length - 1; i >= 0; i--) {
        const v = interviewValues[i];
        if (v && v !== 'Not set') {
          return v;
        }
      }
    }

    if (cvScreening && cvScreening !== 'Not Set') {
      return cvScreening;
    }

    return candidate.status;
  };

  const getStatusSource = (candidate) => {
    const assessmentStatus = candidate.assessmentStatus;
    const interviewRounds = candidate.interviewRounds || {};
    const cvScreening = candidate.cvScreening;

    if (assessmentStatus && assessmentStatus !== 'Not Set') {
      return 'Assessment Status';
    }

    const interviewValues = Object.values(interviewRounds);
    const hasInterviewValue = interviewValues.some((v) => v && v !== 'Not set');
    if (hasInterviewValue) {
      for (let i = interviewValues.length - 1; i >= 0; i--) {
        const v = interviewValues[i];
        if (v && v !== 'Not set') {
          return `Interview${interviewRounds && Object.keys(interviewRounds).length > 1 ? ' Round' : ''}`;
        }
      }
    }

    if (cvScreening && cvScreening !== 'Not Set') {
      return 'CV Screening';
    }

    return '';
  };

  const getStatusDisplay = (candidate) => {
    const source = getStatusSource(candidate);
    const effective = computeEffectiveStatus(candidate);
    if (!source) return effective;
    return `${source} ${effective}`;
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

  const [editingDate, setEditingDate] = useState({});

  const [profileCandidate, setProfileCandidate] = useState(null);

  const [formSyncStatus, setFormSyncStatus] = useState(null);
  const [formSyncing, setFormSyncing] = useState(false);
  const [formSyncResult, setFormSyncResult] = useState(null);

  // Server-side filter params shared by the page fetch, select-all and export.
  const buildQueryParams = () => {
    const p = {};
    ['employmentType', 'roleCode', 'source', 'minExperience', 'maxExperience'].forEach((k) => { if (filters[k]) p[k] = filters[k]; });
    if (filters.statusColumn) {
      p.options = filters.statusColumn;
      if (filters.statusColumnValue) p.optionValue = filters.statusColumnValue;
    }
    // Import window, as the user's local calendar days (start of the first day to end of the last).
    if (filters.startDate) p.startDate = new Date(`${filters.startDate}T00:00:00`).toISOString();
    if (filters.endDate) p.endDate = new Date(`${filters.endDate}T23:59:59.999`).toISOString();
    if (debouncedQuery.trim()) p.q = debouncedQuery.trim();
    return p;
  };

  const loadCandidates = () => {
    setLoading(true);
    fetchCandidates({ ...buildQueryParams(), page: page + 1, limit: PAGE_SIZE })
      .then((res) => {
        setCandidates(res.data);
        setTotal(res.total != null ? res.total : res.data.length);
        setLoadError('');
        setProfileCandidate((prev) => {
          if (!prev) return prev;
          const updated = res.data.find((c) => c._id === prev._id);
          return updated || prev;
        });
        const initialScores = {};
        res.data.forEach((c) => {
          if (c.score && c.score.suitabilityRating != null) {
            initialScores[c._id] = { score: c.score.suitabilityRating, breakdown: null };
          }
        });
        setAnalyzerScores(initialScores);
      })
      .catch((err) => { console.error('[CandidatePool] fetchCandidates failed:', err); setLoadError(`Could not load candidates: ${err.message}`); })
      .finally(() => setLoading(false));
  };

  // Debounce the search box so each keystroke doesn't hit the server.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  // Refetch on filter/search/page change; a changed filter or search jumps back to page 1 first.
  useEffect(() => {
    const sig = JSON.stringify([filters, debouncedQuery]);
    if (sig !== filterSig.current) {
      const firstRun = filterSig.current === '';
      filterSig.current = sig;
      if (!firstRun && page !== 0) { setPage(0); return; }
    }
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, debouncedQuery, page]);

  useEffect(() => {
    fetchRoles().then((res) => setRoles(res.data)).catch((err) => console.error('[CandidatePool] fetchRoles failed:', err));
    fetchCandidateSources().then((res) => setAllSources(res.data || [])).catch(() => {});
    fetchBootcampBatches().then((res) => setBootcampBatches(res.data || [])).catch(() => {});
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
      loadCandidates();
    } catch (err) {
      setFormSyncResult({ ok: false, message: err.message });
    } finally {
      setFormSyncing(false);
    }
  };

const roleCodes = useMemo(() => roles.map((r) => r.code).sort(), [roles]);

// Freelance coding view activates when either the Employment Type filter is
// FREELANCE CODING or CONTRACT (as Contractual uses freelance columns) or the selected Role Code starts with F (e.g. F-TYPESCRIPT).
const selectedRole = roles.find((r) => r.code === filters.roleCode);
const roleEmpType = selectedRole ? selectedRole.empType : '';
// With no type/role filter, show the freelance columns when most loaded candidates are freelance-like
// (e.g. the Coding pipeline import) — otherwise Calendly/NDA/Slack/Project columns never appear.
const mostlyFreelance = !filters.employmentType && !filters.roleCode && candidates.length > 0 &&
  candidates.filter((c) => isFreelanceLikeType(effectiveEmploymentType(c))).length > candidates.length / 2;
const freelanceMode = isFreelanceFilter(filters.employmentType, filters.roleCode) || filters.employmentType === 'Contract' ||
  (!filters.employmentType && isFreelanceLikeType(roleEmpType)) || mostlyFreelance;
// Medical hiring view activates when either the Employment Type filter is
// MEDICAL HIRING or the selected Role Code starts with M (e.g. M-DOCTOR).
const medicalMode = filters.employmentType === 'Medical Hiring' || (filters.roleCode && filters.roleCode.toUpperCase().startsWith('M'));


  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Filtering and search run on the server; `candidates` is already the current page.
  const filtered = candidates;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered;

  const exportCSV = async () => {
    // Export covers every match, not just the current page.
    let rows = filtered;
    try {
      rows = (await fetchCandidates(buildQueryParams())).data;
    } catch (err) {
      setLoadError(`Could not export candidates: ${err.message}`);
      return;
    }
    const blob = new Blob([toCSV(rows, freelanceMode || medicalMode)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (freelanceMode || medicalMode) ? 'medical_hiring_candidates_export.csv' : 'candidate_pool_export.csv'; a.click();
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

  const toggleSelectAllFiltered = async () => {
    // Selects/deselects every match across all pages (ids fetched from the server).
    let filteredIds;
    try {
      filteredIds = (await fetchCandidateIds(buildQueryParams())).data;
    } catch (err) {
      setLoadError(`Could not select candidates: ${err.message}`);
      return;
    }
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedSet.has(id));
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

  // Batches are just labels on candidates, so "creating" one = adding the first person to it.
  const suggestNextBatch = () => {
    const max = bootcampBatches.reduce((m, b) => {
      const n = parseInt(String(b.batch).replace(/^B_/, ''), 10);
      return Number.isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `B_${max + 1}`;
  };

  const runBatchAssign = async (extra) => {
    const batch = batchTarget === '__new__' ? newBatchName.trim() : batchTarget;
    if (!batch) {
      setBatchResult({ ok: false, message: 'Pick a batch, or choose "New batch…" and type its name.' });
      return false;
    }
    setBatchBusy(true);
    setBatchResult(null);
    try {
      const res = await assignBootcampBatch({ batch, joined: batchJoined || undefined, ...extra });
      const skipped = res.data.skipped || [];
      setBatchResult({ ok: true, message: res.message + (skipped.length ? ` Skipped: ${skipped.map((x) => `${x.who} (${x.reason})`).join(', ')}.` : '') });
      fetchBootcampBatches().then((r) => setBootcampBatches(r.data || [])).catch(() => {});
      if (batchTarget === '__new__') { setBatchTarget(batch); setNewBatchName(''); }
      loadCandidates();
      return true;
    } catch (err) {
      setBatchResult({ ok: false, message: err.message });
      return false;
    } finally {
      setBatchBusy(false);
    }
  };

  const addSelectedToBatch = async () => {
    if (selectedIds.length === 0) return;
    if (await runBatchAssign({ candidateIds: selectedIds })) setSelectedIds([]);
  };

  // One person per line: "Name, email, phone" (phone optional; commas, tabs or | all work).
  const parseNewPeople = (text) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/[^\s,;|]+@[^\s,;|]+\.[^\s,;|]+/);
    if (!m) return { fullName: line, email: '' };
    return {
      fullName: line.slice(0, m.index).replace(/[,;|\s]+$/, '').trim(),
      email: m[0],
      phone: line.slice(m.index + m[0].length).replace(/^[,;|\s]+/, '').split(/[,;|]/)[0].trim()
    };
  });

  const addNewPeopleToBatch = async () => {
    const people = parseNewPeople(newPeopleText);
    if (people.length === 0) {
      setBatchResult({ ok: false, message: 'Enter at least one candidate (Name, email, phone).' });
      return;
    }
    if (await runBatchAssign({ candidates: people })) setNewPeopleText('');
  };

  const removeSelectedFromBatch = async () => {
    const batch = filters.statusColumnValue;
    if (!batch || selectedIds.length === 0) return;
    if (!window.confirm(`Remove ${selectedIds.length} selected candidate(s) from ${batch}? They stay in the ATS.`)) return;
    setBatchBusy(true);
    setBatchResult(null);
    try {
      const res = await removeFromBootcampBatch(batch, selectedIds);
      setBatchResult({ ok: true, message: res.message });
      setSelectedIds([]);
      fetchBootcampBatches().then((r) => setBootcampBatches(r.data || [])).catch(() => {});
      loadCandidates();
    } catch (err) {
      setBatchResult({ ok: false, message: err.message });
    } finally {
      setBatchBusy(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.length) return;
    const count = selectedIds.length;
    if (!window.confirm(`Delete ${count} selected candidate${count > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setDeleteConfirm(true);
    setDeleteError('');
    try {
      await Promise.all(selectedIds.map((id) => deleteCandidateRecord(id)));
      setCandidates((prev) => prev.filter((c) => !selectedIds.includes(c._id)));
      setSelectedIds([]);
      setDeleteConfirm(false);
    } catch (err) {
      setDeleteError(`Could not delete candidates: ${err.message}`);
      setDeleteConfirm(false);
    }
  };

  // Big selections (e.g. everything imported in a date range) go to the analyzer in small
  // chunks: it scores at most 100 resumes per call and each request must finish before the proxy times out.
  const ANALYZE_CHUNK = 20;
  const runBulkAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzerError('');
    const ids = [...selectedIds];
    let analyzed = 0;
    let noResume = 0;
    let failed = 0;
    const reasons = new Set();
    let stopMsg = '';
    try {
      for (let i = 0; i < ids.length; i += ANALYZE_CHUNK) {
        setAnalyzeProgress(`${Math.min(i + ANALYZE_CHUNK, ids.length)}/${ids.length}`);
        const chunk = ids.slice(i, i + ANALYZE_CHUNK);
        let res;
        try {
          res = await analyzeCandidatesBulk(chunk);
        } catch (err) {
          stopMsg = err.message || 'Bulk resume analysis failed.';
          break;
        }
        if (!res.success) { stopMsg = res.message || 'Resume analysis failed.'; break; }
        const data = res.data || [];
        noResume += chunk.length - data.length;
        const scoreMap = {};
        for (const item of data) {
          if (item.score == null) { failed += 1; if (item.error) reasons.add(typeof item.error === 'string' ? item.error : 'scoring error'); continue; }
          analyzed += 1;
          scoreMap[item.candidateId] = { score: item.score, breakdown: item.breakdown };
        }
        // Show scores as each chunk lands.
        setAnalyzerScores((prev) => ({ ...prev, ...scoreMap }));
      }
      const parts = [];
      if (noResume) parts.push(`${noResume} had no parsed resume text`);
      if (failed) parts.push(`${failed} could not be scored${reasons.size ? ` (${[...reasons].slice(0, 2).join('; ')})` : ''}`);
      if (stopMsg) parts.push(`stopped early: ${stopMsg}`);
      if (parts.length) setAnalyzerError(`Scored ${analyzed} of ${ids.length}. ${parts.join('; ')}.`);
    } finally {
      setAnalyzeProgress('');
      setAnalyzing(false);
    }
  };

  // Hover text for a score: each criterion's 0-100 score, when the role has a weighted rubric.
  const breakdownTitle = (a) => (a && a.breakdown && a.breakdown.length)
    ? a.breakdown.map((b) => `${b.criterion} (weight ${b.weight}): ${b.score}/100`).join('\n')
    : undefined;

  const saveAnalyzerScores = async () => {
    setAnalyzerError('');
    try {
      const selectedScores = selectedIds.map((id) => ({ id, score: analyzerScores[id] })).filter((s) => s.score != null);
      if (selectedScores.length === 0) {
        setAnalyzerError('No analyzer scores to save. Run Resume Analyzer first.');
        return;
      }
      const savePromises = selectedScores.map((s) =>
        updateCandidate(s.id, {
          score: { suitabilityRating: s.score.score, scoredAt: new Date().toISOString() },
          changedBy: user?.fullName
        })
      );
      await Promise.all(savePromises);
      console.log('[Analyzer] scores saved to backend');
      await loadCandidates();
      setAnalyzerError('');
    } catch (saveErr) {
      console.error('[Analyzer] failed to save scores:', saveErr);
      setAnalyzerError('Could not save scores. Please try again.');
    }
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

  return (
    <>
      <h1 className="page-title">Candidate Pool</h1>
      <p className="page-sub">{total} candidate{total !== 1 ? 's' : ''}{(Object.keys(buildQueryParams()).length > 0) ? ' match these filters' : ' on file'}</p>

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
      {analyzerError && <div className="alert alert-error">⚠️ {analyzerError}</div>}
      {freelanceSaveError && <div className="alert alert-error">⚠️ {freelanceSaveError}</div>}
      {calendlyBulkResult && (
        <div className="alert alert-success">
          ✅ Calendly check complete — Booked: {calendlyBulkResult.booked}, Not Booked: {calendlyBulkResult.notBooked}
          {calendlyBulkResult.skipped > 0 && `, Skipped: ${calendlyBulkResult.skipped}`}
          {calendlyBulkResult.failed > 0 && `, Failed: ${calendlyBulkResult.failed}`}
          {calendlyBulkResult.reasons.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {calendlyBulkResult.reasons.map((reason, i) => (
                <li key={i} style={{ fontSize: 12.5 }}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {analyzing && <div className="alert">⏳ Resume Analyzer is running{analyzeProgress ? ` (${analyzeProgress})` : ''}... Scores appear as each batch finishes.</div>}

      <div className="filters-row">
        <select value={filters.employmentType} onChange={(e) => setFilters({ ...filters, employmentType: e.target.value, roleCode: '', statusColumn: '', statusColumnValue: '' })}>
          <option value="">All employment types</option>
          {employmentTypes.map((et) => (
            <option key={et.name} value={et.name}>{et.label || et.name}</option>
          ))}
        </select>
        <select value={filters.roleCode} onChange={(e) => setFilters({ ...filters, roleCode: e.target.value })}>
          <option value="">All role codes</option>
          {roleCodes.filter((code) => {
            if (filters.employmentType && filters.employmentType !== 'Part-Time' && filters.employmentType !== 'Full-Time') {
              // Determine prefix via the employment-type context registry
              const et = employmentTypes.find((t) => t.name === filters.employmentType);
              if (et && et.isPrefixBased && et.prefix) {
                return code.toUpperCase().startsWith(String(et.prefix).toUpperCase());
              }
              // Backward-compatible fallback names
              if (filters.employmentType === 'FREELANCE CODING' || filters.employmentType === 'Contract') return code.toUpperCase().startsWith('F');
              if (filters.employmentType === 'Medical Hiring') return code.toUpperCase().startsWith('M');
            }
            return true;
          }).map((code) => <option key={code} value={code}>{code}</option>)}</select>
        <select value={filters.statusColumn} onChange={(e) => setFilters({ ...filters, statusColumn: e.target.value, statusColumnValue: '' })}>
          <option value="">All Status</option>
          {getColumnsForType(filters.employmentType || (freelanceMode ? 'Freelance' : medicalMode ? 'Medical Hiring' : '')).map((col) => (
            <option key={col.field} value={col.field}>{col.label}</option>
          ))}
          {bootcampBatches.length > 0 && <option value="bootcampBatch">Bootcamp Batches</option>}
        </select>
        {filters.statusColumn === 'bootcampBatch' && (
          <select value={filters.statusColumnValue} onChange={(e) => setFilters({ ...filters, statusColumnValue: e.target.value })}>
            <option value="">All</option>
            {bootcampBatches.map((b) => (
              <option key={b.batch} value={b.batch}>{b.batch} ({b.count})</option>
            ))}
          </select>
        )}
        {filters.statusColumn && filters.statusColumn !== 'bootcampBatch' && (
          <select value={filters.statusColumnValue} onChange={(e) => setFilters({ ...filters, statusColumnValue: e.target.value })}>
            <option value="">Options</option>
            {getOptionsForColumn(filters.statusColumn, candidates).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )}
        <select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
          <option value="">All sources</option>
          {allSources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="number" min="0" placeholder="Min Exp (yrs)" value={filters.minExperience} onChange={(e) => setFilters({ ...filters, minExperience: e.target.value })} style={{ width: 110 }} />
        <input type="number" min="0" placeholder="Max Exp (yrs)" value={filters.maxExperience} onChange={(e) => setFilters({ ...filters, maxExperience: e.target.value })} style={{ width: 110 }} />
        <label style={{ fontSize: 12, color: 'var(--text-500)' }} title="Date the candidate was imported into the ATS">Imported from{' '}
          <input type="date" value={filters.startDate} max={filters.endDate || undefined} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-500)' }}>to{' '}
          <input type="date" value={filters.endDate} min={filters.startDate || undefined} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
        </label>
        {(filters.startDate || filters.endDate) && <button className="btn-secondary" onClick={() => setFilters({ ...filters, startDate: '', endDate: '' })}>Clear dates</button>}
        <input placeholder="Search name, email, phone, location, skills, roleCode, employmentType, experience, CTC, source" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 220 }} />
        <button className="btn-secondary" onClick={loadCandidates}>Refresh</button>
        <button className="btn-secondary" onClick={exportCSV}>Export CSV</button>
        <button className="btn-secondary" onClick={downloadSampleCSV}>Download Sample CSV</button>
        <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportFile} />
        <button className="btn-primary" onClick={triggerImport} disabled={importing}>{importing ? 'Importing...' : '⭱ Import CSV'}</button>
        <button className="btn-secondary" onClick={runBulkAnalyze} disabled={analyzing || selectedIds.length === 0} title="Scores the selected candidates against their role's JD and criteria. They must share one role code, and that role needs a job description (Roles & Codes).">{analyzing ? `Analyzing ${analyzeProgress}...` : 'Resume Analyzer'}</button>
        <button className="btn-secondary" onClick={saveAnalyzerScores} disabled={selectedIds.length === 0 || Object.keys(analyzerScores).length === 0} title="Save analyzer scores for selected candidates">💾 Save Scores</button>
        {freelanceMode && (
          <button
            className="btn-secondary"
            onClick={checkCalendlyForSelected}
            disabled={selectedIds.length === 0 || calendlyBulkChecking}
            title="Fetch booking status from Calendly for each selected candidate, then save it"
          >
            {calendlyBulkChecking ? 'Checking...' : '↻ Check Calendly (Selected)'}
          </button>
        )}
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
        <button className="btn-secondary" onClick={handleDeleteSelected} disabled={selectedIds.length === 0 || deleteConfirm} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
          {deleteConfirm ? 'Deleting...' : `🗑 Delete Selected`}
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

      <div className="filters-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Bootcamp batch</span>
        <select
          value={batchTarget}
          onChange={(e) => {
            setBatchTarget(e.target.value);
            if (e.target.value === '__new__' && !newBatchName) setNewBatchName(suggestNextBatch());
          }}
        >
          <option value="">Select batch…</option>
          {bootcampBatches.map((b) => <option key={b.batch} value={b.batch}>{b.batch} ({b.count})</option>)}
          <option value="__new__">➕ New batch…</option>
        </select>
        {batchTarget === '__new__' && (
          <input placeholder="New batch name, e.g. B_19_28/10" value={newBatchName} maxLength={40} onChange={(e) => setNewBatchName(e.target.value)} style={{ width: 200 }} />
        )}
        <select value={batchJoined} onChange={(e) => setBatchJoined(e.target.value)} title="Joined status to record for them in this batch">
          <option value="">Joined status: —</option>
          <option value="Joined">Joined</option>
          <option value="Not joined">Not joined</option>
        </select>
        <button className="btn-primary" onClick={addSelectedToBatch} disabled={batchBusy || selectedIds.length === 0 || !batchTarget}>
          {batchBusy ? 'Working...' : `Add selected (${selectedIds.length}) to batch`}
        </button>
        <button className="btn-secondary" onClick={() => setShowAddPeople((v) => !v)}>
          {showAddPeople ? 'Hide new candidates' : '+ Add new candidates'}
        </button>
        {filters.statusColumn === 'bootcampBatch' && filters.statusColumnValue && (
          <button className="btn-secondary" onClick={removeSelectedFromBatch} disabled={batchBusy || selectedIds.length === 0} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
            Remove selected from {filters.statusColumnValue}
          </button>
        )}
        {batchResult && (
          <span style={{ fontSize: 12, color: batchResult.ok ? 'var(--green)' : 'var(--red)' }}>{batchResult.message}</span>
        )}
      </div>
      {showAddPeople && (
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            One candidate per line: <code>Name, email, phone</code> (phone is optional). People already in the ATS are just added to the batch; new ones are created
            (role CODING, Freelance, source Bootcamp). Uses the batch and Joined status chosen above.
          </div>
          <textarea
            rows={6}
            value={newPeopleText}
            onChange={(e) => setNewPeopleText(e.target.value)}
            placeholder={'Asha Rao, asha.rao@example.com, 9876543210\nRohit Sen, rohit.sen@example.com'}
            style={{ width: '100%', fontFamily: 'inherit', fontSize: 13 }}
          />
          <div style={{ marginTop: 8 }}>
            <button className="btn-primary" onClick={addNewPeopleToBatch} disabled={batchBusy || !batchTarget || !newPeopleText.trim()}>
              {batchBusy ? 'Adding...' : 'Add to batch'}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (<p style={{ padding: 20, color: 'var(--text-500)' }}>Loading candidates...</p>) : (
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" onChange={toggleSelectAllFiltered} checked={filtered.length > 0 && filtered.every((c) => selectedSet.has(c._id))} /></th>
                {freelanceMode ? (
                  <>
                    <th>Candidate</th><th>Role Code</th><th>Location</th>
                    <th>Analyzer Score</th>
                    <th>Calendly Link Sent</th>
                    <th>Calendly Link Status</th>
                    <th>Screening Interview</th>
                    <th>NDA &amp; ICA</th>
                    <th>Slack</th>
                    <th>Bootcamp Attempts</th>
                    <th>Bootcamp Status</th>
                    <th>Onboarding</th>
                    <th>Project</th>
                    <th>Project Status</th>
                  </>
                ) : medicalMode ? (
                  <>
                    <th>Candidate</th><th>Role Code</th><th>Location</th>
                    <th>Resume Analyzer Status</th>
                    <th>Assessments</th>
                    <th>Assessments Submission</th>
                    <th>Submissions Evaluation</th>
                    <th>Onboarding</th>
                    <th>Slack</th>
                    <th>Project</th>
                    <th>Project Status</th>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </tr>
              {!freelanceMode && !medicalMode && (
                <tr>
                  <th colSpan="10"></th>
                  <th colSpan={interviewRounds.length + 2} style={{ padding: 0, borderBottom: '1px solid var(--border)', textAlign: 'center', fontSize: 11, color: 'var(--text-500)' }}>
                    + Add Interview Round
                    <button onClick={addInterviewRound} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--primary)', color: 'black', border: '2px solid black', borderRadius: 4, cursor: 'pointer', marginLeft: 6 }}>+</button>
                  </th>
                </tr>
              )}
            </thead>
            <tbody>
              {pageRows.map((c) => {
                return (
                  <React.Fragment key={c._id}>
                     <tr>
                        <td><input type="checkbox" checked={selectedSet.has(c._id)} onChange={() => toggleSelected(c._id)} /></td>
                        <td className="name-cell">
                          <button className="name-link" onClick={() => setProfileCandidate(c)}><strong>{c.fullName}</strong></button>
                          <br /><small>{c.email}</small>
                          {c.createdAt && <><br /><small style={{ color: 'var(--text-500)' }}>Imported {fmtImported(c.createdAt)}</small></>}
                          {filters.statusColumn === 'bootcampBatch' && (c.bootcampBatches || []).length > 0 && (
                            <><br /><small style={{ color: 'var(--text-500)' }}>
                              {(c.bootcampBatches || [])
                                .filter((b) => !filters.statusColumnValue || b.batch === filters.statusColumnValue)
                                .map((b) => `${b.batch}: ${b.joined || '—'}${b.note ? ` (${b.note})` : ''}`)
                                .join(' · ')}
                            </small></>
                          )}
                        </td>
                        <td>{c.roleCode}</td>
{freelanceMode ? (
                            <>
                              <td>{c.location || '—'}</td>
                              <td>
                                {analyzerScores[c._id] ? (
                                  <span style={{ fontWeight: 600, color: analyzerScores[c._id].score >= 7 ? 'var(--green)' : analyzerScores[c._id].score >= 4 ? 'var(--amber)' : 'var(--red)' }} title={breakdownTitle(analyzerScores[c._id])}>
                                    {analyzerScores[c._id].score}/10
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-500)', fontSize: 12 }}>—</span>
                                )}
                              </td>
                              {[
                                { field: 'calendlyLinkSent', options: CALENDLY_SENT_OPTIONS, label: 'Calendly Link Sent' },
                                { field: 'calendlyLinkStatus', options: CALENDLY_STATUS_OPTIONS, label: 'Calendly Link Status' },
                                { field: 'screeningInterview', options: SCREENING_INTERVIEW_OPTIONS, label: 'Screening Interview' },
                                { field: 'ndaIca', options: NDA_ICA_OPTIONS, label: 'NDA & ICA' },
                                { field: 'slackStatus', options: SLACK_STATUS_OPTIONS, label: 'Slack' },
                                { field: 'bootcampAttempts', options: BOOTCAMP_ATTEMPTS_OPTIONS, label: 'Bootcamp Attempts' },
                                { field: 'bootcampStatus', options: BOOTCAMP_STATUS_OPTIONS, label: 'Bootcamp Status' },
                                { field: 'onboarding', options: ONBOARDING_OPTIONS, label: 'Onboarding' }
                              ].map(({ field, options }) => (
                                <td key={field}>
                                  <select
                                    value={c[field] || ''}
                                    onChange={(e) => saveFreelanceField(c._id, field, e.target.value)}
                                    style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 110 }}
                                  >
                                    <option value="">—</option>
                                    {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                  {field === 'calendlyLinkStatus' && (
                                    <button
                                      onClick={() => checkCalendlyForCandidate(c._id)}
                                      disabled={calendlyChecking === c._id}
                                      title="Fetch booking status from Calendly API (falls back to manual selection if not configured)"
                                      style={{ display: 'block', marginTop: 4, fontSize: 10, padding: '2px 5px', cursor: 'pointer', borderRadius: 3, border: '1px solid var(--border)', background: 'transparent' }}
                                    >
                                      {calendlyChecking === c._id ? 'Checking...' : '↻ Check Calendly'}
                                    </button>
                                  )}
                                </td>
                              ))}
                              <td>
                                <select
                                  value={c.project || ''}
                                  onChange={(e) => saveFreelanceField(c._id, 'project', e.target.value)}
                                  style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 110 }}
                                >
                                  <option value="">—</option>
                                  {/* keep a value that isn't in the project list (e.g. imported) selectable */}
                                  {c.project && !projects.includes(c.project) && <option value={c.project}>{c.project}</option>}
                                  {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={c.projectStatus || ''}
                                  onChange={(e) => saveFreelanceField(c._id, 'projectStatus', e.target.value)}
                                  style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 110 }}
                                >
                                  <option value="">—</option>
                                  {PROJECT_STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              </td>
                            </>
                          ) : medicalMode ? (
                            <>
                              <td>{c.location || '—'}</td>
                              <td>
                                {/* Resume Analyzer Score */}
                                {analyzerScores[c._id] ? (
                                  <span style={{ fontWeight: 600, color: analyzerScores[c._id].score >= 7 ? 'var(--green)' : analyzerScores[c._id].score >= 4 ? 'var(--amber)' : 'var(--red)' }} title={breakdownTitle(analyzerScores[c._id])}>
                                    {analyzerScores[c._id].score}/10
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-500)', fontSize: 12 }}>—</span>
                                )}
                              </td>
                              <td>
                                <select
                                  value={c.resumeAnalyzerStatus || ''}
                                  onChange={(e) => saveMedicalField(c._id, 'resumeAnalyzerStatus', e.target.value)}
                                  style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 110 }}
                                >
                                  <option value="">—</option>
                                  {MEDICAL_RESUME_ANALYZER_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={c.medicalAssessments || ''}
                                  onChange={(e) => saveMedicalField(c._id, 'medicalAssessments', e.target.value)}
                                  style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 110 }}
                                >
                                  <option value="">—</option>
                                  {MEDICAL_ASSESSMENTS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={c.medicalAssessmentsSubmission || ''}
                                  onChange={(e) => saveMedicalField(c._id, 'medicalAssessmentsSubmission', e.target.value)}
                                  style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 110 }}
                                >
                                  <option value="">—</option>
                                  {MEDICAL_ASSESSMENTS_SUBMISSION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={c.medicalSubmissionsEvaluation || ''}
                                  onChange={(e) => saveMedicalField(c._id, 'medicalSubmissionsEvaluation', e.target.value)}
                                  style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 110 }}
                                >
                                  <option value="">—</option>
                                  {MEDICAL_SUBMISSIONS_EVALUATION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={c.medicalOnboarding || ''}
                                  onChange={(e) => saveMedicalField(c._id, 'medicalOnboarding', e.target.value)}
                                  style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 110 }}
                                >
                                  <option value="">—</option>
                                  {MEDICAL_ONBOARDING_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={c.medicalSlack || ''}
                                  onChange={(e) => saveMedicalField(c._id, 'medicalSlack', e.target.value)}
                                  style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 110 }}
                                >
                                  <option value="">—</option>
                                  {MEDICAL_SLACK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={c.project || ''}
                                  onChange={(e) => saveMedicalField(c._id, 'project', e.target.value)}
                                  style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 110 }}
                                >
                                  <option value="">—</option>
                                  {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={c.projectStatus || ''}
                                  onChange={(e) => saveMedicalField(c._id, 'projectStatus', e.target.value)}
                                  style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 110 }}
                                >
                                  <option value="">—</option>
                                  {MEDICAL_PROJECT_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              </td>
                            </>
                          ) : (
                          <>
                            <td>{typeLabel(effectiveEmploymentType(c))}</td>
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
                                  value={cvScreeningDraft[c._id] ?? (c.cvScreening || 'Not Set')}
                                 onChange={(e) => {
                                   const val = e.target.value || 'Not Set';
                                   setCvScreeningDraft((prev) => ({ ...prev, [c._id]: val }));
                                   saveCvScreening(c._id, val);
                                 }}
                                 style={{ padding: '2px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border)' }}
                               >
                                 {CV_SCREENING_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                               </select>
                             </td>
                             {interviewRounds.map((round) => (
                               <td key={round}>
                                 <select
                                   value={(c.interviewRounds || {})[round] || 'Not set'}
                                   onChange={(e) => saveInterviewRound(c._id, round, e.target.value)}
                                   style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', minWidth: 120 }}
                                 >
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
                                <span style={{ fontWeight: 600, color: analyzerScores[c._id].score >= 7 ? 'var(--green)' : analyzerScores[c._id].score >= 4 ? 'var(--amber)' : 'var(--red)' }} title={breakdownTitle(analyzerScores[c._id])}>
                                  {analyzerScores[c._id].score}/10
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-500)', fontSize: 12 }}>—</span>
                              )}
                            </td>
                             <td><StatusBadge status={computeEffectiveStatus(c)} label={getStatusDisplay(c)} /></td>
                             <td>
                               <select
                                 value={c.assessmentStatus || 'Not Set'}
                                 onChange={(e) => saveAssessmentStatus(c._id, e.target.value)}
                                 className={assessmentBadgeClass(c.assessmentStatus)}
                                 style={{ border: '1px solid var(--border)', background: 'transparent', padding: '2px 6px', fontSize: 12, cursor: 'pointer', borderRadius: 4, minWidth: 140, color: '#000' }}
                               >
                                 {ASSESSMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                               </select>
                             </td>
                            <td>{c.slackGroup || '—'}</td>
                          </>
                        )}
                     </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && total > PAGE_SIZE && (
          <div className="filters-row" style={{ padding: 12, alignItems: 'center', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={() => setPage(0)} disabled={currentPage === 0}>« First</button>
            <button className="btn-secondary" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>‹ Prev</button>
            <span style={{ fontSize: 13, color: 'var(--text-500)' }}>
              Page {currentPage + 1} of {pageCount} · showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <button className="btn-secondary" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount - 1}>Next ›</button>
            <button className="btn-secondary" onClick={() => setPage(pageCount - 1)} disabled={currentPage >= pageCount - 1}>Last »</button>
          </div>
        )}
        {!loading && filtered.length === 0 && <p style={{ padding: 20, color: 'var(--text-500)' }}>No candidates match these filters.</p>}
      </div>

      {freelanceMode && (
        <div className="filters-row" style={{ marginTop: 12, alignItems: 'center' }}>
          <input placeholder="Add new project..." value={newProject} onChange={(e) => setNewProject(e.target.value)} style={{ width: 180 }} />
          <button className="btn-secondary" onClick={addProject}>+ Add Project</button>
          <span style={{ fontSize: 12, color: 'var(--text-500)' }}>Projects: {projects.join(', ')}</span>
        </div>
      )}

        {profileCandidate && (
          <CandidateProfileModal
            candidate={profileCandidate}
            role={roles.find((r) => r.code === profileCandidate.roleCode)}
            onClose={() => setProfileCandidate(null)}
            onSaved={(updated) => {
              setCandidates((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
              setProfileCandidate(updated);
            }}
          />
        )}
      </>
  );
}

export default CandidatePool;
