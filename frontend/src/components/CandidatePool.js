import React, { useEffect, useMemo, useRef, useState } from 'react';
import StatusBadge from './StatusBadge';
import CandidateProfileModal from './CandidateProfileModal';
import { useAuth } from '../auth/AuthContext';
import {
  fetchCandidates, bulkImportCandidates, fetchSlackMappings, assignCandidatesToSlack,
  fetchRoles, fetchFormSyncStatus, runFormSyncNow, analyzeCandidatesBulk,
  updateCandidate, deleteCandidateRecord, fetchProjects, createProject,
  checkCalendlyStatus
} from '../api/api';
import { isFreelanceRoleCode, isFreelanceFilter, isFreelanceLikeType, effectiveEmploymentType } from '../utils/employment';
import { getColumnsForType, getOptionsForColumn } from '../utils/columnOptions';
import { useEmploymentTypes } from '../contexts/EmploymentTypesContext';

const fallbackTypeLabel = (t) => (t === 'Contract' ? 'Contractual' : t === 'Part-Time' ? 'Part Time' : t === 'FREELANCE CODING' ? 'Freelance Coding' : t === 'Medical Hiring' ? 'Medical Hiring' : (t === 'Freelance' || t === 'Freelance/Contract') ? t : 'Full Time');
const money = (n) => (n ? `₹${(n / 100000).toFixed(1)}L` : '—');

const SCREENING_INTERVIEW_OPTIONS = ['Pass', 'Fail', 'Not Appeared', 'Rescheduled', 'Not interested', 'Referred to another position'];
const CALENDLY_SENT_OPTIONS = ['Sent', 'Not Sent'];
const CALENDLY_STATUS_OPTIONS = ['Booked', 'Not Booked'];
const NDA_ICA_OPTIONS = ['Sent', 'Not Sent', 'Signed', 'Not Signed', 'Doubt', 'Not Interested'];
const SLACK_STATUS_OPTIONS = ['Joined', 'Not Joined', 'Not Interested'];
const BOOTCAMP_ATTEMPTS_OPTIONS = ['Attempt 1', 'Attempt 2', 'Attempt 3'];
const BOOTCAMP_STATUS_OPTIONS = ['Pass', 'Fail', 'Full Fail', 'Not Active', 'Active'];
const ONBOARDING_OPTIONS = ['Sent', 'Not Sent', 'Not Interested', 'Done'];
const PROJECT_STATUS_OPTIONS = ['On Hold', 'Complete', 'Not Active', 'In Pipeline'];
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

function toCSV(rows, freelance = false) {
  if (freelance) {
    const headers = ['Name', 'Email', 'Role Code', 'Location', 'Analyzer Score', 'Screening Interview', 'Calendly Link Sent', 'Calendly Link Status', 'NDA & ICA', 'Slack', 'Bootcamp Attempts', 'Bootcamp Status', 'Onboarding', 'Project', 'Project Status'];
    const lines = rows.map((c) => [
      c.fullName, c.email, c.roleCode, c.location || '',
      c.score?.suitabilityRating ?? '', c.screeningInterview || '', c.calendlyLinkSent || '',
      c.calendlyLinkStatus || '', c.ndaIca || '', c.slackStatus || '',
      c.bootcampAttempts || '', c.bootcampStatus || '', c.onboarding || '',
      c.project || '', c.projectStatus || ''
    ].join(','));
    return [headers.join(','), ...lines].join('\n');
  }
  const headers = ['Name', 'Email', 'Role Code', 'Type', 'Location', 'CTC Current', 'CTC Expected', 'Status', 'Assessment Status', 'Suitability', 'Updated'];
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
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [filters, setFilters] = useState({ employmentType: '', roleCode: '', statusColumn: '', statusColumnValue: '', minExperience: '', maxExperience: '', source: '' });
  const [query, setQuery] = useState('');

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

  const loadCandidates = () => {
    setLoading(true);
    fetchCandidates(filters)
      .then((res) => {
        setCandidates(res.data);
        setLoadError('');
        // Source dropdown options come from the first (unfiltered) load — avoids a second full fetch.
        setAllSources((prev) => (prev.length ? prev : [...new Set(res.data.map((c) => c.source).filter(Boolean))].sort()));
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

  useEffect(loadCandidates, [filters]);

  useEffect(() => {
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


  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      // An F-prefixed role code always satisfies a FREELANCE CODING/CONTRACT filter,
      // regardless of the stored employmentType on the row.
      if (filters.employmentType === 'FREELANCE CODING' && !isFreelanceRoleCode(c.roleCode) && c.employmentType !== 'FREELANCE CODING') return false;
      if (filters.employmentType === 'Contract' && !isFreelanceRoleCode(c.roleCode) && c.employmentType !== 'Contract') return false;
      if (filters.employmentType && filters.employmentType !== 'FREELANCE CODING' && filters.employmentType !== 'Contract' && effectiveEmploymentType(c) !== filters.employmentType) return false;
      // An M-prefixed role code always satisfies MEDICAL HIRING filter.
      if (filters.employmentType === 'Medical Hiring' && !c.roleCode.toUpperCase().startsWith('M') && c.employmentType !== 'Medical Hiring') return false;
      if (filters.statusColumn) {
        // Filter candidates who have a non-empty value in the selected column
        const field = filters.statusColumn;
        let candidateValue;
        if (field === 'status') {
          candidateValue = c.status;
        } else if (field === 'interviewRounds') {
          candidateValue = Object.values(c.interviewRounds || {}).find(v => v && v !== 'Not set');
        } else {
          candidateValue = c[field];
        }
        if (!candidateValue) return false;
        if (filters.statusColumnValue && filters.statusColumnValue !== '' && candidateValue !== filters.statusColumnValue) return false;
      }
      if (query) {
        const q = query.toLowerCase();
        const haystack = [
          c.fullName, c.email, c.phone, c.location, c.roleCode, c.employmentType, effectiveEmploymentType(c), c.source,
          ...(c.skills || []),
          String(c.yearsOfExperience || ''),
          String(c.ctcCurrent || ''),
          String(c.ctcExpected || '')
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [candidates, filters.employmentType, filters.statusColumn, filters.statusColumnValue, query]);

  const exportCSV = () => {
    const blob = new Blob([toCSV(filtered, freelanceMode || medicalMode)], { type: 'text/csv' });
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

  const runBulkAnalyze = async () => {
    console.log('[Analyzer] runBulkAnalyze clicked', { selectedIds, roleCode: filters.roleCode });
    setAnalyzing(true);
    setAnalyzerError('');
    try {
      const ids = selectedIds.length > 0 ? selectedIds : [];
      console.log('[Analyzer] calling analyzeCandidatesBulk with ids', ids);
      const res = await analyzeCandidatesBulk(ids);
      console.log('[Analyzer] analyzeCandidatesBulk response', res);
      if (!res.success) {
        const msg = res.message || 'Resume analysis failed.';
        console.log('[Analyzer] backend reported failure', msg);
        setAnalyzerError(msg);
        return;
      }
      if (res.data) {
        if (res.data.length === 0) {
          const msg = res.message || 'No resume text available for selected candidates. Ensure resumes were uploaded/parsed.';
          console.log('[Analyzer] empty data', msg);
          setAnalyzerError(msg);
        } else {
          const scoreMap = {};
          res.data.forEach((item) => {
            scoreMap[item.candidateId] = { score: item.score, breakdown: item.breakdown };
          });
          console.log('[Analyzer] updating local scores', scoreMap);
          setAnalyzerScores((prev) => ({ ...prev, ...scoreMap }));
          setAnalyzerError('');
        }
      }
    } catch (err) {
      console.error('[Analyzer] bulk resume analysis failed:', err);
      setAnalyzerError(err.message || 'Bulk resume analysis failed.');
    } finally {
      console.log('[Analyzer] finishing, analyzing=false');
      setAnalyzing(false);
    }
  };

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
      {analyzing && <div className="alert">⏳ Resume Analyzer is running... Please wait while we analyze the selected candidates.</div>}

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
        </select>
        {filters.statusColumn && (
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
        <input placeholder="Search name, email, phone, location, skills, roleCode, employmentType, experience, CTC, source" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 220 }} />
        <button className="btn-secondary" onClick={loadCandidates}>Refresh</button>
        <button className="btn-secondary" onClick={exportCSV}>Export CSV</button>
        <button className="btn-secondary" onClick={downloadSampleCSV}>Download Sample CSV</button>
        <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportFile} />
        <button className="btn-primary" onClick={triggerImport} disabled={importing}>{importing ? 'Importing...' : '⭱ Import CSV'}</button>
        <button className="btn-secondary" onClick={runBulkAnalyze} disabled={analyzing || !filters.roleCode || selectedIds.length === 0} title={!filters.roleCode ? 'Select a specific Role Code' : ''}>{analyzing ? 'Analyzing...' : 'Resume Analyzer'}</button>
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

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (<p style={{ padding: 20, color: 'var(--text-500)' }}>Loading candidates...</p>) : (
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" onChange={toggleSelectAllFiltered} checked={filtered.length > 0 && filtered.every((c) => selectedIds.includes(c._id))} /></th>
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
              {filtered.map((c) => {
                return (
                  <React.Fragment key={c._id}>
                     <tr>
                        <td><input type="checkbox" checked={selectedIds.includes(c._id)} onChange={() => toggleSelected(c._id)} /></td>
                        <td className="name-cell">
                          <button className="name-link" onClick={() => setProfileCandidate(c)}><strong>{c.fullName}</strong></button>
                          <br /><small>{c.email}</small>
                        </td>
                        <td>{c.roleCode}</td>
{freelanceMode ? (
                            <>
                              <td>{c.location || '—'}</td>
                              <td>
                                {analyzerScores[c._id] ? (
                                  <span style={{ fontWeight: 600, color: analyzerScores[c._id].score >= 7 ? 'var(--green)' : analyzerScores[c._id].score >= 4 ? 'var(--amber)' : 'var(--red)' }}>
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
                                { field: 'onboarding', options: ONBOARDING_OPTIONS, label: 'Onboarding' },
                                { field: 'projectStatus', options: PROJECT_STATUS_OPTIONS, label: 'Project Status' }
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
                                  {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </td>
                            </>
                          ) : medicalMode ? (
                            <>
                              <td>{c.location || '—'}</td>
                              <td>
                                {/* Resume Analyzer Score */}
                                {analyzerScores[c._id] ? (
                                  <span style={{ fontWeight: 600, color: analyzerScores[c._id].score >= 7 ? 'var(--green)' : analyzerScores[c._id].score >= 4 ? 'var(--amber)' : 'var(--red)' }}>
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
                                <span style={{ fontWeight: 600, color: analyzerScores[c._id].score >= 7 ? 'var(--green)' : analyzerScores[c._id].score >= 4 ? 'var(--amber)' : 'var(--red)' }}>
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
