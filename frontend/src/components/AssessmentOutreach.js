import React, { useEffect, useMemo, useRef, useState } from 'react';
import { emailTemplates } from '../data/dummyData';
import { fetchCandidates, fetchRoles, sendOutreachEmail, fetchEmailTemplates, fetchProjects, uploadOutreachAttachments, deleteOutreachAttachment, fetchOutreachAttachments } from '../api/api';
import TemplateManager from './TemplateManager';
import {
  isFreelanceRoleCode, isFreelanceFilter, isFreelanceCandidate, effectiveEmploymentType, typeLabel
} from '../utils/employment';

function fillTemplate(str, vars) {
  return str.replace(/{{(.*?)}}/g, (_, key) => vars[key.trim()] ?? `{{${key.trim()}}}`);
}

// Preview-only mirror of the backend's buildFormLink (outreachController.js)
// — the actual send always computes this server-side, per-recipient, from
// the same env vars. This just lets the preview show a realistic link
// instead of a blank/placeholder before anything's actually sent.
function buildFormLinkPreview(email) {
  const baseUrl = process.env.REACT_APP_GOOGLE_FORM_URL;
  const entryId = process.env.REACT_APP_GOOGLE_FORM_EMAIL_ENTRY_ID;
  if (!baseUrl || !entryId || !email) return '';
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}entry.${entryId}=${encodeURIComponent(email)}`;
}

const STATUS_OPTIONS = [
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

const SCREENING_INTERVIEW_OPTIONS = ['Pass', 'Fail', 'Not Appeared', 'Rescheduled', 'Not interested', 'Referred to another position'];
const CALENDLY_SENT_OPTIONS = ['Sent', 'Not Sent'];
const CALENDLY_STATUS_OPTIONS = ['Booked', 'Not Booked'];
const NDA_ICA_OPTIONS = ['Sent', 'Not Sent', 'Signed', 'Not Signed', 'Doubt', 'Not Interested'];
const SLACK_STATUS_OPTIONS = ['Joined', 'Not Joined', 'Not Interested'];
const BOOTCAMP_ATTEMPTS_OPTIONS = ['Attempt 1', 'Attempt 2', 'Attempt 3'];
const BOOTCAMP_STATUS_OPTIONS = ['Pass', 'Fail', 'Full Fail', 'Not Active', 'Active'];
const ONBOARDING_OPTIONS = ['Sent', 'Not Sent', 'Not Interested', 'Done'];
const PROJECT_STATUS_OPTIONS = ['On Hold', 'Complete', 'Not Active', 'In Pipeline'];

// One entry per FREELANCE CODING filter, in display order. `key` matches the
// field on freelanceFilters so the UI, the filter logic and the reset all stay
// in sync without repeating the list three times.
const EMPTY_FREELANCE_FILTERS = {
  roleCode: '', analyzerMinScore: '', screeningInterview: '', calendlyLinkSent: '',
  calendlyLinkStatus: '', ndaIca: '', slackStatus: '', bootcampAttempts: '',
  bootcampStatus: '', onboarding: '', project: '', projectStatus: ''
};

function AssessmentOutreach() {
  const [candidates, setCandidates] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [empTypeFilter, setEmpTypeFilter] = useState('');
  const [projects, setProjects] = useState(['Terminus', 'Snorkle', 'Alegion']);
  const [freelanceFilters, setFreelanceFilters] = useState(EMPTY_FREELANCE_FILTERS);
  const [templateId, setTemplateId] = useState(emailTemplates[0].id);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  // Attachments for THIS send. `linkAttachments` are plain URLs; `files` are
  // real files uploaded from the recruiter's device and stored server-side.
  const [linkAttachments, setLinkAttachments] = useState([]);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [storedAttachments, setStoredAttachments] = useState([]);
  const fileInputRef = useRef(null);

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const freelanceMode = isFreelanceFilter(empTypeFilter, roleFilter);

  useEffect(() => {
    Promise.all([fetchCandidates(), fetchRoles()])
      .then(([candidatesRes, rolesRes]) => {
        setCandidates(candidatesRes.data);
        setRoles(rolesRes.data);
        if (candidatesRes.data.length > 0) setSelectedIds([candidatesRes.data[0]._id]);
        setLoadError('');
      })
      .catch((err) => { console.error('[AssessmentOutreach] load failed:', err); setLoadError(`Could not load candidates: ${err.message}`); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchProjects().then((res) => {
      const list = (res.data || []).map((p) => p.name).filter(Boolean);
      setProjects([...new Set(['Terminus', 'Snorkle', 'Alegion', ...list])]);
    }).catch(() => {});
  }, []);

  // Previously uploaded files, so a template can re-attach one without the
  // recruiter having to pick it off their disk again.
  useEffect(() => {
    fetchOutreachAttachments()
      .then((res) => setStoredAttachments(res.data || []))
      .catch(() => {});
  }, []);

  const handleFilesSelected = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-picking the same file
    if (picked.length === 0) return;

    if (files.length + picked.length > 10) {
      setUploadError('You can attach at most 10 files per email.');
      return;
    }

    setUploading(true);
    setUploadError('');
    try {
      const res = await uploadOutreachAttachments(picked);
      const uploaded = res.data || [];
      setFiles((prev) => [...prev, ...uploaded]);
      setStoredAttachments((prev) => [...uploaded, ...prev]);
      if (uploaded.length < picked.length) {
        setUploadError(`${picked.length - uploaded.length} file(s) could not be uploaded. Check size limits (10MB per file, 30MB total).`);
      }
    } catch (err) {
      setUploadError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (id) => {
    const removed = files.find((f) => f._id === id);
    setFiles((prev) => prev.filter((f) => f._id !== id));
    // Only delete from the server if no template still references it.
    const referencedByTemplate = templates.some((t) =>
      (t.attachments || []).some((a) => a.attachmentId === id)
    );
    if (removed && !referencedByTemplate) {
      deleteOutreachAttachment(id).catch(() => {});
    }
  };

  const addLinkAttachment = () => setLinkAttachments((prev) => [...prev, { name: '', url: '' }]);

  const updateLinkAttachment = (index, field, value) => {
    setLinkAttachments((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  };

  const removeLinkAttachment = (index) => {
    setLinkAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAttachments = () => { setLinkAttachments([]); setFiles([]); };

  // Fetch templates from API
  const [templates, setTemplates] = useState([]);
  useEffect(() => {
    fetchEmailTemplates()
      .then((res) => {
        if (res.success && res.data.length > 0) {
          setTemplates(res.data);
          setTemplateId(res.data[0]._id);
        } else if (res.success && res.data.length === 0) {
          // If no templates in DB, seed with defaults from dummyData
          setTemplates(emailTemplates);
        }
      })
      .catch((err) => console.error('[AssessmentOutreach] template fetch failed:', err));
  }, []);

  const template = templates.find((t) => t._id === templateId || t.id === templateId);
  const primaryCandidate = candidates.find((c) => c._id === selectedIds[0]) || candidates[0];
  const role = primaryCandidate ? roles.find((r) => r.code === primaryCandidate.roleCode) : null;

  // Total = template's own attachments + whatever was added for this send.
  const templateAttachmentCount = (template?.attachments || []).length;
  const totalAttachmentCount = templateAttachmentCount + linkAttachments.filter((a) => a.url).length + files.length;

  const vars = useMemo(() => {
    if (!primaryCandidate) return { candidateName: '', roleTitle: '', roleCode: '' };
    return {
      candidateName: primaryCandidate.fullName,
      roleTitle: role ? role.title : primaryCandidate.roleCode,
      roleCode: primaryCandidate.roleCode,
      formLink: buildFormLinkPreview(primaryCandidate.email)
    };
  }, [primaryCandidate, role]);

  const previewSubject = useMemo(() => (template ? fillTemplate(template.subject, vars) : ''), [template, vars]);
  const previewBody = useMemo(() => (template ? fillTemplate(template.body, vars) : ''), [template, vars]);

  const toggleCandidate = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const filteredCandidates = useMemo(() => {
    if (freelanceMode) {
      const f = freelanceFilters;
      // An F-prefixed role code is FREELANCE CODING regardless of stored employmentType.
      let data = candidates.filter(isFreelanceCandidate);
      if (f.roleCode) data = data.filter((c) => c.roleCode === f.roleCode);
      if (f.analyzerMinScore) data = data.filter((c) => Number(c.score?.suitabilityRating) >= Number(f.analyzerMinScore));
      if (f.screeningInterview) data = data.filter((c) => c.screeningInterview === f.screeningInterview);
      if (f.calendlyLinkSent) data = data.filter((c) => c.calendlyLinkSent === f.calendlyLinkSent);
      if (f.calendlyLinkStatus) data = data.filter((c) => c.calendlyLinkStatus === f.calendlyLinkStatus);
      if (f.ndaIca) data = data.filter((c) => c.ndaIca === f.ndaIca);
      if (f.slackStatus) data = data.filter((c) => c.slackStatus === f.slackStatus);
      if (f.bootcampAttempts) data = data.filter((c) => c.bootcampAttempts === f.bootcampAttempts);
      if (f.bootcampStatus) data = data.filter((c) => c.bootcampStatus === f.bootcampStatus);
      if (f.onboarding) data = data.filter((c) => c.onboarding === f.onboarding);
      if (f.project) data = data.filter((c) => c.project === f.project);
      if (f.projectStatus) data = data.filter((c) => c.projectStatus === f.projectStatus);
      return data;
    }
    return candidates.filter((c) =>
      (!empTypeFilter || effectiveEmploymentType(c) === empTypeFilter) &&
      (!roleFilter || c.roleCode === roleFilter) &&
      (!statusFilter || c.status === statusFilter));
  }, [candidates, freelanceMode, empTypeFilter, roleFilter, statusFilter, freelanceFilters]);

  const selectAllFiltered = () => setSelectedIds(filteredCandidates.map((c) => c._id));

  // Picking an F-prefixed role code anywhere switches the whole page into the
  // FREELANCE CODING view so the candidate is always handled with freelance filters.
  const handleRoleFilterChange = (value) => {
    setRoleFilter(value);
    if (isFreelanceRoleCode(value)) {
      setEmpTypeFilter('FREELANCE CODING');
      setFreelanceFilters((prev) => ({ ...prev, roleCode: value }));
    }
  };

  const handleEmpTypeFilterChange = (value) => {
    setEmpTypeFilter(value);
    if (value !== 'FREELANCE CODING' && value !== 'Contract') {
      setRoleFilter('');
      setFreelanceFilters((prev) => ({ ...prev, roleCode: '' }));
    }
  };

  const clearFilters = () => {
    setEmpTypeFilter('');
    setRoleFilter('');
    setStatusFilter('');
    setFreelanceFilters(EMPTY_FREELANCE_FILTERS);
  };

  const activeFilterCount = freelanceMode
    ? Object.values(freelanceFilters).filter(Boolean).length
    : [empTypeFilter, roleFilter, statusFilter].filter(Boolean).length;

  const roleOptionLabel = (r) => `${r.code} — ${r.title}${isFreelanceRoleCode(r.code) ? ' · Freelance Coding' : ''}`;

  const freelanceOptionSets = [
    { key: 'calendlyLinkSent', label: 'Calendly Link Sent', options: CALENDLY_SENT_OPTIONS },
    { key: 'calendlyLinkStatus', label: 'Calendly Link Status', options: CALENDLY_STATUS_OPTIONS },
    { key: 'screeningInterview', label: 'Screening Interview Status', options: SCREENING_INTERVIEW_OPTIONS },
    { key: 'ndaIca', label: 'NDA & ICA', options: NDA_ICA_OPTIONS },
    { key: 'slackStatus', label: 'Slack', options: SLACK_STATUS_OPTIONS },
    { key: 'bootcampAttempts', label: 'Bootcamp', options: BOOTCAMP_ATTEMPTS_OPTIONS },
    { key: 'bootcampStatus', label: 'Bootcamp Status', options: BOOTCAMP_STATUS_OPTIONS },
    { key: 'onboarding', label: 'Onboarding', options: ONBOARDING_OPTIONS },
    { key: 'projectStatus', label: 'Project Status', options: PROJECT_STATUS_OPTIONS }
  ];

  const handleSend = async () => {
    if (selectedIds.length === 0 || !template) return;
    setSending(true);
    setSendResult(null);
    try {
      // Template's own attachments (links + saved files) plus anything added
      // for this specific send — template first, so ad-hoc ones are additive.
      const templateLinks = (template.attachments || [])
        .filter((a) => a.type === 'link' && a.url)
        .map((a) => ({ name: a.name, url: a.url }));
      const templateFileIds = (template.attachments || [])
        .filter((a) => a.attachmentId)
        .map((a) => a.attachmentId);

      const attachments = [
        ...templateLinks,
        ...linkAttachments.filter((a) => a.url)
      ];
      // Ad-hoc files come first so their order matches what the recruiter sees.
      const attachmentIds = [...files.map((f) => f._id), ...templateFileIds];

      const res = await sendOutreachEmail(selectedIds, template.subject, template.body, attachments, attachmentIds);
      setSendResult({ ok: res.data.failedCount === 0, message: res.message, details: res.data.results });
    } catch (err) {
      setSendResult({ ok: false, message: err.message, details: [] });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Assessment &amp; Outreach</h1>
      <p className="page-sub">Select candidates, choose a template, and preview personalized outreach before sending — candidate list is live from the database</p>

      {loadError && <div className="alert alert-error">⚠️ {loadError}</div>}
      {sendResult && (
        <div className={`alert ${sendResult.ok ? 'alert-success' : 'alert-error'}`}>
          {sendResult.ok ? '✅' : '⚠️'} {sendResult.message}
          {sendResult.details.some((d) => !d.sent) && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {sendResult.details.filter((d) => !d.sent).slice(0, 5).map((d, i) => (
                <li key={i} style={{ fontSize: 12.5 }}>{d.email}: {d.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-500)' }}>Loading candidates...</p>
      ) : candidates.length === 0 ? (
        <p style={{ color: 'var(--text-500)' }}>No candidates in the pool yet — outreach needs at least one candidate to select.</p>
      ) : (
        <div className="outreach-page">
          <div className="card outreach-filters">
            <div className="outreach-filters-head">
              <div>
                <h3 style={{ fontSize: 15 }}>
                  Filters
                  {activeFilterCount > 0 && <span className="outreach-filter-count">{activeFilterCount}</span>}
                </h3>
                <span className="outreach-filters-sub">
                  Showing {filteredCandidates.length} of {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="outreach-filters-actions">
                <button className="btn-secondary" onClick={selectAllFiltered} disabled={filteredCandidates.length === 0}>
                  Select All Filtered
                </button>
                <button className="btn-secondary" onClick={() => setSelectedIds([])} disabled={selectedIds.length === 0}>
                  Clear Selection
                </button>
                <button className="btn-secondary" onClick={clearFilters} disabled={activeFilterCount === 0}>
                  Reset Filters
                </button>
              </div>
            </div>

            <div className="outreach-filter-grid">
              <div className={`outreach-filter-field${empTypeFilter ? ' is-set' : ''}`}>
                <label>Employment Type</label>
                <select value={empTypeFilter} onChange={(e) => handleEmpTypeFilterChange(e.target.value)}>
                  <option value="">All employment types</option>
                  <option value="Full-Time">Full Time</option>
                  <option value="Contract">Contractual</option>
                  <option value="Part-Time">Part Time</option>
                  <option value="FREELANCE CODING">Freelance Coding</option>
                </select>
              </div>

              {!freelanceMode && (
                <>
                  <div className={`outreach-filter-field${roleFilter ? ' is-set' : ''}`}>
                    <label>Role Code</label>
                    <select value={roleFilter} onChange={(e) => handleRoleFilterChange(e.target.value)}>
                      <option value="">All role codes</option>
                      {roles.map((r) => <option key={r.code} value={r.code}>{roleOptionLabel(r)}</option>)}
                    </select>
                  </div>
                  <div className={`outreach-filter-field${statusFilter ? ' is-set' : ''}`}>
                    <label>Status</label>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="">All statuses</option>
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </>
              )}

              {freelanceMode && (
                <>
                  <div className={`outreach-filter-field${freelanceFilters.roleCode ? ' is-set' : ''}`}>
                    <label>Role Code</label>
                    <select value={freelanceFilters.roleCode} onChange={(e) => setFreelanceFilters({ ...freelanceFilters, roleCode: e.target.value })}>
                      <option value="">All role codes</option>
                      {roles.map((r) => <option key={r.code} value={r.code}>{roleOptionLabel(r)}</option>)}
                    </select>
                  </div>
                  <div className="outreach-filter-field">
                    <label>Resume Analyzer Status (score ≥)</label>
                    <input
                      type="number" min="0" max="10"
                      className={freelanceFilters.analyzerMinScore ? 'is-set' : ''}
                      placeholder="e.g. 7"
                      value={freelanceFilters.analyzerMinScore}
                      onChange={(e) => setFreelanceFilters({ ...freelanceFilters, analyzerMinScore: e.target.value })}
                    />
                  </div>
                  {freelanceOptionSets.map(({ key, label, options }) => (
                    <div key={key} className={`outreach-filter-field${freelanceFilters[key] ? ' is-set' : ''}`}>
                      <label>{label}</label>
                      <select value={freelanceFilters[key]} onChange={(e) => setFreelanceFilters({ ...freelanceFilters, [key]: e.target.value })}>
                        <option value="">All</option>
                        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  ))}
                  <div className={`outreach-filter-field${freelanceFilters.project ? ' is-set' : ''}`}>
                    <label>Project</label>
                    <select value={freelanceFilters.project} onChange={(e) => setFreelanceFilters({ ...freelanceFilters, project: e.target.value })}>
                      <option value="">All</option>
                      {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="outreach-layout">
            <div className="card">
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Select Candidates ({selectedIds.length})</h3>
              <div className="candidate-select-list">
                {filteredCandidates.map((c) => (
                  <label key={c._id} className={'candidate-select-item' + (selectedIds.includes(c._id) ? ' selected' : '')}>
                    <input type="checkbox" checked={selectedIds.includes(c._id)} onChange={() => toggleCandidate(c._id)} />
                    <div>
                      <strong>{c.fullName}</strong>
                      <div style={{ fontSize: 11.5, color: 'var(--text-500)' }}>
                        {c.roleCode} · {freelanceMode ? `Analyzer ${c.score?.suitabilityRating ?? '—'}` : typeLabel(effectiveEmploymentType(c))} · {c.status}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Email Template Builder</h3>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)' }}>Template</label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', margin: '6px 0 14px' }}>
                {templates.map((t) => <option key={t._id || t.id} value={t._id || t.id}>{t.name}</option>)}
              </select>

            <div className="template-vars">
              <span className="var-chip">{'{{candidateName}}'}</span>
              <span className="var-chip">{'{{roleTitle}}'}</span>
            </div>

            {uploadError && (
              <div className="alert alert-error" style={{ marginTop: 10 }}>⚠️ {uploadError}</div>
            )}

            {/* Attachments: links (rendered in the body) and real files from the
                recruiter's device (delivered as actual email attachments). */}
            <div className="outreach-attachments">
              <div className="outreach-attachments-head">
                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)', margin: 0 }}>
                  Attachments {totalAttachmentCount > 0 && <span className="outreach-filter-count">{totalAttachmentCount}</span>}
                </label>
                {(linkAttachments.length > 0 || files.length > 0) && (
                  <button type="button" className="outreach-attachments-clear" onClick={clearAttachments}>Clear all</button>
                )}
              </div>

              <p style={{ fontSize: 11.5, color: 'var(--text-500)', margin: '4px 0 10px' }}>
                Links appear as clickable text in the email. Files are sent as real attachments (max 10 files, 10MB each, 30MB total).
              </p>

              {/* Files from device */}
              <div className="outreach-file-list">
                {files.map((f) => (
                  <div key={f._id} className="outreach-file-chip">
                    <span className="outreach-file-icon">📎</span>
                    <span className="outreach-file-name" title={f.name}>{f.name}</span>
                    <span className="outreach-file-size">{formatSize(f.size)}</span>
                    <button type="button" onClick={() => removeFile(f._id)} title="Remove attachment">×</button>
                  </div>
                ))}
              </div>
              <div className="outreach-attachment-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFilesSelected}
                />
                <button type="button" className="btn-secondary" onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={uploading}>
                  {uploading ? 'Uploading...' : '⭱ Add files from device'}
                </button>
                <button type="button" className="btn-secondary" onClick={addLinkAttachment}>+ Add link</button>
              </div>

              {/* Link attachments */}
              {linkAttachments.map((a, i) => (
                <div key={i} className="outreach-link-row">
                  <input
                    type="text"
                    value={a.name}
                    onChange={(e) => updateLinkAttachment(i, 'name', e.target.value)}
                    placeholder="Label (e.g. Job Description)"
                  />
                  <input
                    type="url"
                    value={a.url}
                    onChange={(e) => updateLinkAttachment(i, 'url', e.target.value)}
                    placeholder="https://..."
                  />
                  <button type="button" onClick={() => removeLinkAttachment(i)} title="Remove link">×</button>
                </div>
              ))}

              {/* Re-use a previously uploaded file */}
              {storedAttachments.length > 0 && (
                <details className="outreach-stored-files">
                  <summary>Re-use a previously uploaded file ({storedAttachments.length})</summary>
                  <div className="outreach-stored-list">
                    {storedAttachments.map((s) => {
                      const alreadyAdded = files.some((f) => f._id === s._id);
                      return (
                        <div key={s._id} className="outreach-stored-item">
                          <span className="outreach-file-name" title={s.name}>{s.name}</span>
                          <span className="outreach-file-size">{formatSize(s.size)}</span>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={alreadyAdded}
                            onClick={async () => {
                              setFiles((prev) => [...prev, s]);
                            }}
                          >
                            {alreadyAdded ? 'Added' : 'Add'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}

              {totalAttachmentCount === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-500)', margin: '6px 0 0' }}>
                  No attachments for this send yet.
                </p>
              )}
            </div>


              {primaryCandidate && (
                <>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-500)', marginTop: 10 }}>
                    Preview — {selectedIds.length} recipient{selectedIds.length !== 1 ? 's' : ''} (showing first: {primaryCandidate.fullName})
                  </div>
                  <div className="email-preview">
                    <strong>Subject:</strong> {previewSubject}
                    {'\n\n'}
                    {previewBody}
                    {(() => {
                      const allLinks = [
                        ...(template?.attachments || []).filter((a) => a.type === 'link' && a.url).map((a) => ({ name: a.name, url: a.url })),
                        ...linkAttachments.filter((a) => a.url)
                      ];
                      if (allLinks.length > 0) {
                        return (
                          <>
                            {'\n\n'}
                            <strong>Attachments:</strong>
                            {'\n'}
                            {allLinks.map((a, i) => (
                              <span key={i}>– {a.name || a.url}: {a.url}{i < allLinks.length - 1 ? '\n' : ''}</span>
                            ))}
                          </>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  {(files.length > 0 || (template?.attachments || []).some((a) => a.attachmentId)) && (
                    <div className="outreach-preview-files">
                      <strong style={{ fontSize: 12.5, color: 'var(--text-500)' }}>
                        Files sent with this email ({files.length + (template?.attachments || []).filter((a) => a.attachmentId).length}):
                      </strong>
                      <div className="outreach-file-list" style={{ marginTop: 6 }}>
                        {files.map((f) => (
                          <div key={f._id} className="outreach-file-chip">
                            <span className="outreach-file-icon">📎</span>
                            <span className="outreach-file-name" title={f.name}>{f.name}</span>
                            <span className="outreach-file-size">{formatSize(f.size)}</span>
                          </div>
                        ))}
                        {(template?.attachments || []).filter((a) => a.attachmentId).map((a, i) => (
                          <div key={`t${i}`} className="outreach-file-chip">
                            <span className="outreach-file-icon">📎</span>
                            <span className="outreach-file-name" title={a.name}>{a.name}</span>
                            <span className="outreach-file-size">{formatSize(a.size)}</span>
                            <span className="outreach-file-from-template" title="Saved on the template">template</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="actions-row section-gap">
                <button className="btn-primary" onClick={handleSend} disabled={sending || selectedIds.length === 0}>
                  {sending ? 'Sending...' : `Send to ${selectedIds.length} Candidate${selectedIds.length !== 1 ? 's' : ''}`}
                </button>
                <button className="btn-secondary" onClick={() => setShowTemplateManager(!showTemplateManager)}>
                  {showTemplateManager ? 'Hide Manager' : 'Manage Templates'}
                </button>
              </div>
            </div>

            {showTemplateManager && (
              <TemplateManager onClose={() => setShowTemplateManager(false)} templates={templates} setTemplates={setTemplates} onTemplateSelect={(id) => setTemplateId(id)} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default AssessmentOutreach;